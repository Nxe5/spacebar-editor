/** Detect when the agent created a nested top-level project folder (Spec 40 §4). */

const PROJECT_MARKERS = ["package.json", "Cargo.toml", "pyproject.toml", "go.mod"] as const;

/** Extract top-level directory names created or targeted under workspace (depth 1). */
export function topLevelDirsFromShellCommand(
  command: string,
  workspacePath: string
): string[] {
  const dirs = new Set<string>();
  const ws = workspacePath.replace(/\/$/, "");
  const wsName = ws.split("/").filter(Boolean).pop() ?? "";

  const mkdirRe = /mkdir\s+(?:-p\s+)?["']?([^\s;&|"']+)/gi;
  let m: RegExpExecArray | null;
  while ((m = mkdirRe.exec(command)) !== null) {
    const raw = m[1].replace(/^["']|["']$/g, "");
    const first = raw.split("/").filter(Boolean)[0];
    if (first && first !== "." && first !== "..") dirs.add(first);
  }

  const cdRe = /(?:^|[;&|]\s*)cd\s+["']?([^\s;&|"']+)/gi;
  while ((m = cdRe.exec(command)) !== null) {
    const raw = m[1].replace(/^["']|["']$/g, "");
    const parts = raw.split("/").filter(Boolean);
    if (parts.length === 1 && parts[0] !== ".." && parts[0] !== wsName) {
      dirs.add(parts[0]);
    }
  }

  return [...dirs];
}

export function topLevelDirFromWritePath(
  workspacePath: string,
  filePath: string
): string | null {
  const ws = workspacePath.replace(/\/$/, "");
  const rel = filePath.startsWith(ws)
    ? filePath.slice(ws.length).replace(/^\//, "")
    : filePath.replace(/^\//, "");
  const first = rel.split("/").filter(Boolean)[0];
  if (!first || first === ".sidebar") return null;
  const depth = rel.split("/").filter(Boolean).length;
  return depth >= 2 ? first : null;
}

export function nestedScaffoldNoticeMessage(dirName: string): string {
  return `Agent created a nested project folder \`${dirName}/\`. If that should be the workspace root, open that folder with **File → Open folder**.`;
}

export function shouldFlagNestedScaffold(
  workspacePath: string,
  dirName: string,
  markerFileExists: (absPath: string) => boolean
): boolean {
  if (!dirName || dirName === ".sidebar") return false;
  const base = `${workspacePath.replace(/\/$/, "")}/${dirName}`;
  return PROJECT_MARKERS.some((name) => markerFileExists(`${base}/${name}`));
}
