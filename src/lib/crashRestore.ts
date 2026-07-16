/**
 * Crash recovery for the workbench webview.
 *
 * If the WKWebView content process crashes (observed during heavy agent runs),
 * Tauri reloads the page and the app boots to the welcome screen with the
 * project gone. Track the active workspace in localStorage plus a clean-exit
 * marker so an unclean reload can reopen the project the user was in.
 *
 * The restore marker is consumed on read: a workspace that crashes the app
 * while loading gets exactly one restore attempt, never a crash loop.
 */

const WORKSPACE_KEY = "spacebar.lastWorkspace.v1";
const CLEAN_EXIT_KEY = "spacebar.cleanExit.v1";

/** Call when a project opens successfully; re-arms crash detection. */
export function recordActiveWorkspace(path: string): void {
  try {
    localStorage.setItem(WORKSPACE_KEY, path);
    localStorage.removeItem(CLEAN_EXIT_KEY);
  } catch {
    // storage unavailable (private mode / corrupted profile) — restore is best-effort
  }
}

/** Call from beforeunload — a graceful shutdown must not trigger a restore. */
export function markCleanExit(): void {
  try {
    localStorage.setItem(CLEAN_EXIT_KEY, "1");
  } catch {
    // ignore
  }
}

/**
 * Workspace path to reopen after an unclean reload, or null.
 * Consumes the marker so the caller gets a single restore attempt.
 */
export function takeCrashRestoreWorkspace(): string | null {
  try {
    const path = localStorage.getItem(WORKSPACE_KEY);
    const cleanExit = localStorage.getItem(CLEAN_EXIT_KEY) === "1";
    localStorage.setItem(CLEAN_EXIT_KEY, "1");
    if (!path || cleanExit) return null;
    return path;
  } catch {
    return null;
  }
}
