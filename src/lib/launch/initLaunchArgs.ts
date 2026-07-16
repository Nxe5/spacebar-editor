import { normalizeFilePath } from "../fsPath";
import {
  getLanguageFromPath,
  getLaunchArgs,
  isTauriAvailable,
  readFile,
  type LaunchArgs,
} from "../ipc";
import { layoutOverride } from "../stores/layoutOverride";
import { workbench } from "../stores/workbench";
import { applyWorkspaceFolder } from "../workspace";
import { MICRO_EDITOR_LAYOUT } from "./microEditorLayout";

/** Parent directory of a normalized absolute file path. */
export function parentDirectory(filePath: string): string {
  const normalized = normalizeFilePath(filePath);
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return normalized.startsWith("/") ? "/" : normalized;
  return normalized.slice(0, idx) || "/";
}

/** Apply CLI launch args: `spacebar <file>` → micro editor; `spacebar <dir>` → workspace. */
export async function handleLaunchArgs(launch: LaunchArgs): Promise<boolean> {
  if (!launch.path) return false;

  if (launch.is_file) {
    const filePath = normalizeFilePath(launch.path);
    const parentDir = parentDirectory(filePath);
    const opened = await applyWorkspaceFolder(parentDir);
    if (!opened) return false;

    const content = await readFile(null, filePath);
    workbench.openEditorFile({
      path: filePath,
      name: filePath.split("/").pop() ?? filePath,
      content,
      isDirty: false,
      language: getLanguageFromPath(filePath),
    });
    layoutOverride.set(MICRO_EDITOR_LAYOUT);
    return true;
  }

  const opened = await applyWorkspaceFolder(normalizeFilePath(launch.path));
  return opened;
}

let launchInitStarted = false;

/** @internal tests */
export function resetLaunchInitForTests(): void {
  launchInitStarted = false;
}

/**
 * Run once at app startup (WorkbenchShell mount). Must not live in FileTree —
 * that component only mounts after a workspace is already open.
 */
export async function initLaunchArgs(): Promise<boolean> {
  if (!isTauriAvailable() || launchInitStarted) return false;
  launchInitStarted = true;

  try {
    const launch = await getLaunchArgs();
    return await handleLaunchArgs(launch);
  } catch (e) {
    console.error("[launch] failed to apply CLI args:", e);
    return false;
  }
}
