import { get, writable } from "svelte/store";
import { files, type FileEntry } from "./stores/files";
import { acquireWorkspaceLock, addRecentProject, listDir, watchWorkspace, isTauriAvailable, releaseWorkspaceLock, type LockInfo } from "./ipc";
import { normalizeFilePath } from "./fsPath";

/** IPC may return snake_case or camelCase; keep a single shape for the UI. */
export function normalizeFileEntry(e: FileEntry & { isDir?: boolean }): FileEntry {
  const is_dir = e.is_dir ?? e.isDir ?? false;
  const children =
    e.children?.map((c) => normalizeFileEntry(c as FileEntry & { isDir?: boolean })) ?? undefined;
  return {
    name: e.name,
    path: normalizeFilePath(e.path),
    is_dir,
    expanded: e.expanded,
    children,
  };
}

/** Display name for the workspace folder (last path segment). */
export function workspaceFolderName(workspacePath: string): string {
  const normalized = normalizeFilePath(workspacePath.trim());
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? normalized;
}

/** VS Code–style single root row: the open project folder (expand/collapse). */
export function createWorkspaceRootEntry(
  workspacePath: string,
  children: FileEntry[],
  expanded = true
): FileEntry {
  const normalized = normalizeFilePath(workspacePath.trim());
  return {
    name: workspaceFolderName(normalized),
    path: normalized,
    is_dir: true,
    expanded,
    children,
  };
}

export function buildWorkspaceTree(
  workspacePath: string,
  children: FileEntry[],
  expanded = true
): FileEntry[] {
  return [createWorkspaceRootEntry(workspacePath, children, expanded)];
}

/** True when any folder under the workspace root (not the root itself) is expanded. */
export function anySubfolderExpanded(
  tree: FileEntry[],
  workspacePath: string
): boolean {
  const ws = normalizeFilePath(workspacePath);
  function visit(entries: FileEntry[]): boolean {
    for (const entry of entries) {
      if (!entry.is_dir) continue;
      const isRoot = normalizeFilePath(entry.path) === ws;
      if (!isRoot && entry.expanded) return true;
      if (entry.children && visit(entry.children)) return true;
    }
    return false;
  }
  return visit(tree);
}

// ---------------------------------------------------------------------------
// Read-only mode (workspace lock conflict — spec 35)
// ---------------------------------------------------------------------------

/** True when this window opened the workspace without acquiring the lock. */
export const workspaceReadOnly = writable(false);

/** Pending conflict lock info that the UI must resolve (show dialog). */
export const pendingLockConflict = writable<LockInfo | null>(null);

/**
 * Callback set by the conflict dialog. Resolves with `true` (open read-only)
 * or `false` (cancel — do not open the workspace).
 */
let lockConflictResolver: ((readonly: boolean) => void) | null = null;

/** Called by the conflict dialog when the user makes a choice. */
export function resolveLockConflict(openReadOnly: boolean) {
  pendingLockConflict.set(null);
  lockConflictResolver?.(openReadOnly);
  lockConflictResolver = null;
}

async function showLockConflictDialog(lockInfo: LockInfo): Promise<boolean> {
  return new Promise((resolve) => {
    lockConflictResolver = resolve;
    pendingLockConflict.set(lockInfo);
  });
}

// ---------------------------------------------------------------------------
// Workspace open
// ---------------------------------------------------------------------------

/** Point explorer at `path`, swap per-project chat + editor tabs from `.sidebar/state.json`. */
export async function applyWorkspaceFolder(path: string): Promise<boolean> {
  const normalized = normalizeFilePath(path.trim());

  if (isTauriAvailable()) {
    try {
      const result = await acquireWorkspaceLock(normalized);
      if (result.kind === "ConflictLive") {
        const openReadOnly = await showLockConflictDialog(result.lock_info);
        if (!openReadOnly) {
          return false; // User cancelled — don't open the folder.
        }
        workspaceReadOnly.set(true);
      } else {
        workspaceReadOnly.set(false);
      }
    } catch (e) {
      // Lock acquisition failed (permissions, etc.) — proceed without lock.
      console.warn("[workspace-lock] acquire failed, proceeding without lock:", e);
      workspaceReadOnly.set(false);
    }
  }

  const { switchProjectWorkspace } = await import("./projectState");
  const { resolveWorkspaceTrustOnOpen } = await import("./workspaceTrust");

  const trust = await resolveWorkspaceTrustOnOpen(normalized);
  if (trust === "cancel") {
    if (isTauriAvailable()) {
      await releaseWorkspaceLock(normalized).catch(() => {});
    }
    return false;
  }

  await switchProjectWorkspace(normalized);

  if (isTauriAvailable()) {
    try {
      await watchWorkspace(normalized);
    } catch (e) {
      console.error("Failed to start workspace watcher:", e);
    }
    // Best-effort — don't block open on a failed write.
    addRecentProject(normalized).catch(() => {});
  }

  return true;
}

/** Refresh children under the workspace root, preserving expanded subfolder states. */
export async function refreshWorkspaceTree(workspacePath: string): Promise<void> {
  const normalized = normalizeFilePath(workspacePath.trim());
  const raw = await listDir(null, normalized);
  const children = raw.map((x) => normalizeFileEntry(x as FileEntry & { isDir?: boolean }));
  const root = get(files).tree.find((e) => normalizeFilePath(e.path) === normalized);
  if (root) {
    // Tree already initialised — merge so expanded subdirs stay open.
    files.setChildren(normalized, children);
  } else {
    files.setTree(buildWorkspaceTree(normalized, children, true));
  }
}
