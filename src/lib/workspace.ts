import { get } from "svelte/store";
import { files, type FileEntry } from "./stores/files";
import { listDir, watchWorkspace, isTauriAvailable } from "./ipc";
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

/** Point explorer at `path`, swap per-project chat + editor tabs from `.tinyllama/state.json`. */
export async function applyWorkspaceFolder(path: string): Promise<void> {
  const { switchProjectWorkspace } = await import("./projectState");
  await switchProjectWorkspace(path);
  if (isTauriAvailable()) {
    try {
      await watchWorkspace(normalizeFilePath(path.trim()));
    } catch (e) {
      console.error("Failed to start workspace watcher:", e);
    }
  }
}

/** Refresh children under the workspace root (keeps root expanded state). */
export async function refreshWorkspaceTree(workspacePath: string): Promise<void> {
  const normalized = normalizeFilePath(workspacePath.trim());
  const raw = await listDir(normalized);
  const children = raw.map((x) => normalizeFileEntry(x as FileEntry & { isDir?: boolean }));
  const root = get(files).tree.find((e) => normalizeFilePath(e.path) === normalized);
  const expanded = root?.expanded ?? true;
  files.setTree(buildWorkspaceTree(normalized, children, expanded));
}
