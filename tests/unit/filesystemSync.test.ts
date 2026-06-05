import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";
import { files } from "../../src/lib/stores/files";
import { workbench } from "../../src/lib/stores/workbench";

const mockListDir = vi.fn();
const mockReadFile = vi.fn();

vi.mock("../../src/lib/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/ipc")>();
  return {
    ...actual,
    isTauriAvailable: () => true,
    listDir: (...args: unknown[]) => mockListDir(...args),
    readFile: (...args: unknown[]) => mockReadFile(...args),
    getLanguageFromPath: (p: string) => (p.endsWith(".ts") ? "typescript" : "plaintext"),
  };
});

import { syncUiAfterFilesystemTool } from "../../src/lib/filesystemSync";
import { buildWorkspaceTree } from "../../src/lib/workspace";

describe("filesystemSync", () => {
  const workspace = "/proj";

  beforeEach(() => {
    vi.clearAllMocks();
    workbench.reset();
    files.resetForTests();
    files.setWorkspacePath(workspace);
    files.setTree(
      buildWorkspaceTree(workspace, [{ name: "old.txt", path: "/proj/old.txt", is_dir: false }], true)
    );
    mockListDir.mockResolvedValue([
      { name: "old.txt", path: "/proj/old.txt", is_dir: false },
      { name: "new.txt", path: "/proj/new.txt", is_dir: false },
    ]);
    mockReadFile.mockResolvedValue("fresh content");
  });

  it("refreshes explorer after create_file", async () => {
    await syncUiAfterFilesystemTool(workspace, "create_file", { path: "new.txt", content: "x" }, true);

    expect(mockListDir).toHaveBeenCalledWith(null, workspace);
    const tree = get(files).tree[0]?.children ?? [];
    expect(tree.some((e) => e.name === "new.txt")).toBe(true);
  });

  it("opens new file in editor after create_file", async () => {
    await syncUiAfterFilesystemTool(workspace, "create_file", { path: "new.txt", content: "x" }, true);

    expect(mockReadFile).toHaveBeenCalledWith(null, "/proj/new.txt");
    expect(get(files).openFiles.some((f) => f.path === "/proj/new.txt")).toBe(true);
    expect(get(workbench).activeTabId).toBe("editor:/proj/new.txt");
  });

  it("reloads open buffer after write_file", async () => {
    files.openFile({
      path: "/proj/old.txt",
      name: "old.txt",
      content: "stale",
      isDirty: false,
      language: "plaintext",
    });

    await syncUiAfterFilesystemTool(
      workspace,
      "write_file",
      { path: "old.txt", content: "fresh content" },
      true
    );

    const open = get(files).openFiles.find((f) => f.path === "/proj/old.txt");
    expect(open?.content).toBe("fresh content");
    expect(open?.isDirty).toBe(false);
  });

  it("does nothing when tool failed", async () => {
    await syncUiAfterFilesystemTool(workspace, "create_file", { path: "nope.txt", content: "x" }, false);
    expect(mockListDir).not.toHaveBeenCalled();
  });
});
