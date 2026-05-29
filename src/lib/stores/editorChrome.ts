import { writable, get } from "svelte/store";
import {
  applyEditorChromeToDocument,
  defaultEditorChrome,
  loadEditorChrome,
  readEditorChromeFromDocument,
  saveEditorChrome,
  type EditorChromeMap,
} from "../editor/editorChrome";

function createEditorChromeStore() {
  const { subscribe, set, update } = writable<EditorChromeMap>(loadEditorChrome());

  return {
    subscribe,
    get: () => get({ subscribe }),

    init() {
      const colors = loadEditorChrome();
      set(colors);
      applyEditorChromeToDocument(colors);
    },

    apply(colors: EditorChromeMap) {
      set(colors);
      applyEditorChromeToDocument(colors);
    },

    persist(colors: EditorChromeMap) {
      saveEditorChrome(colors);
      set(colors);
      applyEditorChromeToDocument(colors);
    },

    resetToDefaults() {
      const colors = defaultEditorChrome();
      saveEditorChrome(colors);
      set(colors);
      applyEditorChromeToDocument(colors);
      return colors;
    },

    /** After workbench theme changes: read theme editor colors and apply (updates settings pickers when called from UI). */
    syncFromActiveTheme(): EditorChromeMap {
      const colors = readEditorChromeFromDocument();
      set(colors);
      applyEditorChromeToDocument(colors);
      return colors;
    },
  };
}

export const editorChrome = createEditorChromeStore();
