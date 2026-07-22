/**
 * Crash recovery for the workbench webview.
 *
 * If the WKWebView content process crashes (observed during heavy agent runs),
 * Tauri reloads the page in the SAME process. This module records the active
 * workspace so that reload can reopen it. Whether a given page load is a crash
 * reload (restore) or a fresh app launch (start on the welcome screen) is
 * decided by the backend `take_is_webview_reload` latch — NOT by this file — so
 * a normal close-and-reopen reliably lands on the welcome screen even when the
 * webview never fires `beforeunload` on quit.
 *
 * The workspace marker is consumed on read and re-recorded only once a project
 * opens successfully, so a workspace that crashes the app while loading gets one
 * restore attempt, never a crash loop.
 */

const WORKSPACE_KEY = "spacebar.lastWorkspace.v1";

/** Call when a project opens successfully; arms crash restore for this window. */
export function recordActiveWorkspace(path: string): void {
  try {
    localStorage.setItem(WORKSPACE_KEY, path);
  } catch {
    // storage unavailable (private mode / corrupted profile) — restore is best-effort
  }
}

/**
 * The workspace to reopen after a crash reload, or null. Consumes the marker so
 * a load-time crash can't loop; a successful open re-records it.
 */
export function takeCrashRestoreWorkspace(): string | null {
  try {
    const path = localStorage.getItem(WORKSPACE_KEY);
    localStorage.removeItem(WORKSPACE_KEY);
    return path || null;
  } catch {
    return null;
  }
}
