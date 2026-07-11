import { describe, expect, it } from "vitest";
import {
  buildUnifiedDiffDisplay,
  diffLineStats,
  isFileChangeBubbleTool,
  newFileContentFromToolInput,
  sliceDiffPreview,
} from "../../src/lib/agent/fileChangeDiff";

describe("fileChangeDiff", () => {
  it("builds unified diff lines with add, del, and context", () => {
    const lines = buildUnifiedDiffDisplay("a\nb", "a\nc");
    expect(lines).toEqual([
      { kind: "ctx", text: "a", newLine: 1 },
      { kind: "del", text: "b" },
      { kind: "add", text: "c", newLine: 2 },
    ]);
  });

  it("counts additions and deletions", () => {
    expect(diffLineStats("x\ny", "x\nz")).toEqual({ additions: 1, deletions: 1 });
    expect(diffLineStats("", "new\nfile")).toEqual({ additions: 2, deletions: 0 });
  });

  it("slices collapsed preview around first change", () => {
    const lines = buildUnifiedDiffDisplay("one\ntwo\nthree\nfour", "one\nTWO\nthree\nfour");
    const preview = sliceDiffPreview(lines, 4, false);
    expect(preview.length).toBeLessThanOrEqual(4);
    expect(preview.some((l) => l.kind === "del" || l.kind === "add")).toBe(true);
  });

  it("returns full diff when expanded", () => {
    const lines = buildUnifiedDiffDisplay("a\nb\nc\nd\ne", "a\nB\nc\nd\ne");
    expect(sliceDiffPreview(lines, 4, true)).toEqual(lines);
  });

  it("reads new file content from tool input", () => {
    expect(newFileContentFromToolInput({ content: "hello" })).toBe("hello");
    expect(newFileContentFromToolInput({ path: "x.ts" })).toBe("");
  });

  it("identifies file-change bubble tools", () => {
    expect(isFileChangeBubbleTool("write_file", true)).toBe(true);
    expect(isFileChangeBubbleTool("create_file", true)).toBe(true);
    expect(isFileChangeBubbleTool("write_file", false)).toBe(false);
    expect(isFileChangeBubbleTool("read_file", true)).toBe(false);
  });
});
