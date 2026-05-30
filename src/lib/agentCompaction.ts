/** Context compaction settings (spec 21). */

export type AgentCompactionSettings = {
  /** Master switch — when off, manual and automatic compaction are disabled. */
  enabled: boolean;
  autoCompact: boolean;
  /** When true, summarize with the connected chat model; when false, use `modelRoles.compaction`. */
  useActiveChatModel: boolean;
  /** Fraction of context window (0.5–0.95) that triggers auto-compaction. */
  compactThreshold: number;
  /** Raw messages kept after compaction. */
  compactKeepRecentTurns: number;
};

export const DEFAULT_AGENT_COMPACTION: AgentCompactionSettings = {
  enabled: false,
  autoCompact: false,
  useActiveChatModel: true,
  compactThreshold: 0.85,
  compactKeepRecentTurns: 6,
};

export const AGENT_COMPACTION_BOUNDS = {
  compactThreshold: { min: 0.5, max: 0.95 },
  compactKeepRecentTurns: { min: 2, max: 20 },
} as const;

function clampNum(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function normalizeAgentCompaction(
  raw: Partial<AgentCompactionSettings> | undefined,
  compactionModelRef?: string | null
): AgentCompactionSettings {
  const base = raw ?? {};
  let useActiveChatModel = base.useActiveChatModel !== false;
  if (base.useActiveChatModel === undefined && compactionModelRef) {
    useActiveChatModel = false;
  }
  return {
    enabled: base.enabled === true,
    autoCompact: base.autoCompact === true,
    useActiveChatModel,
    compactThreshold: clampNum(
      base.compactThreshold,
      AGENT_COMPACTION_BOUNDS.compactThreshold.min,
      AGENT_COMPACTION_BOUNDS.compactThreshold.max,
      DEFAULT_AGENT_COMPACTION.compactThreshold
    ),
    compactKeepRecentTurns: Math.round(
      clampNum(
        base.compactKeepRecentTurns,
        AGENT_COMPACTION_BOUNDS.compactKeepRecentTurns.min,
        AGENT_COMPACTION_BOUNDS.compactKeepRecentTurns.max,
        DEFAULT_AGENT_COMPACTION.compactKeepRecentTurns
      )
    ),
  };
}

/** UI percent input (50–95) from stored fraction. */
export function compactionThresholdPercent(threshold: number): number {
  return Math.round(threshold * 100);
}

export function compactionThresholdFromPercent(percent: number): number {
  const p = Math.round(
    clampNum(percent, 50, 95, compactionThresholdPercent(DEFAULT_AGENT_COMPACTION.compactThreshold))
  );
  return p / 100;
}

export const MANUAL_COMPACTION_BUTTON_TITLE =
  "Compact conversation — summarize older history to free context";

export const MANUAL_COMPACTION_DISABLED_TITLE =
  "Compaction is disabled — enable it in Settings → Compaction";

export const COMPACTION_SUCCESS_NOTICE =
  "Context compacted — older history summarized.";

/** Need more messages than we keep after compaction so summarization is meaningful. */
export function chatHasMessagesForCompaction(
  messageCount: number,
  keepRecent: number = DEFAULT_AGENT_COMPACTION.compactKeepRecentTurns
): boolean {
  return messageCount > keepRecent + 1;
}

export function shouldAutoCompact(
  usedTokens: number,
  contextWindow: number,
  threshold: number
): boolean {
  if (contextWindow <= 0) return false;
  return usedTokens / contextWindow >= threshold;
}
