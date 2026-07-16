import { writable, get, derived } from "svelte/store";
import { ptyClose, ptyCreate, isTauriAvailable } from "../ipc";
import { files } from "./files";

export type BottomTerminalSource = "user" | "agent";

export const AGENT_TERMINAL_AUTO_CLOSE_MS = 2000;

export type BottomTerminalTab = {
  id: string;
  /** Empty for read-only output tabs (no PTY). */
  sessionId: string;
  title: string;
  source: BottomTerminalSource;
  /** Read-only mirrored shell output (agent tabs only). */
  output?: string;
};

type BottomTerminalState = {
  tabs: BottomTerminalTab[];
  activeTabId: string | null;
  userCounter: number;
};

function createBottomTerminalsStore() {
  const state = writable<BottomTerminalState>({
    tabs: [],
    activeTabId: null,
    userCounter: 0,
  });

  function nextUserTitle(counter: number): string {
    return counter === 1 ? "Terminal" : `Terminal ${counter}`;
  }

  return {
    subscribe: state.subscribe,
    activeTab: derived(state, ($s) => $s.tabs.find((t) => t.id === $s.activeTabId) ?? null),

    async createTab(options?: {
      title?: string;
      source?: BottomTerminalSource;
      cwd?: string | null;
    }): Promise<BottomTerminalTab | null> {
      if (!isTauriAvailable()) return null;
      const cwd = options?.cwd ?? get(files).workspacePath ?? null;
      const sessionId = await ptyCreate(cwd);
      const source = options?.source ?? "user";
      let created: BottomTerminalTab | null = null;

      state.update((s) => {
        const userCounter = source === "user" ? s.userCounter + 1 : s.userCounter;
        const title =
          options?.title ??
          (source === "agent" ? "Agent" : nextUserTitle(userCounter));
        created = {
          id: `bt-${sessionId}`,
          sessionId,
          title,
          source,
        };
        return {
          tabs: [...s.tabs, created],
          activeTabId: created.id,
          userCounter,
        };
      });

      return created;
    },

    closeAgentTabs() {
      for (const tab of get(state).tabs.filter((t) => t.source === "agent")) {
        this.closeTab(tab.id);
      }
    },

    /** Read-only tab for mirrored agent shell output (no interactive PTY). */
    createOutputTab(options: {
      title?: string;
      output: string;
      source?: BottomTerminalSource;
      autoCloseMs?: number;
    }): BottomTerminalTab | null {
      if (!isTauriAvailable()) return null;

      this.closeAgentTabs();

      const id = `bt-out-${crypto.randomUUID()}`;
      const source = options.source ?? "agent";
      const autoCloseMs =
        options.autoCloseMs ??
        (source === "agent" ? AGENT_TERMINAL_AUTO_CLOSE_MS : undefined);

      let created: BottomTerminalTab | null = null;
      state.update((s) => {
        created = {
          id,
          sessionId: "",
          title: options.title ?? "Agent",
          source,
          output: options.output,
        };
        // Agent-opened tabs shouldn't steal focus from whatever the user is
        // looking at — only take over as active if nothing was selected yet.
        const activeTabId =
          source === "agent" && s.activeTabId != null ? s.activeTabId : created.id;
        return {
          tabs: [...s.tabs, created],
          activeTabId,
          userCounter: s.userCounter,
        };
      });

      if (autoCloseMs != null && autoCloseMs > 0) {
        setTimeout(() => this.closeTab(id), autoCloseMs);
      }

      return created;
    },

    setActiveTab(tabId: string) {
      state.update((s) =>
        s.tabs.some((t) => t.id === tabId) ? { ...s, activeTabId: tabId } : s
      );
    },

    closeTab(tabId: string) {
      state.update((s) => {
        const tab = s.tabs.find((t) => t.id === tabId);
        if (tab?.sessionId) void ptyClose(tab.sessionId);
        const tabs = s.tabs.filter((t) => t.id !== tabId);
        let activeTabId = s.activeTabId;
        if (activeTabId === tabId) {
          activeTabId = tabs[tabs.length - 1]?.id ?? null;
        }
        return { ...s, tabs, activeTabId };
      });
    },

    closeAll() {
      const tabs = get(state).tabs;
      for (const tab of tabs) {
        if (tab.sessionId) void ptyClose(tab.sessionId);
      }
      state.set({ tabs: [], activeTabId: null, userCounter: 0 });
    },

    /** @internal tests */
    resetForTests() {
      state.set({ tabs: [], activeTabId: null, userCounter: 0 });
    },
  };
}

export const bottomTerminals = createBottomTerminalsStore();
