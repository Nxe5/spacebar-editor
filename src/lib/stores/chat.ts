import { writable, derived } from "svelte/store";

export interface StoredToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
  /** Claude extended thinking summary/text when the provider streamed it. */
  thinking?: string;
  /** Whimsical activity label for this assistant turn (e.g. "Deliberating"). */
  activityLabel?: string;
  toolCalls?: ToolCall[];
  /** OpenAI-style tool call ids for role=tool messages. */
  toolCallId?: string;
  toolName?: string;
  /** Parsed tool arguments (for UI). */
  toolInput?: Record<string, unknown>;
  /** Whether the tool succeeded. */
  toolSuccess?: boolean;
  /** Workspace file paths touched (for open-in-editor links). */
  toolPaths?: string[];
  /** Pre-write content for write_file / create_file diff bubbles. */
  fileDiffBefore?: string;
  /** Set on assistant messages that requested tools. */
  rawToolCalls?: StoredToolCall[];
  /** Git snapshot of the workspace immediately before this user message was sent. */
  checkpointOid?: string;
  /** Marks the synthetic summary message produced by context compaction (spec 21 §7.3). */
  compactionBoundary?: boolean;
}

export interface ToolCall {
  id: string;
  tool: string;
  input: unknown;
  output?: unknown;
  status: "pending" | "running" | "completed" | "error";
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  /** ISO timestamp of the last compaction (spec 21). */
  compactedAt?: string;
  /** Number of times this session has been compacted. */
  compactionCount?: number;
  /** Full message history saved before the last compaction — enables archive display and revert. */
  preCompactionMessages?: Message[];
  /** Set when the session lives in history (last closed time). */
  closedAt?: number;
}

export interface ChatState {
  /** Open working tabs (right strip). */
  sessions: ChatSession[];
  /** Closed sessions, sorted by `closedAt` descending after each close. */
  history: ChatSession[];
  activeSessionId: string | null;
  isStreaming: boolean;
  currentToolCall: ToolCall | null;
  /** Full history list replaces the message stream while true. */
  historyPickerOpen: boolean;
}

const MAX_HISTORY = 80;

function makeSession(title = "New chat"): ChatSession {
  const id = crypto.randomUUID();
  return { id, title, messages: [], updatedAt: Date.now() };
}

function stripClosedAt(s: ChatSession): ChatSession {
  const { closedAt: _c, ...rest } = s;
  return { ...rest, updatedAt: Date.now() };
}

function titleFromFirstAssistantReply(content: string): string {
  const t = content.trim().replace(/\s+/g, " ");
  if (!t) return "New chat";
  return t.length <= 48 ? t : `${t.slice(0, 48)}…`;
}

function createChatStore() {
  const first = makeSession();
  const { subscribe, set, update } = writable<ChatState>({
    sessions: [first],
    history: [],
    activeSessionId: first.id,
    isStreaming: false,
    currentToolCall: null,
    historyPickerOpen: false,
  });

  return {
    subscribe,
    /** Returns the new session id. */
    newSession: (): string => {
      let newId = "";
      update((s) => {
        const session = makeSession();
        newId = session.id;
        return {
          ...s,
          sessions: [session, ...s.sessions],
          activeSessionId: session.id,
          isStreaming: false,
          currentToolCall: null,
          historyPickerOpen: false,
        };
      });
      return newId;
    },
    setActiveSession: (sessionId: string) => {
      update((s) => {
        if (!s.sessions.some((x) => x.id === sessionId)) return s;
        return {
          ...s,
          activeSessionId: sessionId,
          isStreaming: false,
          currentToolCall: null,
          historyPickerOpen: false,
        };
      });
    },
    closeSession: (sessionId: string) => {
      update((s) => {
        const oldSessions = s.sessions;
        const idx = oldSessions.findIndex((x) => x.id === sessionId);
        if (idx < 0) return s;

        const removed = oldSessions[idx];
        const closed: ChatSession = {
          ...removed,
          closedAt: Date.now(),
          updatedAt: Date.now(),
        };
        const nextActiveCandidate =
          oldSessions[idx + 1]?.id ?? oldSessions[idx - 1]?.id ?? null;
        const sessions = oldSessions.filter((x) => x.id !== sessionId);
        const history = [closed, ...s.history.filter((h) => h.id !== closed.id)].slice(
          0,
          MAX_HISTORY
        );

        let activeSessionId = s.activeSessionId;
        if (activeSessionId === sessionId) {
          activeSessionId = sessions.length === 0 ? null : nextActiveCandidate;
        }

        const switched = activeSessionId !== s.activeSessionId;
        return {
          ...s,
          sessions,
          history,
          activeSessionId,
          isStreaming: switched ? false : s.isStreaming,
          currentToolCall: switched ? null : s.currentToolCall,
          historyPickerOpen: false,
        };
      });
    },
    reopenFromHistory: (sessionId: string) => {
      update((s) => {
        const hIdx = s.history.findIndex((h) => h.id === sessionId);
        if (hIdx < 0) return s;
        const entry = s.history[hIdx];
        const history = s.history.filter((_, i) => i !== hIdx);
        const session = stripClosedAt(entry);
        return {
          ...s,
          history,
          sessions: [session, ...s.sessions.filter((x) => x.id !== session.id)],
          activeSessionId: session.id,
          isStreaming: false,
          currentToolCall: null,
          historyPickerOpen: false,
        };
      });
    },
    addMessage: (message: Omit<Message, "id" | "timestamp">) => {
      update((s) => {
        const aid = s.activeSessionId;
        if (!aid) return s;

        const sessions = s.sessions.map((sess) => {
          if (sess.id !== aid) return sess;
          const msg: Message = {
            ...message,
            id: crypto.randomUUID(),
            timestamp: Date.now(),
          };
          const messages = [...sess.messages, msg];
          let title = sess.title;

          if (message.role === "assistant") {
            const assistantCount = messages.filter((m) => m.role === "assistant").length;
            const userCount = messages.filter((m) => m.role === "user").length;
            if (userCount >= 1 && assistantCount === 1) {
              title = titleFromFirstAssistantReply(message.content);
            }
          }

          return { ...sess, messages, title, updatedAt: Date.now() };
        });
        return { ...s, sessions };
      });
    },
    setStreaming: (isStreaming: boolean) => {
      update((s) => ({ ...s, isStreaming }));
    },
    setToolCall: (currentToolCall: ToolCall | null) => {
      update((s) => ({ ...s, currentToolCall }));
    },
    clearActiveSession: () => {
      update((s) => ({
        ...s,
        sessions: s.sessions.map((sess) =>
          sess.id === s.activeSessionId
            ? { ...sess, messages: [], title: "New chat", updatedAt: Date.now() }
            : sess
        ),
        isStreaming: false,
        currentToolCall: null,
        historyPickerOpen: false,
      }));
    },
    openHistoryPicker: () => {
      update((s) => ({ ...s, historyPickerOpen: true }));
    },
    closeHistoryPicker: () => {
      update((s) => ({ ...s, historyPickerOpen: false }));
    },
    /** Ensures there is an active tab (e.g. before first message when all tabs were closed). */
    /** Replace in-memory chat with a per-project snapshot (folder switch / load). */
    replaceProjectState(snapshot: {
      sessions: ChatSession[];
      history: ChatSession[];
      activeSessionId: string | null;
    }) {
      let sessions = snapshot.sessions;
      let activeSessionId = snapshot.activeSessionId;
      if (!sessions.length) {
        const s = makeSession();
        sessions = [s];
        activeSessionId = s.id;
      } else if (!activeSessionId || !sessions.some((x) => x.id === activeSessionId)) {
        activeSessionId = sessions[0].id;
      }
      set({
        sessions,
        history: snapshot.history ?? [],
        activeSessionId,
        isStreaming: false,
        currentToolCall: null,
        historyPickerOpen: false,
      });
    },
    /** Drop the user message and everything after it (for rewind / resend). */
    applyCompaction: (messages: Message[]) => {
      update((s) => {
        const aid = s.activeSessionId;
        if (!aid) return s;
        const now = new Date().toISOString();
        const sessions = s.sessions.map((sess) => {
          if (sess.id !== aid) return sess;
          return {
            ...sess,
            preCompactionMessages: sess.messages,
            messages,
            compactedAt: now,
            compactionCount: (sess.compactionCount ?? 0) + 1,
            updatedAt: Date.now(),
          };
        });
        return { ...s, sessions, isStreaming: false, currentToolCall: null };
      });
    },
    revertCompaction: () => {
      update((s) => {
        const aid = s.activeSessionId;
        if (!aid) return s;
        const sessions = s.sessions.map((sess) => {
          if (sess.id !== aid || !sess.preCompactionMessages) return sess;
          const count = Math.max(0, (sess.compactionCount ?? 1) - 1);
          return {
            ...sess,
            messages: sess.preCompactionMessages,
            preCompactionMessages: undefined,
            compactedAt: count > 0 ? sess.compactedAt : undefined,
            compactionCount: count || undefined,
            updatedAt: Date.now(),
          };
        });
        return { ...s, sessions };
      });
    },
    truncateBeforeUserMessage: (userMessageId: string) => {
      update((s) => {
        const aid = s.activeSessionId;
        if (!aid) return s;
        const sessions = s.sessions.map((sess) => {
          if (sess.id !== aid) return sess;
          const idx = sess.messages.findIndex((m) => m.id === userMessageId);
          if (idx < 0 || sess.messages[idx]?.role !== "user") return sess;
          const messages = sess.messages.slice(0, idx);
          return { ...sess, messages, updatedAt: Date.now() };
        });
        return { ...s, sessions, isStreaming: false, currentToolCall: null };
      });
    },
    ensureActiveSession: (): string => {
      let id = "";
      update((s) => {
        if (s.activeSessionId && s.sessions.some((x) => x.id === s.activeSessionId)) {
          id = s.activeSessionId;
          return s;
        }
        if (s.sessions.length > 0) {
          id = s.sessions[0].id;
          return { ...s, activeSessionId: id, isStreaming: false, currentToolCall: null };
        }
        const session = makeSession();
        id = session.id;
        return {
          ...s,
          sessions: [session],
          activeSessionId: session.id,
          isStreaming: false,
          currentToolCall: null,
        };
      });
      return id;
    },
  };
}

export const chat = createChatStore();

export const activeSession = derived(chat, ($c) => {
  if (!$c.activeSessionId) return null;
  return $c.sessions.find((s) => s.id === $c.activeSessionId) ?? null;
});
