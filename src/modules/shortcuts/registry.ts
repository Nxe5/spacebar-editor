import { writable } from "svelte/store";
import type { ShortcutId } from "./defaults";

const STORAGE_KEY = "tinyllama.shortcuts.v1";

function load(): Partial<Record<ShortcutId, string>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<Record<ShortcutId, string>>;
  } catch {
    return {};
  }
}

/** User chord overrides per shortcut id (optional). Empty means “use built-in defaults” from dispatcher. */
export const shortcutOverrides = writable<Partial<Record<ShortcutId, string>>>(load());

shortcutOverrides.subscribe((v) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  } catch {
    /* quota */
  }
});

export function resetShortcutOverrides() {
  shortcutOverrides.set({});
}
