import { isTauriAvailable } from "./ipc";

/** True on macOS — the app uses native traffic-light window buttons there. */
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac/i.test(navigator.platform ?? "") || /Macintosh/i.test(navigator.userAgent ?? "");
}

async function getWindow() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

export async function minimizeAppWindow(): Promise<void> {
  if (!isTauriAvailable()) return;
  const win = await getWindow();
  await win.minimize();
}

export async function toggleMaximizeAppWindow(): Promise<boolean> {
  if (!isTauriAvailable()) return false;
  const win = await getWindow();
  await win.toggleMaximize();
  return win.isMaximized();
}

export async function closeAppWindow(): Promise<void> {
  if (!isTauriAvailable()) return;
  const win = await getWindow();
  await win.close();
}

export async function isAppWindowMaximized(): Promise<boolean> {
  if (!isTauriAvailable()) return false;
  const win = await getWindow();
  return win.isMaximized();
}
