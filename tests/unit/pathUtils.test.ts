import { describe, it, expect } from "vitest";
import { resolvePath, assertWithinWorkspace, resolveWorkspacePath, joinPath, toWorkspaceRelativePath } from "../../src/lib/tools/pathUtils";

describe("pathUtils", () => {
  const workspace = "/test/workspace";

  it("resolvePath joins relative paths", () => {
    expect(resolvePath(workspace, "src/a.ts")).toBe("/test/workspace/src/a.ts");
  });

  it("resolvePath maps root-anchored mistake to workspace", () => {
    expect(resolvePath(workspace, "/test.txt")).toBe("/test/workspace/test.txt");
    expect(resolvePath(workspace, "test.txt")).toBe("/test/workspace/test.txt");
  });

  it("resolvePath keeps absolute paths under workspace", () => {
    expect(resolvePath(workspace, "/test/workspace/src/a.ts")).toBe("/test/workspace/src/a.ts");
  });

  it("resolvePath keeps true absolute paths outside workspace for assert to reject", () => {
    expect(resolvePath(workspace, "/etc/passwd")).toBe("/etc/passwd");
  });

  it("joinPath does not turn workspace into empty base", () => {
    expect(joinPath(workspace, "test.txt")).toBe("/test/workspace/test.txt");
    expect(() => joinPath("/", "test.txt")).toThrow(/not set/);
  });

  it("assertWithinWorkspace allows paths under workspace", () => {
    expect(() =>
      assertWithinWorkspace(workspace, "/test/workspace/src/a.ts")
    ).not.toThrow();
  });

  it("assertWithinWorkspace rejects paths outside workspace", () => {
    expect(() => assertWithinWorkspace(workspace, "/other/file")).toThrow(/outside the workspace/);
  });

  it("resolveWorkspacePath rejects escape via absolute path", () => {
    expect(() => resolveWorkspacePath(workspace, "/etc/passwd")).toThrow(/outside the workspace/);
  });

  it("resolveWorkspacePath allows create_file at workspace root", () => {
    expect(resolveWorkspacePath(workspace, "test.txt")).toBe("/test/workspace/test.txt");
    expect(resolveWorkspacePath(workspace, "/test.txt")).toBe("/test/workspace/test.txt");
  });

  it("toWorkspaceRelativePath converts absolute paths under workspace", () => {
    expect(toWorkspaceRelativePath(workspace, "/test/workspace/package.json")).toBe("package.json");
    expect(toWorkspaceRelativePath(workspace, "src/App.tsx")).toBe("src/App.tsx");
    expect(toWorkspaceRelativePath(workspace, "/test/workspace")).toBe(".");
  });
});
