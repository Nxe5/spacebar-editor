import { writable, get, derived } from "svelte/store";
import type { ChatMode } from "./mode";
import { currentMode } from "./mode";
import { files } from "./files";
import { defaultPromptsConfig } from "../systemPrompts/config";
import {
  combinePromptContents,
  isPromptFilePath,
  promptFilePath,
} from "../systemPrompts/config";
import { defaultPromptContentForEntry } from "../systemPrompts/config";
import {
  createPromptFile,
  deletePromptFile,
  initializePromptFiles,
  readPromptsWorkspace,
  savePromptFileContent,
  savePromptsConfig,
} from "../systemPrompts/workspace";
import type { SystemPromptEntry, SystemPromptsState } from "../systemPrompts/types";
import { readFile, isTauriAvailable } from "../ipc";

function defaultState(): SystemPromptsState {
  return {
    entries: defaultPromptsConfig().prompts,
    contents: {},
    loaded: true,
    initialized: false,
  };
}

function applySnapshot(snapshot: {
  config: { prompts: SystemPromptEntry[] };
  contents: Record<string, string>;
  initialized: boolean;
}): SystemPromptsState {
  return {
    entries: snapshot.config.prompts,
    contents: snapshot.contents,
    loaded: true,
    initialized: snapshot.initialized,
  };
}

function createSystemPromptsStore() {
  const { subscribe, set, update } = writable<SystemPromptsState>(defaultState());
  let lastWorkspacePath: string | null = null;

  async function reloadEntryContent(workspacePath: string, filename: string): Promise<void> {
    try {
      const content = await readFile(workspacePath, promptFilePath(workspacePath, filename));
      update((s) => ({
        ...s,
        contents: { ...s.contents, [filename]: content },
      }));
    } catch {
      update((s) => ({
        ...s,
        contents: { ...s.contents, [filename]: "" },
      }));
    }
  }

  if (typeof window !== "undefined") {
    window.addEventListener("sidebar:editor-saved", () => {
      const ws = lastWorkspacePath ?? get(files).workspacePath;
      if (!ws) return;
      const active = get(files).activeFilePath;
      if (!active || !isPromptFilePath(active, ws)) return;
      const filename = active.split("/").pop();
      if (filename) void reloadEntryContent(ws, filename);
    });
  }

  return {
    subscribe,

    async load(workspacePath: string): Promise<void> {
      lastWorkspacePath = workspacePath;
      if (!isTauriAvailable()) {
        set(defaultState());
        return;
      }
      try {
        const snapshot = await readPromptsWorkspace(workspacePath);
        set(applySnapshot(snapshot));
      } catch (e) {
        console.warn("Failed to load system prompts:", e);
        set(defaultState());
      }
    },

    async initialize(workspacePath: string): Promise<void> {
      const snapshot = await initializePromptFiles(workspacePath);
      lastWorkspacePath = workspacePath;
      set(applySnapshot(snapshot));
    },

    clear(): void {
      set(defaultState());
      lastWorkspacePath = null;
    },

    combinedForMode(mode: ChatMode): string {
      const state = get({ subscribe });
      return combinePromptContents(state.entries, state.contents, mode);
    },

    async setModes(workspacePath: string, id: string, modes: ChatMode[]): Promise<void> {
      const state = get({ subscribe });
      if (!state.initialized) {
        throw new Error("Create prompt files first.");
      }
      let next: SystemPromptEntry[] = [];
      update((s) => {
        next = s.entries.map((e) => {
          if (e.id !== id) return e;
          const enabled = modes.length === 0 ? false : e.enabled;
          return { ...e, modes, enabled };
        });
        return { ...s, entries: next };
      });
      const config = await savePromptsConfig(workspacePath, next);
      update((s) => ({ ...s, entries: config.prompts }));
    },

    async setEnabled(workspacePath: string, id: string, enabled: boolean): Promise<void> {
      const state = get({ subscribe });
      if (!state.initialized) {
        throw new Error("Create prompt files first.");
      }
      let next: SystemPromptEntry[] = [];
      update((s) => {
        next = s.entries.map((e) => (e.id === id ? { ...e, enabled } : e));
        return { ...s, entries: next };
      });
      const config = await savePromptsConfig(workspacePath, next);
      update((s) => ({ ...s, entries: config.prompts }));
    },

    async addPrompt(
      workspacePath: string,
      displayName: string,
      initialContent?: string
    ): Promise<SystemPromptEntry | null> {
      const state = get({ subscribe });
      if (!state.initialized) {
        throw new Error("Create prompt files first.");
      }
      const name = displayName.trim();
      if (!name) return null;
      const { entry, content } = await createPromptFile(
        workspacePath,
        state.entries,
        name,
        initialContent
      );
      const next = [...state.entries, entry];
      const config = await savePromptsConfig(workspacePath, next);
      update((s) => ({
        ...s,
        entries: config.prompts,
        contents: { ...s.contents, [entry.filename]: content },
      }));
      return entry;
    },

    async removePrompt(workspacePath: string, id: string): Promise<void> {
      const state = get({ subscribe });
      if (!state.initialized) {
        throw new Error("Create prompt files first.");
      }
      const entry = state.entries.find((e) => e.id === id);
      if (!entry) return;
      const next = state.entries.filter((e) => e.id !== id);
      await deletePromptFile(workspacePath, entry);
      const config = await savePromptsConfig(workspacePath, next);
      update((s) => {
        const { [entry.filename]: _removed, ...rest } = s.contents;
        return { ...s, entries: config.prompts, contents: rest };
      });
    },

    async saveContent(workspacePath: string, id: string, content: string): Promise<void> {
      const state = get({ subscribe });
      if (!state.initialized) {
        throw new Error("Create prompt files first.");
      }
      const entry = state.entries.find((e) => e.id === id);
      if (!entry) return;
      await savePromptFileContent(workspacePath, entry, content);
      update((s) => ({
        ...s,
        contents: { ...s.contents, [entry.filename]: content },
      }));
    },

    async resetToDefault(workspacePath: string, id: string): Promise<void> {
      const state = get({ subscribe });
      if (!state.initialized) {
        throw new Error("Create prompt files first.");
      }
      const entry = state.entries.find((e) => e.id === id);
      if (!entry) return;
      const content = defaultPromptContentForEntry(entry);
      await this.saveContent(workspacePath, id, content);
    },

    async reload(): Promise<void> {
      if (lastWorkspacePath) await this.load(lastWorkspacePath);
    },

    promptPath(workspacePath: string, entry: SystemPromptEntry): string {
      return promptFilePath(workspacePath, entry.filename);
    },

    entryFileExists(entry: SystemPromptEntry): boolean {
      const state = get({ subscribe });
      return Object.hasOwn(state.contents, entry.filename);
    },
  };
}

export const systemPrompts = createSystemPromptsStore();

export const activeSystemPromptText = derived(
  [systemPrompts, currentMode],
  ([$prompts, $mode]) => combinePromptContents($prompts.entries, $prompts.contents, $mode)
);

/** @deprecated Use `systemPrompts` / `activeSystemPromptText`. */
export const systemPrompt = {
  subscribe: (run: (value: string) => void) =>
    activeSystemPromptText.subscribe(run),
  load: (workspacePath: string) => systemPrompts.load(workspacePath),
  clear: () => systemPrompts.clear(),
  reload: () => systemPrompts.reload(),
  get: () => systemPrompts.combinedForMode(get(currentMode)),
  save: async () => {
    throw new Error("Save prompt files from the editor — open a prompt from the sidebar.");
  },
};
