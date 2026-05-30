import { describe, expect, it } from "vitest";
import { TOOL_DEFINITIONS } from "../../src/lib/tools/toolDefinitions";
import { buildToolUseInstruction } from "../../src/lib/agent/systemPrompt/toolInstructions";
import { getModeBasePrompt } from "../../src/lib/stores/mode";
import { streamOneTurn } from "../../src/lib/agent/streamTurn";
import {
  formatToolProbeFailure,
  probeToolCallsFromTurn,
} from "../../src/lib/agent/toolCallProbe";
import {
  listOllamaModels,
  ollamaHost,
  ollamaReachable,
  resolveOllamaToolTestModels,
} from "./helpers/ollama";

const RUN = process.env.RUN_OLLAMA_TESTS === "1";
const describeOllama = RUN ? describe : describe.skip;

const PROBE_TOOL = "get_git_status";
const ALLOWED = new Set([PROBE_TOOL]);
const GIT_STATUS_TOOL = TOOL_DEFINITIONS[PROBE_TOOL];

const NATIVE_SYSTEM = `${getModeBasePrompt("agent")}

${buildToolUseInstruction({
  verbosity: "standard",
  parallelToolCalls: false,
  textFallback: false,
})}`;

const TEXT_FALLBACK_SYSTEM = `${getModeBasePrompt("agent")}

${buildToolUseInstruction({
  verbosity: "detailed",
  parallelToolCalls: false,
  textFallback: true,
})}`;

const USER_PROMPT =
  "Call get_git_status exactly once to inspect the repository. Do not write a final answer until after the tool runs. Use only a tool call in this turn.";

const host = ollamaHost();
const models: string[] = RUN
  ? await (async () => {
      if (!(await ollamaReachable(host))) {
        throw new Error(`Ollama not reachable at ${host}. Start Ollama or set OLLAMA_HOST.`);
      }
      return resolveOllamaToolTestModels(host);
    })()
  : [];

async function probeModelToolCalling(model: string) {
  const messages = [{ role: "user" as const, content: USER_PROMPT }];

  const nativeTurn = await streamOneTurn({
    backend: "ollama",
    apiKey: "",
    baseUrl: host,
    model,
    systemPrompt: NATIVE_SYSTEM,
    messages,
    tools: [GIT_STATUS_TOOL],
    signal: AbortSignal.timeout(180_000),
  });

  let probe = probeToolCallsFromTurn(nativeTurn.content, nativeTurn.toolCalls, ALLOWED);

  if (probe.totalCallable === 0) {
    const textTurn = await streamOneTurn({
      backend: "ollama",
      apiKey: "",
      baseUrl: host,
      model,
      systemPrompt: TEXT_FALLBACK_SYSTEM,
      messages,
      tools: undefined,
      signal: AbortSignal.timeout(180_000),
    });
    probe = probeToolCallsFromTurn(textTurn.content, textTurn.toolCalls, ALLOWED);
  }

  return probe;
}

describeOllama("Ollama tool calling (integration)", () => {
  it("lists installed models for reference", async () => {
    const installed = await listOllamaModels(host);
    expect(installed.length).toBeGreaterThan(0);
  });

  it.each(models)(
    "native API tool_calls or text-fallback recovery: %s",
    async (model) => {
      const probe = await probeModelToolCalling(model);
      if (probe.totalCallable === 0) {
        throw new Error(formatToolProbeFailure(model, probe));
      }
      expect(probe.totalCallable).toBeGreaterThan(0);
    },
    360_000
  );
});
