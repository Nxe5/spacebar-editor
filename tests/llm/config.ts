import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PROVIDER_MODEL_DEFAULTS } from "../../src/lib/modelSettings";
import type { ResolvedModelSettings } from "../../src/lib/modelSettings";
import { resolveProfile } from "./profiles";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const profile = resolveProfile(process.env.EVAL_PROFILE);

const defaultModelSettings: ResolvedModelSettings = {
  ...DEFAULT_PROVIDER_MODEL_DEFAULTS.ollama,
};

export const EVAL_CONFIG = {
  profileId: profile?.id ?? null,
  profileLabel: profile?.label ?? null,
  model: process.env.EVAL_MODEL ?? profile?.model ?? "qwen3.6-27B-GGUF:UD-Q2_K_XL",
  ollamaBaseUrl: process.env.OLLAMA_HOST ?? "http://localhost:11434",
  modelSettings: profile?.modelSettings ?? defaultModelSettings,
  timeouts: profile?.timeouts ?? {
    firstToken: 120_000,
    fullResponse: 600_000,
    toolCall: 120_000,
    agentRun: 900_000,
  },
  repetitions: profile?.repetitions ?? {
    basic: 3,
    code: 2,
    agent: 2,
    stress: 5,
  },
  maxAgentSteps: profile?.maxAgentSteps ?? 10,
  smokeSuiteIds: profile?.smokeSuiteIds ?? [],
  recommendedAppSettings: profile?.recommendedAppSettings ?? null,
  resultsDir: path.join(ROOT, "tests/llm/results"),
  fixturesDir: path.join(ROOT, "tests/llm/fixtures/workspace"),
  repoRoot: ROOT,
} as const;

export type EvalConfig = typeof EVAL_CONFIG;
