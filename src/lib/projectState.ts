import { get } from "svelte/store";
import { chat, type ChatSession } from "./stores/chat";
import { files } from "./stores/files";
import { workbench, type WorkbenchTab } from "./stores/workbench";
import { normalizeFilePath } from "./fsPath";
import {
  readFile,
  readProjectState,
  writeProjectState,
  isTauriAvailable,
} from "./ipc";
import { reloadProjectTools } from "./stores/toolPolicy";
import { systemPrompts } from "./stores/systemPrompts";
import { skills } from "./stores/skills";
import { buildWorkspaceTree, normalizeFileEntry } from "./workspace";
import type { FileEntry } from "./stores/files";
import { listDir } from "./ipc";

export const PROJECT_STATE_VERSION = 1 as const;

export type PersistedProjectState = {
  version: typeof PROJECT_STATE_VERSION;
  chat: {
    sessions: ChatSession[];
    history: ChatSession[];
    activeSessionId: string | null;
  };
  workbench: {
    tabs: Array<Extract<WorkbenchTab, { kind: "editor" }>>;
    activeTabId: string | null;
  };
};

/** In-browser dev: per-folder snapshots when Tauri is unavailable. */
const memoryByWorkspace = new Map<string, PersistedProjectState>();

let activeWorkspace: string | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function isPathInWorkspace(filePath: string, workspacePath: string): boolean {
  const root = normalizeFilePath(workspacePath);
  const p = normalizeFilePath(filePath);
  return p === root || p.startsWith(`${root}/`);
}

export function buildProjectStateSnapshot(workspacePath: string): PersistedProjectState {
  const $chat = get(chat);
  const $wb = get(workbench);
  const editorTabs = $wb.tabs.filter(
    (t): t is Extract<WorkbenchTab, { kind: "editor" }> =>
      t.kind === "editor" && isPathInWorkspace(t.path, workspacePath)
  );
  let activeTabId = $wb.activeTabId;
  if (activeTabId && !editorTabs.some((t) => t.id === activeTabId)) {
    activeTabId = editorTabs[0]?.id ?? null;
  }

  return {
    version: PROJECT_STATE_VERSION,
    chat: {
      sessions: $chat.sessions,
      history: $chat.history,
      activeSessionId: $chat.activeSessionId,
    },
    workbench: {
      tabs: editorTabs,
      activeTabId,
    },
  };
}

function defaultProjectState(): PersistedProjectState {
  const session = {
    id: crypto.randomUUID(),
    title: "New chat",
    messages: [],
    updatedAt: Date.now(),
  };
  return {
    version: PROJECT_STATE_VERSION,
    chat: {
      sessions: [session],
      history: [],
      activeSessionId: session.id,
    },
    workbench: { tabs: [], activeTabId: null },
  };
}

export function parseProjectState(raw: string): PersistedProjectState | null {
  try {
    const v = JSON.parse(raw) as PersistedProjectState;
    if (v?.version !== PROJECT_STATE_VERSION) return null;
    if (!v.chat || !Array.isArray(v.chat.sessions)) return null;
    if (!v.workbench || !Array.isArray(v.workbench.tabs)) return null;
    return v;
  } catch {
    return null;
  }
}

function sanitizeLoadedState(
  state: PersistedProjectState,
  workspacePath: string
): PersistedProjectState {
  const root = normalizeFilePath(workspacePath);
  const tabs = state.workbench.tabs.filter(
    (t) => t.kind === "editor" && isPathInWorkspace(t.path, root)
  );
  let activeTabId = state.workbench.activeTabId;
  if (activeTabId && !tabs.some((t) => t.id === activeTabId)) {
    activeTabId = tabs[0]?.id ?? null;
  }

  let sessions = state.chat.sessions;
  if (!sessions.length) {
    const s = defaultProjectState().chat.sessions[0];
    sessions = [s];
  }
  let activeSessionId = state.chat.activeSessionId;
  if (!activeSessionId || !sessions.some((s) => s.id === activeSessionId)) {
    activeSessionId = sessions[0]?.id ?? null;
  }

  return {
    version: PROJECT_STATE_VERSION,
    chat: {
      sessions,
      history: Array.isArray(state.chat.history) ? state.chat.history : [],
      activeSessionId,
    },
    workbench: { tabs, activeTabId },
  };
}

async function loadStateFromDisk(workspacePath: string): Promise<PersistedProjectState> {
  const root = normalizeFilePath(workspacePath);
  if (isTauriAvailable()) {
    try {
      const raw = await readProjectState(root);
      if (raw) {
        const parsed = parseProjectState(raw);
        if (parsed) return sanitizeLoadedState(parsed, root);
      }
    } catch {
      /* use default */
    }
    return defaultProjectState();
  }
  return memoryByWorkspace.get(root) ?? defaultProjectState();
}

async function saveStateToDisk(
  workspacePath: string,
  state: PersistedProjectState
): Promise<void> {
  const root = normalizeFilePath(workspacePath);
  const json = JSON.stringify(state, null, 2);
  if (isTauriAvailable()) {
    try {
      await writeProjectState(root, json);
    } catch (e) {
      console.warn("Failed to save project state:", e);
    }
    return;
  }
  memoryByWorkspace.set(root, state);
}

export async function persistCurrentProjectState(
  workspacePath?: string | null
): Promise<void> {
  const ws = workspacePath ?? get(files).workspacePath;
  if (!ws?.trim()) return;
  const snapshot = buildProjectStateSnapshot(ws);
  await saveStateToDisk(ws, snapshot);
}

function schedulePersist(workspacePath: string) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (activeWorkspace === workspacePath) {
      void persistCurrentProjectState(workspacePath);
    }
  }, 1200);
}

/** Debounced save when chat or workbench changes for the open project. */
export function initProjectStateAutosave(): void {
  chat.subscribe(() => {
    const ws = get(files).workspacePath;
    if (ws && ws === activeWorkspace) schedulePersist(ws);
  });
  workbench.subscribe(() => {
    const ws = get(files).workspacePath;
    if (ws && ws === activeWorkspace) schedulePersist(ws);
  });
}

async function teardownWorkspaceUi(): Promise<void> {
  workbench.closeAllTabs();
  files.clearOpenFiles();
  if (activeWorkspace) {
    const { stopLspForWorkspace } = await import("./lsp/lspStore");
    stopLspForWorkspace(activeWorkspace);
  }
}

async function applyLoadedState(state: PersistedProjectState): Promise<void> {
  chat.replaceProjectState(state.chat);
  workbench.replaceProjectState(state.workbench);

  if (isTauriAvailable()) {
    await workbench.hydrateEditorTabs((path) => readFile(null, path));
  }
}

async function loadWorkspaceTree(workspacePath: string): Promise<void> {
  const normalized = normalizeFilePath(workspacePath.trim());
  const raw = await listDir(null, normalized);
  const children = raw.map((x) => normalizeFileEntry(x as FileEntry & { isDir?: boolean }));
  files.setTree(buildWorkspaceTree(normalized, children, true));
}

/**
 * Switch the open project folder: save previous project UI state, clear tabs/chats
 * from other projects, load `.sidebar/state.json` for the new folder.
 */
export async function switchProjectWorkspace(path: string): Promise<void> {
  const normalized = normalizeFilePath(path.trim());
  if (!normalized) return;

  if (activeWorkspace === normalized) {
    const { refreshWorkspaceTree } = await import("./workspace");
    await refreshWorkspaceTree(normalized);
    return;
  }

  if (activeWorkspace) {
    await persistCurrentProjectState(activeWorkspace);
  }
  // Always clear the previous UI (tabs + open buffers) before loading the new
  // project — including the first real open coming from the welcome preview,
  // where `activeWorkspace` is still null. Otherwise stale editor buffers leak
  // across projects and stay visible with no matching tab to close.
  await teardownWorkspaceUi();

  files.setWorkspacePath(normalized);
  await loadWorkspaceTree(normalized);

  const state = await loadStateFromDisk(normalized);
  await applyLoadedState(state);

  activeWorkspace = normalized;

  if (isTauriAvailable()) {
    void systemPrompts.load(normalized);
    void skills.load(normalized);
    await reloadProjectTools(normalized);
  }
}

/** @internal tests */
export function resetProjectStateTrackingForTests(): void {
  activeWorkspace = null;
  memoryByWorkspace.clear();
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}
