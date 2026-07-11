import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockReadFileRanged = vi.fn();
const mockWriteFile = vi.fn();
const mockListDir = vi.fn();
const mockGrepWorkspace = vi.fn();
const mockRunShell = vi.fn();
const mockDeleteEntry = vi.fn();
const mockRenameEntry = vi.fn();
const mockPathExists = vi.fn();
const mockGitStatus = vi.fn();
const mockGitLog = vi.fn();
const mockGitDiff = vi.fn();
const mockIsTauriAvailable = vi.fn();

vi.mock("../../src/lib/ipc", () => ({
  readFile: vi.fn(),
  readFileRanged: (...args: unknown[]) => mockReadFileRanged(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  listDir: (...args: unknown[]) => mockListDir(...args),
  grepWorkspace: (...args: unknown[]) => mockGrepWorkspace(...args),
  runShell: (...args: unknown[]) => mockRunShell(...args),
  ptyWrite: vi.fn().mockResolvedValue(undefined),
  deleteEntry: (...args: unknown[]) => mockDeleteEntry(...args),
  renameEntry: (...args: unknown[]) => mockRenameEntry(...args),
  pathExists: (...args: unknown[]) => mockPathExists(...args),
  gitStatus: (...args: unknown[]) => mockGitStatus(...args),
  gitLog: (...args: unknown[]) => mockGitLog(...args),
  gitDiff: (...args: unknown[]) => mockGitDiff(...args),
  isTauriAvailable: () => mockIsTauriAvailable(),
}));

vi.mock("../../src/lib/stores/bottomTerminals", () => ({
  bottomTerminals: {
    createTab: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("../../src/lib/stores/bottomPanel", () => ({
  requestBottomPanelOpen: vi.fn(),
}));

import { executeTool } from "../../src/lib/tools/toolRunner";

describe("toolRunner", () => {
  const workspacePath = "/test/workspace";

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauriAvailable.mockReturnValue(true);
    mockPathExists.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("executeTool", () => {
    describe("when Tauri is not available", () => {
      it("returns error for all tools", async () => {
        mockIsTauriAvailable.mockReturnValue(false);
        const result = await executeTool("read_file", { path: "test.txt" }, workspacePath);
        expect(result.success).toBe(false);
        expect(result.output).toContain("Tauri");
      });
    });

    describe("when no workspace folder is open", () => {
      it("returns a clear error instead of undefined", async () => {
        const result = await executeTool("write_file", { path: "hello.txt", content: "hi" }, "/");
        expect(result.success).toBe(false);
        expect(result.output).toContain("No workspace folder");
        expect(result.output).not.toContain("undefined");
      });
    });

    describe("error formatting", () => {
      it("includes string rejections from invoke", async () => {
        mockReadFileRanged.mockRejectedValue("permission denied");
        const result = await executeTool("read_file", { path: "x.txt" }, workspacePath);
        expect(result.success).toBe(false);
        expect(result.output).toContain("permission denied");
        expect(result.output).not.toContain("undefined");
      });
    });

    describe("read_file", () => {
      it("reads file with relative path", async () => {
        mockReadFileRanged.mockResolvedValue({
          content: "content",
          start_line: 1,
          end_line: 1,
          total_lines: 1,
          truncated: false,
          hard_capped: false,
        });
        const result = await executeTool("read_file", { path: "src/file.ts" }, workspacePath);
        expect(result.success).toBe(true);
        expect(mockReadFileRanged).toHaveBeenCalledWith(
          workspacePath,
          "/test/workspace/src/file.ts",
          1,
          500
        );
      });

      it("rejects paths outside workspace", async () => {
        const result = await executeTool("read_file", { path: "/etc/passwd" }, workspacePath);
        expect(result.success).toBe(false);
        expect(result.output).toContain("outside the workspace");
      });
    });

    describe("write_file", () => {
      it("writes file with content", async () => {
        mockWriteFile.mockResolvedValue("");
        const result = await executeTool(
          "write_file",
          { path: "output.txt", content: "hello" },
          workspacePath
        );
        expect(result.success).toBe(true);
        expect(mockWriteFile).toHaveBeenCalledWith(workspacePath, "/test/workspace/output.txt", "hello");
      });
    });

    describe("create_file", () => {
      it("maps /filename to workspace root (LLM mistake)", async () => {
        mockPathExists.mockResolvedValue(false);
        mockWriteFile.mockResolvedValue("");
        const result = await executeTool(
          "create_file",
          { path: "/output.txt", content: "hi" },
          workspacePath
        );
        expect(result.success).toBe(true);
        expect(mockWriteFile).toHaveBeenCalledWith(workspacePath, "/test/workspace/output.txt", "hi");
      });

      it("creates file when it does not exist", async () => {
        mockPathExists.mockResolvedValue(false);
        mockWriteFile.mockResolvedValue("");
        const result = await executeTool(
          "create_file",
          { path: "new.txt", content: "data" },
          workspacePath
        );
        expect(result.success).toBe(true);
        expect(mockWriteFile).toHaveBeenCalled();
      });

      it("fails when file already exists", async () => {
        mockPathExists.mockResolvedValue(true);
        const result = await executeTool(
          "create_file",
          { path: "exists.txt", content: "data" },
          workspacePath
        );
        expect(result.success).toBe(false);
        expect(result.output).toContain("already exists");
        expect(mockWriteFile).not.toHaveBeenCalled();
      });
    });

    describe("delete_file", () => {
      it("deletes resolved path", async () => {
        mockDeleteEntry.mockResolvedValue(undefined);
        const result = await executeTool("delete_file", { path: "old.txt" }, workspacePath);
        expect(result.success).toBe(true);
        expect(mockDeleteEntry).toHaveBeenCalledWith(workspacePath, "/test/workspace/old.txt");
      });
    });

    describe("move_file", () => {
      it("renames within workspace", async () => {
        mockRenameEntry.mockResolvedValue(undefined);
        const result = await executeTool(
          "move_file",
          { from: "a.txt", to: "b.txt" },
          workspacePath
        );
        expect(result.success).toBe(true);
        expect(mockRenameEntry).toHaveBeenCalledWith(
          workspacePath,
          "/test/workspace/a.txt",
          "/test/workspace/b.txt"
        );
      });
    });

    describe("list_dir", () => {
      it("lists directory contents", async () => {
        mockListDir.mockResolvedValue([{ name: "file.txt", is_dir: false }]);
        const result = await executeTool("list_dir", { path: "." }, workspacePath);
        expect(result.success).toBe(true);
        expect(result.output).toContain("[file] file.txt");
      });
    });

    describe("grep", () => {
      it("searches for pattern", async () => {
        mockGrepWorkspace.mockResolvedValue([
          { path: "a.ts", line_number: 1, line_content: "match" },
        ]);
        const result = await executeTool("grep", { pattern: "match" }, workspacePath);
        expect(result.success).toBe(true);
        expect(result.output).toContain("a.ts:1:");
      });
    });

    describe("get_git_status", () => {
      it("formats git status", async () => {
        mockGitStatus.mockResolvedValue([{ path: "x.ts", index: "M", worktree: "-" }]);
        const result = await executeTool("get_git_status", {}, workspacePath);
        expect(result.success).toBe(true);
        expect(result.output).toContain("x.ts");
        expect(mockGitStatus).toHaveBeenCalledWith(workspacePath);
      });
    });

    describe("get_git_log", () => {
      it("formats git log with limit", async () => {
        mockGitLog.mockResolvedValue([
          {
            oid: "abc1234567890",
            summary: "init",
            author: "Dev",
            time: 1_700_000_000,
          },
        ]);
        const result = await executeTool("get_git_log", { limit: 5 }, workspacePath);
        expect(result.success).toBe(true);
        expect(result.output).toContain("init");
        expect(mockGitLog).toHaveBeenCalledWith(workspacePath, 5);
      });
    });

    describe("get_git_diff", () => {
      it("returns diff for optional path", async () => {
        mockGitDiff.mockResolvedValue("diff content");
        const result = await executeTool("get_git_diff", { path: "src/a.ts" }, workspacePath);
        expect(result.success).toBe(true);
        expect(result.output).toBe("diff content");
        expect(mockGitDiff).toHaveBeenCalledWith(workspacePath, "src/a.ts");
      });

      it("returns repo-wide diff when path omitted", async () => {
        mockGitDiff.mockResolvedValue("");
        const result = await executeTool("get_git_diff", {}, workspacePath);
        expect(result.success).toBe(true);
        expect(result.output).toContain("no diff");
        expect(mockGitDiff).toHaveBeenCalledWith(workspacePath, undefined);
      });
    });

    describe("run_shell", () => {
      it("executes command and returns output", async () => {
        mockRunShell.mockResolvedValue({
          stdout: "ok",
          stderr: "",
          exit_code: 0,
          timed_out: false,
        });
        const result = await executeTool("run_shell", { command: "echo ok" }, workspacePath);
        expect(result.success).toBe(true);
        expect(result.output).toContain("ok");
      });
    });

    describe("switch_mode", () => {
      it("switches mode via callback", async () => {
        let switched: string | null = null;
        const result = await executeTool(
          "switch_mode",
          { target_mode: "plan", explanation: "Need read-only analysis first" },
          workspacePath,
          { onSwitchMode: (mode) => { switched = mode; } }
        );
        expect(result.success).toBe(true);
        expect(switched).toBe("plan");
        expect(result.output).toContain("Plan");
      });

      it("rejects invalid target_mode", async () => {
        const result = await executeTool(
          "switch_mode",
          { target_mode: "chat", explanation: "nope" },
          workspacePath,
          { onSwitchMode: () => {} }
        );
        expect(result.success).toBe(false);
      });
    });

    describe("unknown tool", () => {
      it("returns error for unknown tools", async () => {
        const result = await executeTool("unknown_tool", {}, workspacePath);
        expect(result.success).toBe(false);
        expect(result.output).toContain("Unknown tool");
      });
    });
  });
});
