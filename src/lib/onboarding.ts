/** First-run onboarding flag (theme → provider → project wizard). */
const STORAGE_KEY = "sidebar.onboarding.v1";

export function isOnboardingComplete(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    return localStorage.getItem(STORAGE_KEY) != null;
  } catch {
    return true;
  }
}

export function markOnboardingComplete(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ completedAt: Date.now() }));
  } catch {
    /* ignore */
  }
}
