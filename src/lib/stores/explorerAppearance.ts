import { writable, get } from "svelte/store";
import {
  applyExplorerAppearanceToDocument,
  defaultExplorerAppearance,
  loadExplorerAppearance,
  saveExplorerAppearance,
  type ExplorerAppearanceMap,
} from "../explorer/explorerAppearance";

function createExplorerAppearanceStore() {
  const { subscribe, set } = writable<ExplorerAppearanceMap>(loadExplorerAppearance());

  return {
    subscribe,
    get: () => get({ subscribe }),

    init() {
      const appearance = loadExplorerAppearance();
      set(appearance);
      applyExplorerAppearanceToDocument(appearance);
    },

    apply(appearance: ExplorerAppearanceMap) {
      set(appearance);
      applyExplorerAppearanceToDocument(appearance);
    },

    persist(appearance: ExplorerAppearanceMap) {
      saveExplorerAppearance(appearance);
      set(appearance);
      applyExplorerAppearanceToDocument(appearance);
    },

    resetToDefaults() {
      const appearance = defaultExplorerAppearance();
      saveExplorerAppearance(appearance);
      set(appearance);
      applyExplorerAppearanceToDocument(appearance);
      return appearance;
    },
  };
}

export const explorerAppearance = createExplorerAppearanceStore();
