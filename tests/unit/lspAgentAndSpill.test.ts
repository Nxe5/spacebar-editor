import { describe, expect, it } from "vitest";
import { formatReferencesOutput, formatDefinitionOutput } from "../../src/lib/lsp/lspAgentFormat";
import { truncateUtf8Logic } from "../../src/lib/tools/shellOutputSpill";
import { buildCompactedMessages } from "../../src/lib/agent/compactHistory";
import { toolCountsTowardRunCap, LOCAL_AGENT_LIMITS } from "../../src/lib/agentLimits";

describe("shellOutputSpill", () => {
  it("detects truncation for large output", () => {
    const big = "x".repeat(100_000);
    const { truncated, totalBytes } = truncateUtf8Logic(big, 1024);
    expect(truncated).toBe(true);
    expect(totalBytes).toBeGreaterThan(1024);
  });
});

describe("lspAgentFormat", () => {
  it("formats references", () => {
    const out = formatReferencesOutput(
      "foo",
      [{ uri: "file:///proj/src/a.ts", range: { start: { line: 1, character: 2 }, end: { line: 1, character: 5 } } }],
      "/proj"
    );
    expect(out).toContain("References to `foo`");
    expect(out).toContain("src/a.ts:2:3");
  });

  it("formats definition", () => {
    const out = formatDefinitionOutput(
      "bar",
      [{ uri: "file:///proj/b.ts", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } } }],
      "/proj"
    );
    expect(out).toContain("Definition of `bar`");
  });
});

describe("buildCompactedMessages", () => {
  it("extends kept window for recent tool messages", () => {
    const msgs = [
      { id: "u1", role: "user" as const, content: "hi", timestamp: 1 },
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `t${i}`,
        role: "tool" as const,
        content: `out ${i}`,
        timestamp: i + 2,
      })),
    ];
    const compacted = buildCompactedMessages("summary", msgs, 3, 5);
    const toolKept = compacted.filter((m) => m.role === "tool");
    expect(toolKept.length).toBeGreaterThanOrEqual(5);
  });
});

describe("agentLimits LSP", () => {
  it("exempts lsp tools from run cap by default", () => {
    expect(toolCountsTowardRunCap("lsp_find_references", LOCAL_AGENT_LIMITS)).toBe(false);
    expect(toolCountsTowardRunCap("grep", LOCAL_AGENT_LIMITS)).toBe(true);
  });
});
