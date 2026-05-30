import { describe, expect, it } from "vitest";
import {
  chatHasMessagesForCompaction,
  compactionThresholdFromPercent,
  compactionThresholdPercent,
  normalizeAgentCompaction,
  shouldAutoCompact,
} from "../../src/lib/agentCompaction";

describe("agentCompaction", () => {
  it("normalizes threshold and keep recent bounds", () => {
    const s = normalizeAgentCompaction({
      enabled: true,
      autoCompact: true,
      useActiveChatModel: false,
      compactThreshold: 0.99,
      compactKeepRecentTurns: 100,
    });
    expect(s.enabled).toBe(true);
    expect(s.autoCompact).toBe(true);
    expect(s.useActiveChatModel).toBe(false);
    expect(s.compactThreshold).toBe(0.95);
    expect(s.compactKeepRecentTurns).toBe(20);
  });

  it("defaults enabled off and useActiveChatModel on", () => {
    const s = normalizeAgentCompaction({});
    expect(s.enabled).toBe(false);
    expect(s.useActiveChatModel).toBe(true);
  });

  it("infers useActiveChatModel off when a compaction override was saved", () => {
    const s = normalizeAgentCompaction({}, "anthropic:claude-sonnet");
    expect(s.useActiveChatModel).toBe(false);
  });

  it("converts percent UI to stored fraction", () => {
    expect(compactionThresholdFromPercent(85)).toBe(0.85);
    expect(compactionThresholdPercent(0.85)).toBe(85);
  });

  it("requires more messages than the keep-recent tail", () => {
    expect(chatHasMessagesForCompaction(0, 6)).toBe(false);
    expect(chatHasMessagesForCompaction(7, 6)).toBe(false);
    expect(chatHasMessagesForCompaction(8, 6)).toBe(true);
  });

  it("detects auto-compact threshold", () => {
    expect(shouldAutoCompact(850, 1000, 0.85)).toBe(true);
    expect(shouldAutoCompact(800, 1000, 0.85)).toBe(false);
    expect(shouldAutoCompact(100, 0, 0.85)).toBe(false);
  });
});
