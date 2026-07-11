import { writable } from "svelte/store";

/** Increment to request the bottom panel open (WorkbenchShell listens). */
export const bottomPanelOpenRequest = writable(0);

export function requestBottomPanelOpen(): void {
  bottomPanelOpenRequest.update((n) => n + 1);
}
