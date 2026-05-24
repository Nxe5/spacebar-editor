import type { GitPathStatus } from "$lib/gitTypes";
import { normalizeFilePath } from "$lib/fsPath";

export type FileGitBadge = "M" | "U" | "A" | "D" | null;

export type FileGitTone = "modified" | "untracked" | null;

export type FolderTreeTone = "error" | "open" | "untracked" | "modified" | null;

/** Relative repo path → git row. */
export function buildGitStatusByRelPath(rows: GitPathStatus[]): Map<string, GitPathStatus> {
  const map = new Map<string, GitPathStatus>();
  for (const row of rows) {
    map.set(normalizeFilePath(row.path), row);
  }
  return map;
}

export function relPathFromWorkspace(workspacePath: string, absPath: string): string | null {
  const ws = normalizeFilePath(workspacePath).replace(/\/$/, "");
  const abs = normalizeFilePath(absPath);
  if (!abs.startsWith(ws)) return null;
  const rel = abs.slice(ws.length).replace(/^\//, "");
  return rel || null;
}

export function fileGitBadge(row: GitPathStatus | undefined): FileGitBadge {
  if (!row) return null;
  const wt = row.worktree;
  const idx = row.index;
  if (wt === "??" || idx === "??") return "U";
  if (wt.includes("M") || idx.includes("M")) return "M";
  if (wt.includes("A") || idx.includes("A")) return "A";
  if (wt.includes("D") || idx.includes("D")) return "D";
  return null;
}

export function fileGitTone(row: GitPathStatus | undefined): FileGitTone {
  const badge = fileGitBadge(row);
  if (badge === "U") return "untracked";
  if (badge === "M") return "modified";
  return null;
}

function pathIsUnderDir(dirPath: string, targetPath: string): boolean {
  const dir = normalizeFilePath(dirPath).replace(/\/$/, "");
  const target = normalizeFilePath(targetPath);
  if (!dir) return true;
  return target === dir || target.startsWith(`${dir}/`);
}

function folderRelPath(workspacePath: string, folderAbsPath: string): string | null {
  const rel = relPathFromWorkspace(workspacePath, folderAbsPath);
  if (rel != null) return rel;
  const ws = normalizeFilePath(workspacePath).replace(/\/$/, "");
  if (normalizeFilePath(folderAbsPath).replace(/\/$/, "") === ws) return "";
  return null;
}

/** Folder decoration from git rows, open editor paths, and per-file error counts. */
export function folderTreeTone(
  folderAbsPath: string,
  gitByRel: Map<string, GitPathStatus>,
  workspacePath: string,
  openFilePaths: string[],
  errorCountByRel: Map<string, number>
): { tone: FolderTreeTone; errorCount: number } {
  const folderRel = folderRelPath(workspacePath, folderAbsPath);
  if (folderRel == null) return { tone: null, errorCount: 0 };

  let errorCount = 0;
  let hasUntracked = false;
  let hasModified = false;

  for (const [rel, row] of gitByRel) {
    if (!pathIsUnderDir(folderRel, rel)) continue;
    const badge = fileGitBadge(row);
    if (badge === "U") hasUntracked = true;
    if (badge === "M") hasModified = true;
  }

  for (const [rel, count] of errorCountByRel) {
    if (count > 0 && pathIsUnderDir(folderRel, rel)) {
      errorCount += count;
    }
  }

  const hasOpenFile = openFilePaths.some((p) => pathIsUnderDir(folderAbsPath, p));

  if (errorCount > 0) return { tone: "error", errorCount };
  if (hasOpenFile) return { tone: "open", errorCount: 0 };
  if (hasUntracked) return { tone: "untracked", errorCount: 0 };
  if (hasModified) return { tone: "modified", errorCount: 0 };
  return { tone: null, errorCount: 0 };
}
