import { writable } from "svelte/store";

/** Relative workspace paths → error diagnostic count (for explorer folder badges). */
export const editorErrorCountsByRel = writable<Map<string, number>>(new Map());

export function setEditorErrorCounts(counts: Map<string, number>): void {
  editorErrorCountsByRel.set(counts);
}
