import { describe, it, expect } from "vitest";
import { buildWorkspaceContextBlock } from "../../src/lib/agent/workspaceContext";

describe("buildWorkspaceContextBlock", () => {
  it("includes project root when workspace is set", () => {
    const block = buildWorkspaceContextBlock("/home/user/proj");
    expect(block).toContain("/home/user/proj");
    expect(block).toContain("relative paths");
    expect(block).toContain("create-vite");
  });

  it("warns when no workspace is open", () => {
    const block = buildWorkspaceContextBlock(null);
    expect(block).toContain("No project folder");
  });
});
