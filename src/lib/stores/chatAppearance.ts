import { writable, get } from "svelte/store";
import {
  applyChatAppearanceToDocument,
  clearChatAppearanceInlineOverrides,
  defaultChatAppearance,
  loadChatAppearance,
  readChatAppearanceFromDocument,
  saveChatAppearance,
  type ChatAppearanceMap,
} from "../chat/chatAppearance";

function createChatAppearanceStore() {
  const { subscribe, set } = writable<ChatAppearanceMap>(loadChatAppearance());

  return {
    subscribe,
    get: () => get({ subscribe }),

    init() {
      const appearance = loadChatAppearance();
      set(appearance);
      applyChatAppearanceToDocument(appearance);
    },

    apply(appearance: ChatAppearanceMap) {
      set(appearance);
      applyChatAppearanceToDocument(appearance);
    },

    persist(appearance: ChatAppearanceMap) {
      saveChatAppearance(appearance);
      set(appearance);
      applyChatAppearanceToDocument(appearance);
    },

    resetToDefaults() {
      const appearance = defaultChatAppearance();
      saveChatAppearance(appearance);
      set(appearance);
      applyChatAppearanceToDocument(appearance);
      return appearance;
    },

    syncFromActiveTheme(): ChatAppearanceMap {
      clearChatAppearanceInlineOverrides();
      const appearance = readChatAppearanceFromDocument(get({ subscribe }));
      set(appearance);
      return appearance;
    },
  };
}

export const chatAppearance = createChatAppearanceStore();
