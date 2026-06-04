import type { Message as ProviderMessage } from "../../src/lib/providers/openaiCompat";
import type { Tool } from "../../src/lib/providers/openaiCompat";

export type ArtifactCheck = {
  id: string;
  pass: boolean;
  detail?: string;
};

export type ProjectVerifyResult = {
  pass: boolean;
  message?: string;
  score: number;
  checks: ArtifactCheck[];
};

export type EvalMode = "chat" | "plan" | "agent";

export interface EvalMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LLMTestCase {
  id: string;
  suite: string;
  mode: EvalMode;
  description: string;
  messages: EvalMessage[];
  systemPrompt?: string;
  tools?: string[];
  expectedBehavior: string;
  tags: string[];
  repeat?: number;
  /** Category for analysis grouping (e.g. tool-calling, local-project). */
  category?: string;
  /** Include in profile smoke runs when tagged gemma-smoke. */
  smoke?: boolean;
  /** Run before this test (e.g. seed plan files). */
  setup?: (ctx: EvalRunContext) => Promise<void>;
  /** Expected tool names for agent/plan tests (objective pass/fail signal). */
  expectedTools?: string[];
  /** Override harness max agent steps (project builds need more). */
  maxAgentSteps?: number;
  /** Objective artifact checks after the run (HTML structure, files on disk, etc.). */
  verify?: (ctx: EvalRunContext) => Promise<ProjectVerifyResult>;
}

export interface LLMSuite {
  id: string;
  title: string;
  tests: LLMTestCase[];
}

export interface ToolCallRecord {
  toolName: string;
  args: Record<string, unknown>;
  result: string;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
  /** True when the call was recovered from assistant text (text fallback). */
  recoveredFromText?: boolean;
}

export interface LLMTestMetrics {
  textToolRecoveries: number;
  toolSuccessRate: number;
  avgToolDurationMs: number;
  failedToolNames: string[];
}

export interface LLMTestResult {
  testId: string;
  suite: string;
  mode: string;
  description: string;
  runIndex: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  response: string;
  tokenCount?: number;
  firstTokenMs?: number;
  toolCalls?: ToolCallRecord[];
  agentSteps?: number;
  status: "pass" | "fail" | "timeout" | "error";
  errorMessage?: string;
  humanScore?: 1 | 2 | 3 | 4 | 5;
  humanNotes?: string;
  metrics?: LLMTestMetrics;
  /** Objective artifact verification (project build suites). */
  artifactChecks?: ArtifactCheck[];
  artifactScore?: number;
}

export interface EvalRunContext {
  workspacePath: string;
  fixturesDir: string;
  resultsDir: string;
}

export interface RunTestOptions {
  test: LLMTestCase;
  runIndex: number;
  model: string;
  ollamaBaseUrl: string;
  workspacePath: string;
  timeouts: {
    firstToken: number;
    fullResponse: number;
    toolCall: number;
    agentRun: number;
  };
  maxAgentSteps: number;
  tools?: Tool[];
  toolNames?: string[];
}

export type ProviderMessageHistory = ProviderMessage[];
