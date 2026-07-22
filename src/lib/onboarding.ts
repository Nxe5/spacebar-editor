/** First-run onboarding flag (theme → provider → project wizard). */
import { isTauriAvailable, readOnboardingComplete, writeOnboardingComplete } from "./ipc";

const STORAGE_KEY = "sidebar.onboarding.v1";

/** Synchronous localStorage check — a fast hint; the source of truth on desktop is the shared file. */
export function isOnboardingComplete(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    return localStorage.getItem(STORAGE_KEY) != null;
  } catch {
    return true;
  }
}

/**
 * Authoritative onboarding check. On desktop this reads the shared config file
 * (survives updates and is shared across all windows, including independent
 * windows whose localStorage is isolated), migrating a legacy localStorage flag
 * to disk on first run. In the browser it falls back to localStorage.
 */
export async function isOnboardingCompleteAsync(): Promise<boolean> {
  if (!isTauriAvailable()) return isOnboardingComplete();
  try {
    if (await readOnboardingComplete()) return true;
    // Migrate an existing localStorage flag (pre-shared-file installs) to disk.
    if (isOnboardingComplete()) {
      await writeOnboardingComplete();
      return true;
    }
    return false;
  } catch {
    return isOnboardingComplete();
  }
}

export function markOnboardingComplete(): void {
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ completedAt: Date.now() }));
    } catch {
      /* ignore */
    }
  }
  // Persist to the shared file so the wizard never runs again in any window.
  void writeOnboardingComplete();
}
