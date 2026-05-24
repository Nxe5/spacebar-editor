import { writable } from "svelte/store";

/** Increment to signal Git panel (and other git UI) should reload status. */
export const gitRefresh = writable(0);

export function bumpGitRefresh(): void {
  gitRefresh.update((n) => n + 1);
}
