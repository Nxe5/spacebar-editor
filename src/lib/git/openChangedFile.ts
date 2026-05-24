import { normalizeFilePath } from "../fsPath";
import { gitFileAtHead, readFile, getLanguageFromPath } from "../ipc";
import { workbench } from "../stores/workbench";

export function gitPathToAbsolute(workspacePath: string, relPath: string): string {
  const root = normalizeFilePath(workspacePath);
  const rel = relPath.replace(/^\.\/+/, "");
  return normalizeFilePath(`${root}/${rel}`);
}

/** Open working-tree file with green/red diff highlights vs HEAD. */
export async function openGitDiffFile(workspacePath: string, relPath: string): Promise<void> {
  const abs = gitPathToAbsolute(workspacePath, relPath);
  const content = await readFile(abs);
  const head = await gitFileAtHead(workspacePath, relPath);
  const name = abs.split("/").pop() ?? relPath;
  workbench.openEditorFile({
    path: abs,
    name: `${name} (changes)`,
    content,
    isDirty: false,
    language: getLanguageFromPath(abs),
    diffBase: head ?? "",
  });
}

/** Open file for normal editing (no diff overlay). */
export async function openGitFileNormal(workspacePath: string, relPath: string): Promise<void> {
  const abs = gitPathToAbsolute(workspacePath, relPath);
  const content = await readFile(abs);
  const name = abs.split("/").pop() ?? relPath;
  workbench.openEditorFile({
    path: abs,
    name,
    content,
    isDirty: false,
    language: getLanguageFromPath(abs),
  });
}
