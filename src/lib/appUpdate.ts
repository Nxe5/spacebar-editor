import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { isTauriAvailable, getPlatformInfo } from "./ipc";
import { updateStatus } from "./stores/updateStatus";

const PING_BASE_URL = import.meta.env.VITE_PING_BASE_URL ?? "https://ping.spacebar.dev";
const PING_TIMEOUT_MS = 5_000;
const RECHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const INSTALL_ID_KEY = "sidebar.installId";

/** Random per-install UUID, generated once and persisted — never derived from hardware. */
export function getOrCreateInstallId(): string {
  const existing = localStorage.getItem(INSTALL_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(INSTALL_ID_KEY, id);
  return id;
}

async function pingServer(version: string): Promise<boolean> {
  try {
    const { os, arch } = await getPlatformInfo();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), PING_TIMEOUT_MS);
    const res = await fetch(`${PING_BASE_URL}/v1/ping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version, os, arch, installId: getOrCreateInstallId() }),
      signal: ac.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Runs the ping (reachability + usage count) and the real Tauri updater check
 * in parallel, then combines them into one status. An available update always
 * shows yellow regardless of ping reachability — our own analytics server
 * being down shouldn't hide a real update. Red only means "no known update,
 * and we couldn't even reach our own server to ask."
 */
export async function checkForUpdates(): Promise<void> {
  if (!isTauriAvailable()) {
    updateStatus.set({
      dot: "idle",
      currentVersion: "",
      latestVersion: null,
      pendingUpdate: null,
      detail: "",
      checkedAt: null,
    });
    return;
  }

  const currentVersion = await getVersion().catch(() => "");

  const [reachable, update] = await Promise.all([
    pingServer(currentVersion),
    check().catch((): Update | null => null),
  ]);

  if (update) {
    updateStatus.set({
      dot: "yellow",
      currentVersion,
      latestVersion: update.version,
      pendingUpdate: update,
      detail: `v${update.version} available`,
      checkedAt: Date.now(),
    });
    return;
  }

  if (!reachable) {
    updateStatus.set({
      dot: "red",
      currentVersion,
      latestVersion: null,
      pendingUpdate: null,
      detail: "Can't reach update server",
      checkedAt: Date.now(),
    });
    return;
  }

  updateStatus.set({
    dot: "green",
    currentVersion,
    latestVersion: currentVersion,
    pendingUpdate: null,
    detail: "Up to date",
    checkedAt: Date.now(),
  });
}

let recheckTimer: ReturnType<typeof setInterval> | null = null;

/** Call once at app bootstrap. Runs an immediate check, then re-checks every 24h. */
export function startUpdateChecks(): void {
  void checkForUpdates();
  if (recheckTimer) clearInterval(recheckTimer);
  recheckTimer = setInterval(() => void checkForUpdates(), RECHECK_INTERVAL_MS);
}
