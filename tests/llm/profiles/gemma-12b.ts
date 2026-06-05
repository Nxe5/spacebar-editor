import type { ResolvedModelSettings } from "../../src/lib/modelSettings";

export type EvalProfile = {
  id: string;
  label: string;
  /** Default Ollama model tag when EVAL_PROFILE is set and EVAL_MODEL is unset. */
  model: string;
  modelSettings: ResolvedModelSettings;
  timeouts: {
    firstToken: number;
    fullResponse: number;
    toolCall: number;
    agentRun: number;
  };
  repetitions: {
    basic: number;
    code: number;
    agent: number;
    stress: number;
  };
  maxAgentSteps: number;
  /** Suite IDs included in --smoke for this profile. */
  smokeSuiteIds: string[];
  /** Recommended Spacebar Editor app settings for this model (documentation + analysis output). */
  recommendedAppSettings: {
    toolCallFormat: "native" | "text_fallback";
    promptVerbosity: "standard" | "detailed";
    parallelToolCalls: boolean;
    contextWindow: number;
    notes: string[];
  };
};

/** Unsloth Gemma 4 12B IT — text-only tool calls, slow on consumer hardware. */
export const GEMMA_12B_PROFILE: EvalProfile = {
  id: "gemma-12b",
  label: "Unsloth Gemma 4 12B IT (Q8_0)",
  model: "hf.co/unsloth/gemma-4-12b-it-GGUF:Q8_0",
  modelSettings: {
    contextWindow: 32_768,
    toolCallFormat: "text_fallback",
    parallelToolCalls: false,
    promptVerbosity: "detailed",
  },
  timeouts: {
    firstToken: 180_000,
    fullResponse: 900_000,
    toolCall: 180_000,
    agentRun: 1_800_000,
  },
  repetitions: {
    basic: 2,
    code: 1,
    agent: 1,
    stress: 2,
  },
  maxAgentSteps: 12,
  smokeSuiteIds: [
    "16-gemma-tool-calling",
    "01-chat-basic",
    "08-agent-files",
    "10-agent-fix",
    "17-gemma-local-project",
  ],
  recommendedAppSettings: {
    toolCallFormat: "text_fallback",
    promptVerbosity: "detailed",
    parallelToolCalls: false,
    contextWindow: 32_768,
    notes: [
      "Ollama reports completion+vision only — no native tool_calls API.",
      "Use Agent mode with text fallback; disable parallel tool calls.",
      "Prefer grep over LSP until LSP eval coverage ships (desktop-only today).",
      "Expect 30s–3min per agent step on 12B Q8; use Detailed verbosity.",
      "For large repos: enable compaction, keep read_file cap at 500 lines.",
      "If tool calls fail: check Settings → Model → Tool format = Text fallback.",
    ],
  },
};

export const EVAL_PROFILES: Record<string, EvalProfile> = {
  "gemma-12b": GEMMA_12B_PROFILE,
};

export function resolveProfile(id: string | undefined): EvalProfile | undefined {
  if (!id) return undefined;
  return EVAL_PROFILES[id];
}
