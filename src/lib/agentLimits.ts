/** Configurable caps for the agent loop (one user message → multi-step tool chain). */

export type AgentLimits = {
  /** LLM ↔ tool round trips per user message. */
  maxAgentSteps: number;
  /** Total tool executions across all steps for one user message. */
  maxToolCallsPerRun: number;
  /** Tool calls allowed from a single model response; 0 = unlimited. */
  maxToolsPerTurn: number;
};

export const DEFAULT_AGENT_LIMITS: AgentLimits = {
  maxAgentSteps: 12,
  maxToolCallsPerRun: 48,
  maxToolsPerTurn: 0,
};

export const AGENT_LIMIT_BOUNDS = {
  maxAgentSteps: { min: 1, max: 40 },
  maxToolCallsPerRun: { min: 1, max: 200 },
  maxToolsPerTurn: { min: 0, max: 20 },
} as const;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
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
  };
}
