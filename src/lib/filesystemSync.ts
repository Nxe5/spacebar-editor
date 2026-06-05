import { get } from "svelte/store";
import { files, type FileEntry } from "./stores/files";
import { workbench, workbenchEditorTabId } from "./stores/workbench";
import { readFile, getLanguageFromPath, isTauriAvailable } from "./ipc";
import { normalizeFilePath } from "./fsPath";
import { normalizeFileEntry, refreshWorkspaceTree } from "./workspace";
import { resolveWorkspacePath } from "./tools/pathUtils";
import { bumpGitRefresh } from "./stores/gitRefresh";
import { pathsFromToolInput } from "./agent/toolDisplay";

function findEntry(entries: FileEntry[], path: string): FileEntry | null {
  const key = normalizeFilePath(path);
  for (const e of entries) {
    if (normalizeFilePath(e.path) === key) return e;
    if (e.children) {
      const found = findEntry(e.children, path);
      if (found) return found;
    }
  }
  return null;
}

function parentDir(filePath: string): string {
  const p = normalizeFilePath(filePath);
  const idx = p.lastIndexOf("/");
  if (idx <= 0) return p;
  return p.slice(0, idx) || "/";
}

/** Re-list one directory if it is already present in the explorer tree. */
export async function refreshDirectoryInTree(dirPath: string): Promise<void> {
  const { listDir } = await import("./ipc");
  const canon = normalizeFilePath(dirPath);
  const tree = get(files).tree;
  if (!findEntry(tree, canon)) return;
  const raw = await listDir(null, canon);
  const children = raw.map((c) => normalizeFileEntry(c as FileEntry & { isDir?: boolean }));
  files.setChildren(canon, children);
}

/** Refresh workspace root and any expanded folders so new files appear immediately. */
export async function refreshVisibleExplorer(workspacePath: string): Promise<void> {
  await refreshWorkspaceTree(workspacePath);

  async function refreshExpanded(entries: FileEntry[]): Promise<void> {
    for (const e of entries) {
      if (!e.is_dir || !e.expanded) continue;
      try {
        await refreshDirectoryInTree(e.path);
        const updated = findEntry(get(files).tree, e.path);
        if (updated?.children?.length) {
          await refreshExpanded(updated.children);
        }
      } catch {
        /* ignore missing dirs */
      }
    }
  }

  await refreshExpanded(get(files).tree);
}

function resolveToolPath(workspacePath: string, raw: string): string {
  return resolveWorkspacePath(workspacePath, raw);
}

const FS_MUTATING_TOOLS = new Set([
  "write_file",
  "create_file",
  "delete_file",
  "move_file",
]);

/** Sync explorer + editor after a successful filesystem tool from the agent. */
export async function syncUiAfterFilesystemTool(
  workspacePath: string,
  toolName: string,
  args: Record<string, unknown>,
  success: boolean
): Promise<void> {
  if (!success || !isTauriAvailable() || !FS_MUTATING_TOOLS.has(toolName)) return;

  const ws = normalizeFilePath(workspacePath);
  const paths = pathsFromToolInput(toolName, args, ws);

  await refreshVisibleExplorer(ws);

  for (const p of paths) {
    const parent = parentDir(p);
    if (parent && parent !== p && findEntry(get(files).tree, parent)) {
      await refreshDirectoryInTree(parent);
    }
  }

  if (toolName === "delete_file") {
    for (const p of paths) {
      files.closeFile(p);
      workbench.closeTab(workbenchEditorTabId(p));
    }
    return;
  }

  if (toolName === "move_file") {
    const from = typeof args.from === "string" ? resolveToolPath(ws, args.from) : null;
    const to = typeof args.to === "string" ? resolveToolPath(ws, args.to) : null;
    if (from) {
      files.closeFile(from);
      workbench.closeTab(workbenchEditorTabId(from));
    }
    if (to && !to.endsWith("/")) {
      await openFileFromDisk(to);
    }
    return;
  }

  if (toolName === "write_file") {
    for (const p of paths) {
      if (!p.endsWith("/")) {
        const canon = normalizeFilePath(p);
        const open = get(files).openFiles.find((f) => normalizeFilePath(f.path) === canon);
        if (open) await reloadOpenFileIfVisible(p);
        else await openFileFromDisk(p);
      }
    }
    return;
  }

  if (toolName === "create_file") {
    for (const p of paths) {
      if (!p.endsWith("/")) await openFileFromDisk(p);
    }
  }

  bumpGitRefresh();
}

async function reloadOpenFileIfVisible(path: string): Promise<void> {
  const canon = normalizeFilePath(path);
  const open = get(files).openFiles.find((f) => normalizeFilePath(f.path) === canon);
  if (!open) return;
  try {
    const content = await readFile(null, canon);
    files.openFile({
      ...open,
      content,
      isDirty: false,
      diffBase: undefined,
    });
  } catch {
    files.closeFile(canon);
    workbench.closeTab(workbenchEditorTabId(canon));
  }
}

/** Open a workspace file in the editor (e.g. from chat tool links). */
export async function openWorkspaceFile(path: string): Promise<void> {
  await openFileFromDisk(path);
}

async function openFileFromDisk(path: string): Promise<void> {
  const canon = normalizeFilePath(path);
  try {
    const content = await readFile(null, canon);
    const name = canon.split("/").pop() ?? canon;
    workbench.openEditorFile({
      path: canon,
      name,
      content,
      isDirty: false,
      language: getLanguageFromPath(canon),
    });
    workbench.syncFromOpenFiles();
  } catch {
    /* ignore */
  }
}
