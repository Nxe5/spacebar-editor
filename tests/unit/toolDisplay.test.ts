import { describe, expect, it } from "vitest";
import {
  formatToolSummary,
  isCondensedPreviewTool,
  openableFilePaths,
  pathsFromToolInput,
  shellCommandShortLabel,
  toolActivityDetailPath,
  toolCompactLabel,
  toolFileLine,
  toolResultIsError,
  workspaceRelativePath,
} from "../../src/lib/agent/toolDisplay";

describe("toolDisplay", () => {
  it("summarizes write_file with path", () => {
    expect(formatToolSummary("write_file", { path: "testing.txt" })).toBe("testing.txt");
  });

  it("compact label shortens file tools", () => {
    expect(toolCompactLabel("write_file")).toBe("write");
    expect(toolCompactLabel("get_git_status")).toBe("git status");
  });

  it("file line resolves workspace-relative path", () => {
    expect(
      toolFileLine("write_file", { path: "three-little-pigs.md" }, "/home/user/my-project")
    ).toBe("three-little-pigs.md");
  });

  it("summarizes run_shell with short command label", () => {
    expect(formatToolSummary("run_shell", { command: "git status" })).toBe("git status");
    expect(
      formatToolSummary("run_shell", {
        command: 'cd /Users/gamb1t/Desktop/Nxe5/deep-seeker && echo "hi"',
      })
    ).toBe("cd");
  });

  it("shellCommandShortLabel extracts leading verb", () => {
    expect(shellCommandShortLabel("cd /long/path && echo x")).toBe("cd");
    expect(shellCommandShortLabel("pnpm test")).toBe("pnpm test");
  });

  it("run_shell has no file line in expanded detail", () => {
    expect(
      toolFileLine(
        "run_shell",
        { command: "cd /Users/gamb1t/proj && ls" },
        "/Users/gamb1t/proj"
      )
    ).toBeNull();
  });

  it("resolves workspace paths from tool input", () => {
    const paths = pathsFromToolInput(
      "write_file",
      { path: "src/main.ts" },
      "/home/user/my-project"
    );
    expect(paths).toEqual(["/home/user/my-project/src/main.ts"]);
  });

  it("returns openable paths for successful write", () => {
    const paths = openableFilePaths(
      "write_file",
      { path: "testing.txt" },
      "/home/user/my-project",
      true
    );
    expect(paths).toEqual(["/home/user/my-project/testing.txt"]);
  });

  it("shows workspace-relative labels", () => {
    expect(workspaceRelativePath("/home/user/my-project", "/home/user/my-project/testing.txt")).toBe(
      "testing.txt"
    );
  });

  it("detects error output", () => {
    expect(toolResultIsError("Error: Path does not exist")).toBe(true);
    expect(toolResultIsError("Successfully wrote to testing.txt")).toBe(false);
  });

  it("marks read/list as condensed preview tools", () => {
    expect(isCondensedPreviewTool("read_file")).toBe(true);
    expect(isCondensedPreviewTool("list_dir")).toBe(true);
    expect(isCondensedPreviewTool("write_file")).toBe(false);
  });

  it("resolves absolute paths for condensed activity rows", () => {
    expect(
      toolActivityDetailPath(
        "read_file",
        { path: "package.json" },
        "/Users/gamb1t/Desktop/Nxe5/deep-seeker"
      )
    ).toBe("package.json");
    expect(
      toolActivityDetailPath(
        "read_file",
        { path: "/Users/gamb1t/Desktop/Nxe5/deep-seeker/test.md" },
        "/Users/gamb1t/Desktop/Nxe5/deep-seeker"
      )
    ).toBe("test.md");
  });
});
