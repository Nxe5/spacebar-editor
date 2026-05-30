import { describe, expect, it } from "vitest";
import {
  buildCompactedMessages,
  buildCompactionUserPrompt,
  COMPACTION_ACK,
  sliceMessagesForCompactionPrompt,
} from "../../src/lib/agent/compactHistory";
import type { Message } from "../../src/lib/stores/chat";

function msg(id: string, role: Message["role"], content: string): Message {
  return { id, role, content, timestamp: 1 };
}

describe("compactHistory", () => {
  it("dedupes first user turn with tail slice", () => {
    const messages = [
      msg("u1", "user", "Build auth"),
      msg("a1", "assistant", "Sure"),
      msg("u2", "user", "Next"),
      msg("a2", "assistant", "Done"),
    ];
    const slice = sliceMessagesForCompactionPrompt(messages);
    expect(slice.map((m) => m.id)).toEqual(["u1", "a1", "u2", "a2"]);
  });

  it("wraps summary with synthetic exchange and keeps recent tail", () => {
    const prior = Array.from({ length: 10 }, (_, i) =>
      msg(`m${i}`, i % 2 === 0 ? "user" : "assistant", `line ${i}`)
    );
    const out = buildCompactedMessages("## Session Context\n\n### Original Task\nDo thing", prior, 3);
    expect(out).toHaveLength(5);
    expect(out[0].role).toBe("user");
    expect(out[0].content).toContain("[Session context — compacted to free space]");
    expect(out[1].role).toBe("assistant");
    expect(out[1].content).toBe(COMPACTION_ACK);
    expect(out.slice(2).map((m) => m.id)).toEqual(["m7", "m8", "m9"]);
  });

  it("includes threshold in compaction prompt", () => {
    const prompt = buildCompactionUserPrompt([msg("u1", "user", "Hi")], 87, null);
    expect(prompt).toContain("compacted at 87%");
    expect(prompt).toContain("No active plan.");
  });
});
