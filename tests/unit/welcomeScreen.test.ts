import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";

// ---------------------------------------------------------------------------
// Mock IPC — covers both workspace.ts and WelcomeScreen.svelte imports
// ---------------------------------------------------------------------------

const mockGetRecent = vi.fn();
const mockAddRecent = vi.fn();
const mockAcquire = vi.fn();
const mockGetLaunchArgs = vi.fn();

vi.mock("../../src/lib/ipc", () => ({
  getRecentProjects: (...a: unknown[]) => mockGetRecent(...a),
  addRecentProject: (...a: unknown[]) => mockAddRecent(...a),
  acquireWorkspaceLock: (...a: unknown[]) => mockAcquire(...a),
  getLaunchArgs: (...a: unknown[]) => mockGetLaunchArgs(...a),
  releaseWorkspaceLock: vi.fn().mockResolvedValue(undefined),
  readWorkspaceLock: vi.fn().mockResolvedValue(null),
  watchWorkspace: vi.fn().mockResolvedValue(undefined),
  listDir: vi.fn().mockResolvedValue([]),
  readFile: vi.fn().mockResolvedValue(""),
  getLanguageFromPath: vi.fn().mockReturnValue("text"),
  getWorkspacePath: vi.fn().mockResolvedValue(""),
  isTauriAvailable: () => true,
  pickWorkspaceFolder: vi.fn(),
  webFetch: vi.fn(),
  writeFile: vi.fn(),
  readFileRanged: vi.fn(),
  runShell: vi.fn(),
  deleteEntry: vi.fn(),
  renameEntry: vi.fn(),
  pathExists: vi.fn().mockResolvedValue(false),
  gitStatus: vi.fn(),
  gitLog: vi.fn(),
  gitDiff: vi.fn(),
  findFiles: vi.fn(),
  listDirTree: vi.fn(),
  grepWorkspace: vi.fn(),
}));

vi.mock("../../src/lib/projectState", () => ({
  switchProjectWorkspace: vi.fn().mockResolvedValue(undefined),
}));

import {
  workspaceReadOnly,
  pendingLockConflict,
  applyWorkspaceFolder,
} from "../../src/lib/workspace";
import { layoutOverride } from "../../src/lib/stores/layoutOverride";

// ---------------------------------------------------------------------------
// Recent projects: add on successful open
// ---------------------------------------------------------------------------

describe("recent projects on workspace open", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAcquire.mockResolvedValue({ kind: "Acquired" });
    mockAddRecent.mockResolvedValue(undefined);
    workspaceReadOnly.set(false);
    pendingLockConflict.set(null);
  });

  it("calls addRecentProject after successfully opening a folder", async () => {
    await applyWorkspaceFolder("/test/myproject");
    expect(mockAddRecent).toHaveBeenCalledWith("/test/myproject");
  });

  it("does NOT call addRecentProject when user cancels the conflict dialog", async () => {
    const lockInfo = { pid: 9999, timestamp: "2026-01-01T00:00:00Z", hostname: "other" };
    mockAcquire.mockResolvedValue({ kind: "ConflictLive", lock_info: lockInfo });

    const { resolveLockConflict } = await import("../../src/lib/workspace");
    const openPromise = applyWorkspaceFolder("/test/myproject");
    await vi.waitFor(() => expect(get(pendingLockConflict)).not.toBeNull());
    resolveLockConflict(false); // cancel
    await openPromise;

    expect(mockAddRecent).not.toHaveBeenCalled();
  });

  it("calls addRecentProject even when opened read-only", async () => {
    const lockInfo = { pid: 9999, timestamp: "2026-01-01T00:00:00Z", hostname: "other" };
    mockAcquire.mockResolvedValue({ kind: "ConflictLive", lock_info: lockInfo });

    const { resolveLockConflict } = await import("../../src/lib/workspace");
    const openPromise = applyWorkspaceFolder("/test/myproject");
    await vi.waitFor(() => expect(get(pendingLockConflict)).not.toBeNull());
    resolveLockConflict(true); // open read-only
    await openPromise;

    expect(mockAddRecent).toHaveBeenCalledWith("/test/myproject");
  });
});

// ---------------------------------------------------------------------------
// Layout override store (CLI file-open mode)
// ---------------------------------------------------------------------------

describe("layoutOverride store", () => {
  beforeEach(() => {
    layoutOverride.set(null);
  });

  it("starts null", () => {
    expect(get(layoutOverride)).toBeNull();
  });

  it("can be set and consumed once", () => {
    layoutOverride.set({ showLeftPanel: false, showRightPanel: false });
    const override = get(layoutOverride);
    expect(override).toEqual({ showLeftPanel: false, showRightPanel: false });
    layoutOverride.set(null);
    expect(get(layoutOverride)).toBeNull();
  });

  it("CLI file-open sets both panels false", () => {
    // Simulates what FileTree onMount does after detecting is_file: true
    layoutOverride.set({ showLeftPanel: false, showRightPanel: false });
    const o = get(layoutOverride);
    expect(o?.showLeftPanel).toBe(false);
    expect(o?.showRightPanel).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LaunchArgs: directory open triggers normal workspace flow
// ---------------------------------------------------------------------------

describe("LaunchArgs folder name extraction", () => {
  it("extracts folder name from path", () => {
    function folderName(path: string): string {
      const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
      return parts[parts.length - 1] ?? path;
    }
    expect(folderName("/home/user/my-project")).toBe("my-project");
    expect(folderName("/project")).toBe("project");
    expect(folderName("C:/Users/Dev/workspace")).toBe("workspace");
  });

  it("extracts parent path display string", () => {
    function parentPath(path: string): string {
      const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
      return parts.length > 1 ? parts.slice(0, -1).join("/") : path;
    }
    expect(parentPath("/home/user/my-project")).toBe("home/user");
    expect(parentPath("/project")).toBe("/project"); // single segment → falls back to full path
  });
});
