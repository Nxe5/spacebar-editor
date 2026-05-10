import { files, type FileEntry } from "./stores/files";
import { listDir } from "./ipc";
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

/** Point explorer (and new terminals) at `path` and refresh the tree from disk. */
export async function applyWorkspaceFolder(path: string): Promise<void> {
  const normalized = normalizeFilePath(path.trim());
  files.setWorkspacePath(normalized);
  const raw = await listDir(normalized);
  files.setTree(raw.map((x) => normalizeFileEntry(x as FileEntry & { isDir?: boolean })));
}
