/** Configurable caps for the agent loop (one user message → multi-step tool chain). */

import { READ_ONLY_TOOLS } from "./tools/toolDefinitions";

export type AgentLimitsBackend = "anthropic" | "deepseek" | "ollama" | "llamacpp";

export type AgentLimits = {
  /** LLM ↔ tool round trips per user message. 0 = unlimited. */
  maxAgentSteps: number;
  /** Total tool executions across all steps for one user message. 0 = unlimited. */
  maxToolCallsPerRun: number;
  /** Tool calls allowed from a single model response. 0 = unlimited. */
  maxToolsPerTurn: number;
  /** Run independent read-only tools concurrently within a single model turn. */
  parallelExecution: boolean;
  /** Maximum number of tools to run concurrently when parallelExecution is enabled. */
  maxConcurrentTools: number;
  /** Per-request timeout for LSP agent queries (ms). */
  lspToolTimeout: number;
  /** Timeout for workspace/symbol LSP queries (ms). */
  lspWorkspaceSymbolTimeout: number;
  /** When false, LSP tool calls do not count toward maxToolCallsPerRun. */
  lspToolsCountTowardLimit: boolean;
};

/** Fresh install defaults for cloud providers (conservative). */
export const CLOUD_AGENT_LIMITS: AgentLimits = {
  maxAgentSteps: 24,
  maxToolCallsPerRun: 80,
  maxToolsPerTurn: 0,
  parallelExecution: false,
  maxConcurrentTools: 4,
  lspToolTimeout: 5000,
  lspWorkspaceSymbolTimeout: 8000,
  lspToolsCountTowardLimit: false,
};

/** Fresh install defaults for local backends (higher; still bounded). */
export const LOCAL_AGENT_LIMITS: AgentLimits = {
  maxAgentSteps: 40,
  maxToolCallsPerRun: 120,
  maxToolsPerTurn: 0,
  parallelExecution: false,
  maxConcurrentTools: 4,
  lspToolTimeout: 5000,
  lspWorkspaceSymbolTimeout: 8000,
  lspToolsCountTowardLimit: false,
};

/** Legacy unlimited caps (existing users who saved zeros). */
export const UNLIMITED_AGENT_LIMITS: AgentLimits = {
  maxAgentSteps: 0,
  maxToolCallsPerRun: 0,
  maxToolsPerTurn: 0,
  parallelExecution: false,
  maxConcurrentTools: 4,
  lspToolTimeout: 5000,
  lspWorkspaceSymbolTimeout: 8000,
  lspToolsCountTowardLimit: false,
};

export function isCloudChatBackend(backend: AgentLimitsBackend): boolean {
  return backend === "anthropic" || backend === "deepseek";
}

export function defaultAgentLimitsForBackend(backend: AgentLimitsBackend): AgentLimits {
  return isCloudChatBackend(backend)
    ? { ...CLOUD_AGENT_LIMITS }
    : { ...LOCAL_AGENT_LIMITS };
}

/** @deprecated Use `defaultAgentLimitsForBackend` for new installs. */
export const DEFAULT_AGENT_LIMITS: AgentLimits = { ...LOCAL_AGENT_LIMITS };

export const AGENT_LIMIT_BOUNDS = {
  maxAgentSteps: { min: 0, max: 200 },
  maxToolCallsPerRun: { min: 0, max: 500 },
  maxToolsPerTurn: { min: 0, max: 50 },
  maxConcurrentTools: { min: 1, max: 16 },
  lspToolTimeout: { min: 500, max: 60_000 },
  lspWorkspaceSymbolTimeout: { min: 500, max: 120_000 },
} as const;

/**
 * Tools safe to run concurrently — they read but never write workspace state.
 * Write tools always run sequentially to prevent race conditions.
 * Kept in sync with `READ_ONLY_TOOLS` in `toolDefinitions.ts`.
 */
export const READ_ONLY_TOOL_NAMES = new Set<string>(READ_ONLY_TOOLS);

export function isReadOnlyTool(name: string): boolean {
  return READ_ONLY_TOOL_NAMES.has(name);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export function isUnlimitedCap(value: number): boolean {
  return value <= 0;
}

export function clampAgentLimits(raw: Partial<AgentLimits> | undefined): AgentLimits {
  const base = raw ?? {};
  return {
    maxAgentSteps: clampInt(
      base.maxAgentSteps,
      AGENT_LIMIT_BOUNDS.maxAgentSteps.min,
      AGENT_LIMIT_BOUNDS.maxAgentSteps.max,
      DEFAULT_AGENT_LIMITS.maxAgentSteps
    ),
    maxToolCallsPerRun: clampInt(
      base.maxToolCallsPerRun,
      AGENT_LIMIT_BOUNDS.maxToolCallsPerRun.min,
      AGENT_LIMIT_BOUNDS.maxToolCallsPerRun.max,
      DEFAULT_AGENT_LIMITS.maxToolCallsPerRun
    ),
    maxToolsPerTurn: clampInt(
      base.maxToolsPerTurn,
      AGENT_LIMIT_BOUNDS.maxToolsPerTurn.min,
      AGENT_LIMIT_BOUNDS.maxToolsPerTurn.max,
      DEFAULT_AGENT_LIMITS.maxToolsPerTurn
    ),
    parallelExecution: typeof base.parallelExecution === "boolean"
      ? base.parallelExecution
      : DEFAULT_AGENT_LIMITS.parallelExecution,
    maxConcurrentTools: clampInt(
      base.maxConcurrentTools,
      AGENT_LIMIT_BOUNDS.maxConcurrentTools.min,
      AGENT_LIMIT_BOUNDS.maxConcurrentTools.max,
      DEFAULT_AGENT_LIMITS.maxConcurrentTools
    ),
    lspToolTimeout: clampInt(
      base.lspToolTimeout,
      AGENT_LIMIT_BOUNDS.lspToolTimeout.min,
      AGENT_LIMIT_BOUNDS.lspToolTimeout.max,
      DEFAULT_AGENT_LIMITS.lspToolTimeout
    ),
    lspWorkspaceSymbolTimeout: clampInt(
      base.lspWorkspaceSymbolTimeout,
      AGENT_LIMIT_BOUNDS.lspWorkspaceSymbolTimeout.min,
      AGENT_LIMIT_BOUNDS.lspWorkspaceSymbolTimeout.max,
      DEFAULT_AGENT_LIMITS.lspWorkspaceSymbolTimeout
    ),
    lspToolsCountTowardLimit:
      typeof base.lspToolsCountTowardLimit === "boolean"
        ? base.lspToolsCountTowardLimit
        : DEFAULT_AGENT_LIMITS.lspToolsCountTowardLimit,
  };
}

function isLegacyUnlimitedSaved(limits: AgentLimits): boolean {
  return (
    limits.maxAgentSteps === 0 &&
    limits.maxToolCallsPerRun === 0 &&
    limits.maxToolsPerTurn === 0 &&
    !limits.parallelExecution &&
    limits.maxConcurrentTools === 4
  );
}

/** Migrate saved limits; apply backend defaults only when nothing was saved. */
export function normalizeAgentLimits(
  raw: Partial<AgentLimits> | undefined,
  backend: AgentLimitsBackend = "ollama"
): AgentLimits {
  if (!raw || typeof raw !== "object") {
    return defaultAgentLimitsForBackend(backend);
  }
  const c = clampAgentLimits(raw);
  if (c.maxAgentSteps === 12 && c.maxToolCallsPerRun === 48 && c.maxToolsPerTurn === 0) {
    return { ...UNLIMITED_AGENT_LIMITS };
  }
  if (isLegacyUnlimitedSaved(c)) {
    return c;
  }
  return c;
}

export function shouldContinueAgentStep(step: number, limits: AgentLimits): boolean {
  if (isUnlimitedCap(limits.maxAgentSteps)) return true;
  return step < limits.maxAgentSteps;
}

export function isToolRunCapReached(
  executed: number,
  limits: AgentLimits,
  options?: { skipCap?: boolean }
): boolean {
  if (options?.skipCap) return false;
  if (isUnlimitedCap(limits.maxToolCallsPerRun)) return false;
  return executed >= limits.maxToolCallsPerRun;
}

export function toolCountsTowardRunCap(toolName: string, limits: AgentLimits): boolean {
  if (!limits.lspToolsCountTowardLimit && toolName.startsWith("lsp_")) {
    return false;
  }
  return true;
}

export function perTurnToolCap(limits: AgentLimits, toolCallCount: number): number {
  if (isUnlimitedCap(limits.maxToolsPerTurn)) return toolCallCount;
  return limits.maxToolsPerTurn;
}
