import { writable, get } from "svelte/store";
import {
  applyContextAppearanceToDocument,
  clearContextAppearanceInlineOverrides,
  defaultContextAppearance,
  hasSavedContextAppearance,
  loadContextAppearance,
  readContextAppearanceFromDocument,
  saveContextAppearance,
  type ContextAppearanceMap,
} from "../chat/contextAppearance";

function createContextAppearanceStore() {
  const { subscribe, set } = writable<ContextAppearanceMap>(loadContextAppearance());

  return {
    subscribe,
    get: () => get({ subscribe }),

    init() {
      const hasSaved = hasSavedContextAppearance();
      const appearance = hasSaved
        ? loadContextAppearance()
        : readContextAppearanceFromDocument();
      set(appearance);
      if (hasSaved) {
        applyContextAppearanceToDocument(appearance);
      }
    },

    apply(appearance: ContextAppearanceMap) {
      set(appearance);
      applyContextAppearanceToDocument(appearance);
    },

    persist(appearance: ContextAppearanceMap) {
      saveContextAppearance(appearance);
      set(appearance);
      applyContextAppearanceToDocument(appearance);
    },

    resetToDefaults() {
      const appearance = defaultContextAppearance();
      saveContextAppearance(appearance);
      set(appearance);
      applyContextAppearanceToDocument(appearance);
      return appearance;
    },

    syncFromActiveTheme(): ContextAppearanceMap {
      clearContextAppearanceInlineOverrides();
      const appearance = readContextAppearanceFromDocument();
      set(appearance);
      return appearance;
    },
  };
}

export const contextAppearance = createContextAppearanceStore();
