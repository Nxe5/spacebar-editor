import { listOllamaModels, ollamaReachable } from "../integration/helpers/ollama";
import { EVAL_CONFIG } from "./config";
import { runAgentTest, runChatTest, resolveRepetitions } from "./run-test";
import { ResultsWriter } from "./results-writer";
import type { EvalRunContext, LLMSuite, LLMTestCase, LLMTestResult } from "./types";

function resolveTimeouts(test: LLMTestCase): (typeof EVAL_CONFIG)["timeouts"] {
  if (test.tags.includes("project-build")) {
    return {
      ...EVAL_CONFIG.timeouts,
      agentRun: Math.max(EVAL_CONFIG.timeouts.agentRun, 3_600_000),
      fullResponse: Math.max(EVAL_CONFIG.timeouts.fullResponse, 1_200_000),
    };
  }
  return EVAL_CONFIG.timeouts;
}

export async function preflightCheck(): Promise<void> {
  const host = EVAL_CONFIG.ollamaBaseUrl.replace(/\/$/, "");
  if (!(await ollamaReachable(host))) {
    throw new Error(`Ollama not reachable at ${host} — is it running?`);
  }
  const models = await listOllamaModels(host);
  const model = EVAL_CONFIG.model;
  const found = models.some(
    (m) => m === model || m.startsWith(`${model}:`) || model.startsWith(m) || m.includes(model)
  );
  if (!found) {
    const hint = model.includes("/") ? model : `ollama pull ${model.split(":")[0]}`;
    throw new Error(`Model ${model} not found. Available: ${models.slice(0, 5).join(", ")}… Run: ${hint}`);
  }
}

export async function runSuite(
  suite: LLMSuite,
  options: {
    writer: ResultsWriter;
    runId: string;
    ctx: EvalRunContext;
    filterTestId?: string;
    filterMode?: string;
  }
): Promise<LLMTestResult[]> {
  const results: LLMTestResult[] = [];

  for (const test of suite.tests) {
    if (options.filterTestId && test.id !== options.filterTestId) continue;
    if (options.filterMode && test.mode !== options.filterMode) continue;

    const reps = resolveRepetitions(test, EVAL_CONFIG.repetitions);
    const timeouts = resolveTimeouts(test);
    for (let i = 1; i <= reps; i++) {
      console.log(`  ▶ ${test.id} (run ${i}/${reps})`);
      const result =
        test.mode === "chat"
          ? await runChatTest({
              test,
              runIndex: i,
              model: EVAL_CONFIG.model,
              ollamaBaseUrl: EVAL_CONFIG.ollamaBaseUrl,
              workspacePath: options.ctx.workspacePath,
              modelSettings: EVAL_CONFIG.modelSettings,
              timeouts,
            })
          : await runAgentTest({
              test,
              runIndex: i,
              model: EVAL_CONFIG.model,
              ollamaBaseUrl: EVAL_CONFIG.ollamaBaseUrl,
              workspacePath: options.ctx.workspacePath,
              modelSettings: EVAL_CONFIG.modelSettings,
              timeouts,
              maxAgentSteps: test.maxAgentSteps ?? EVAL_CONFIG.maxAgentSteps,
              ctx: options.ctx,
            });

      results.push(result);
      await options.writer.appendSuiteResult(options.runId, suite.id, result);
      console.log(`    ${result.status} (${(result.durationMs / 1000).toFixed(1)}s)`);
    }
  }

  return results;
}
