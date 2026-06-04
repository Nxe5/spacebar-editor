import fs from "node:fs/promises";
import path from "node:path";
import { parseToolInput } from "../../src/lib/agent/activity";
import {
  appendAssistantToolCalls,
  appendToolResults,
  buildProviderMessages,
} from "../../src/lib/agent/conversation";
import { recoverToolCallsFromText } from "../../src/lib/agent/textToolCalls";
import { streamOneTurn } from "../../src/lib/agent/streamTurn";
import { getModeTools } from "../../src/lib/stores/mode";
import { usesNativeToolCalls, type ResolvedModelSettings } from "../../src/lib/modelSettings";
import { getToolsForNames } from "../../src/lib/tools/toolDefinitions";
import type { Message as ChatMessage, StoredToolCall } from "../../src/lib/stores/chat";
import { shouldContinueAgentStep } from "../../src/lib/agentLimits";
import { resolveEvalSystemPrompt } from "./eval-prompt";
import { executeEvalTool, type EvalToolContext } from "./eval-tool-runner";
import type { EvalRunContext, LLMTestCase, LLMTestMetrics, LLMTestResult, ToolCallRecord } from "./types";

function planExists(workspacePath: string): Promise<boolean> {
  return fs
    .readdir(path.join(workspacePath, "plans"))
    .then((files) => files.some((f) => f.endsWith(".md")))
    .catch(() => false);
}

function resolveRepetitions(test: LLMTestCase, repetitions: Record<string, number>): number {
  if (test.repeat != null) return test.repeat;
  if (test.mode === "chat") {
    if (test.tags.includes("stress")) return repetitions.stress;
    if (test.tags.includes("code")) return repetitions.code;
    return repetitions.basic;
  }
  if (test.mode === "plan") return repetitions.agent;
  if (test.tags.includes("project-build")) return 1;
  if (test.tags.includes("stress")) return repetitions.stress;
  return repetitions.agent;
}

function buildMetrics(toolCalls: ToolCallRecord[], textToolRecoveries: number): LLMTestMetrics | undefined {
  if (toolCalls.length === 0) return undefined;
  const successes = toolCalls.filter((t) => t.success).length;
  const failedToolNames = [...new Set(toolCalls.filter((t) => !t.success).map((t) => t.toolName))];
  return {
    textToolRecoveries,
    toolSuccessRate: successes / toolCalls.length,
    avgToolDurationMs: toolCalls.reduce((s, t) => s + t.durationMs, 0) / toolCalls.length,
    failedToolNames,
  };
}

function resolveToolNames(test: LLMTestCase): string[] {
  if (test.tools?.length) return test.tools;
  if (test.mode === "agent") return getModeTools("agent");
  if (test.mode === "plan") {
    return [...getModeTools("plan"), "write_file", "create_file"];
  }
  return [];
}

function toChatHistory(messages: LLMTestCase["messages"]): ChatMessage[] {
  return messages.map((m) => ({
    id: crypto.randomUUID(),
    role: m.role,
    content: m.content,
  }));
}

function classifyOutcome(input: {
  response: string;
  error?: string;
  timedOut: boolean;
  toolCalls: ToolCallRecord[];
  expectedTools?: string[];
  mode: LLMTestCase["mode"];
  workspacePath: string;
  planFileCreated: boolean;
}): { status: LLMTestResult["status"]; errorMessage?: string } {
  if (input.timedOut) return { status: "timeout", errorMessage: "Response timed out" };
  if (input.error) return { status: "error", errorMessage: input.error };
  if (!input.response.trim()) return { status: "fail", errorMessage: "Empty response" };

  if (input.mode === "agent" || input.mode === "plan") {
    if (input.expectedTools?.length) {
      const called = new Set(input.toolCalls.map((t) => t.toolName));
      const missing = input.expectedTools.filter((t) => !called.has(t));
      if (missing.length > 0 && input.toolCalls.length === 0) {
        return {
          status: "fail",
          errorMessage: "Expected tool use but no tools were called",
        };
      }
    }
    if (input.mode === "plan" && !input.planFileCreated && input.toolCalls.some((t) => t.toolName.includes("file"))) {
      /* plan may have been updated not created — check below */
    }
  }

  if (input.mode === "plan" && input.expectedTools?.some((t) => t.includes("file"))) {
    if (!input.planFileCreated) {
      return { status: "fail", errorMessage: "Expected plans/*.md file was not created" };
    }
  }

  return { status: "pass" };
}

async function executeToolCalls(
  toolCalls: StoredToolCall[],
  workspacePath: string,
  ctx: EvalToolContext,
  timeoutMs: number
): Promise<ToolCallRecord[]> {
  const records: ToolCallRecord[] = [];
  for (const tc of toolCalls) {
    const started = Date.now();
    const args = parseToolInput(tc.arguments);
    let result: ToolCallRecord;
    try {
      const out = await Promise.race([
        executeEvalTool(tc.name, args, workspacePath, { ...ctx, toolTimeoutMs: timeoutMs }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Tool call timed out after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);
      result = {
        toolName: tc.name,
        args,
        result: out.output,
        durationMs: Date.now() - started,
        success: out.success,
        errorMessage: out.success ? undefined : out.output,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result = {
        toolName: tc.name,
        args,
        result: msg,
        durationMs: Date.now() - started,
        success: false,
        errorMessage: msg,
      };
    }
    records.push(result);
  }
  return records;
}

export async function runChatTest(input: {
  test: LLMTestCase;
  runIndex: number;
  model: string;
  ollamaBaseUrl: string;
  workspacePath: string;
  modelSettings: ResolvedModelSettings;
  timeouts: { firstToken: number; fullResponse: number };
}): Promise<LLMTestResult> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  let firstTokenMs: number | undefined;
  let response = "";
  let tokenCount: number | undefined;
  let error: string | undefined;
  let timedOut = false;

  const history = toChatHistory(input.test.messages);
  const systemPrompt = resolveEvalSystemPrompt({
    test: input.test,
    workspacePath: input.workspacePath,
    modelSettings: input.modelSettings,
  });
  const providerMessages = buildProviderMessages(systemPrompt, history);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeouts.fullResponse);

  try {
    const turn = await streamOneTurn({
      backend: "ollama",
      apiKey: "",
      baseUrl: input.ollamaBaseUrl,
      model: input.model,
      systemPrompt,
      messages: providerMessages,
      signal: controller.signal,
      inferenceOptions: { num_ctx: input.modelSettings.contextWindow },
      onDelta: () => {
        if (firstTokenMs == null) firstTokenMs = Date.now() - t0;
      },
    });
    response = turn.content;
    if (turn.thinking) response = turn.thinking + "\n\n" + response;
    tokenCount = turn.usage?.completion_tokens;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (controller.signal.aborted) timedOut = true;
    else error = msg;
  } finally {
    clearTimeout(timer);
  }

  const outcome = classifyOutcome({
    response,
    error,
    timedOut,
    toolCalls: [],
    mode: input.test.mode,
    workspacePath: input.workspacePath,
    planFileCreated: false,
  });

  return {
    testId: input.test.id,
    suite: input.test.suite,
    mode: input.test.mode,
    description: input.test.description,
    runIndex: input.runIndex,
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    response,
    tokenCount,
    firstTokenMs,
    status: outcome.status,
    errorMessage: outcome.errorMessage,
  };
}

export async function runAgentTest(input: {
  test: LLMTestCase;
  runIndex: number;
  model: string;
  ollamaBaseUrl: string;
  workspacePath: string;
  modelSettings: ResolvedModelSettings;
  timeouts: { firstToken: number; fullResponse: number; toolCall: number; agentRun: number };
  maxAgentSteps: number;
  ctx: EvalRunContext;
}): Promise<LLMTestResult> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  let firstTokenMs: number | undefined;
  let response = "";
  let tokenCount: number | undefined;
  let error: string | undefined;
  let timedOut = false;
  const allToolCalls: ToolCallRecord[] = [];
  let textToolRecoveries = 0;
  let agentSteps = 0;

  if (input.test.setup) {
    await input.test.setup(input.ctx);
  }

  const toolNames = resolveToolNames(input.test);
  const tools = getToolsForNames(toolNames);
  const allowed = new Set(toolNames);
  const modelSettings = input.modelSettings;
  const nativeTools = usesNativeToolCalls(modelSettings);
  const systemPrompt = resolveEvalSystemPrompt({
    test: input.test,
    workspacePath: input.workspacePath,
    modelSettings,
  });
  const toolCtx: EvalToolContext = {
    readFileMaxLines: 500,
    writePrefix: input.test.mode === "plan" ? "plans" : undefined,
    toolTimeoutMs: input.timeouts.toolCall,
  };

  let history = toChatHistory(input.test.messages);
  let providerMessages = buildProviderMessages(systemPrompt, history);
  const agentLimits = {
    maxAgentSteps: input.test.maxAgentSteps ?? input.maxAgentSteps,
    maxToolCallsPerRun: 0,
    maxToolsPerTurn: 0,
  };

  const runDeadline = t0 + input.timeouts.agentRun;

  try {
    while (shouldContinueAgentStep(agentSteps, agentLimits)) {
      if (Date.now() > runDeadline) {
        timedOut = true;
        break;
      }

      const controller = new AbortController();
      const turnTimer = setTimeout(() => controller.abort(), input.timeouts.fullResponse);

      let turn;
      try {
        turn = await streamOneTurn({
          backend: "ollama",
          apiKey: "",
          baseUrl: input.ollamaBaseUrl,
          model: input.model,
          systemPrompt,
          messages: providerMessages,
          tools: nativeTools && tools.length > 0 ? tools : undefined,
          signal: controller.signal,
          inferenceOptions: { num_ctx: modelSettings.contextWindow },
          onDelta: () => {
            if (firstTokenMs == null) firstTokenMs = Date.now() - t0;
          },
        });
      } finally {
        clearTimeout(turnTimer);
      }

      if (turn!.usage?.completion_tokens) {
        tokenCount = (tokenCount ?? 0) + turn!.usage.completion_tokens;
      }

      let activeToolCalls = turn!.toolCalls;
      let turnContent = turn!.content;

      let recoveredThisRound = false;
      if (activeToolCalls.length === 0 && allowed.size > 0) {
        const recovered = recoverToolCallsFromText(turnContent, allowed);
        if (recovered.calls.length > 0) {
          activeToolCalls = recovered.calls;
          turnContent = recovered.cleanedText;
          textToolRecoveries += recovered.calls.length;
          recoveredThisRound = true;
        }
      }

      if (activeToolCalls.length === 0) {
        response = turnContent;
        if (turn!.thinking) response = turn!.thinking + "\n\n" + response;
        break;
      }

      history = [
        ...history,
        {
          id: crypto.randomUUID(),
          role: "assistant" as const,
          content: turnContent,
          rawToolCalls: activeToolCalls,
        },
      ];
      providerMessages = appendAssistantToolCalls(providerMessages, turnContent, activeToolCalls);

      const roundRecords = await executeToolCalls(
        activeToolCalls,
        input.workspacePath,
        toolCtx,
        input.timeouts.toolCall
      );
      for (const r of roundRecords) {
        if (recoveredThisRound) r.recoveredFromText = true;
      }
      allToolCalls.push(...roundRecords);

      for (const r of roundRecords) {
        history.push({
          id: crypto.randomUUID(),
          role: "tool",
          content: r.result,
          toolCallId: `tc-${allToolCalls.length}`,
          toolName: r.toolName,
          toolInput: r.args,
          toolSuccess: r.success,
        });
      }

      providerMessages = appendToolResults(
        providerMessages,
        roundRecords.map((r, i) => ({
          id: activeToolCalls[i]?.id ?? `tc-${i}`,
          content: r.result,
        }))
      );

      agentSteps += 1;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    error = msg;
  }

  const planFileCreated = await planExists(input.workspacePath);
  let outcome = classifyOutcome({
    response,
    error,
    timedOut,
    toolCalls: allToolCalls,
    expectedTools: input.test.expectedTools,
    mode: input.test.mode,
    workspacePath: input.workspacePath,
    planFileCreated,
  });

  let artifactChecks: LLMTestResult["artifactChecks"];
  let artifactScore: number | undefined;
  if (input.test.verify && !error) {
    try {
      const verified = await input.test.verify(input.ctx);
      artifactChecks = verified.checks;
      artifactScore = verified.score;
      if (outcome.status === "pass" && !verified.pass) {
        outcome = {
          status: "fail",
          errorMessage: verified.message ?? `Artifact verification failed (${verified.score}%)`,
        };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      outcome = { status: "error", errorMessage: `Verify hook failed: ${msg}` };
    }
  }

  return {
    testId: input.test.id,
    suite: input.test.suite,
    mode: input.test.mode,
    description: input.test.description,
    runIndex: input.runIndex,
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    response,
    tokenCount,
    firstTokenMs,
    toolCalls: allToolCalls.length ? allToolCalls : undefined,
    agentSteps: agentSteps || undefined,
    metrics: buildMetrics(allToolCalls, textToolRecoveries),
    artifactChecks,
    artifactScore,
    status: outcome.status,
    errorMessage: outcome.errorMessage,
  };
}

export { resolveRepetitions, resolveToolNames };
