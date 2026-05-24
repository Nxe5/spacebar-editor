import { writable } from "svelte/store";
import {
  clampAgentLimits,
  DEFAULT_AGENT_LIMITS,
  type AgentLimits,
} from "../agentLimits";
import { DEFAULT_LLAMACPP_ENDPOINT } from "../llamaCppClient";
import { normalizeWorkbenchTheme, type WorkbenchThemeId } from "../workbench-theme";

export type { AgentLimits };
export { DEFAULT_AGENT_LIMITS, AGENT_LIMIT_BOUNDS } from "../agentLimits";

export type ChatBackend = "anthropic" | "ollama" | "llamacpp";

export interface ModelConfig {
  id: string;
  name: string;
  provider: "anthropic" | "openai" | "ollama" | "llamacpp";
  contextWindow: number;
  contextLimitMax?: number;
}

export const AVAILABLE_MODELS: ModelConfig[] = [
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "anthropic", contextWindow: 200000 },
  { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", provider: "anthropic", contextWindow: 200000 },
  { id: "claude-3-opus-20240229", name: "Claude 3 Opus", provider: "anthropic", contextWindow: 200000 },
  { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", provider: "anthropic", contextWindow: 200000 },
];

const SETTINGS_STORAGE_KEY = "tinyllama.settings.v3";

function createSettingsStore() {
  type SettingsState = {
    schemaVersion: 3;
    apiKeys: {
      anthropic: string;
      openai: string;
    };
    chatBackend: ChatBackend;
    ollamaEndpoint: string;
    llamacppEndpoint: string;
    llamacppApiKey: string;
    selectedModel: string;
    lastOllamaModelId: string;
    ollamaModels: ModelConfig[];
    llamacppModels: ModelConfig[];
    anthropicExtendedThinking: boolean;
    workbenchTheme: WorkbenchThemeId;
    anthropicContextBudget: number | null;
    webFetchAllowedHosts: string[];
    agentLimits: AgentLimits;
  };

  const DEFAULT_WEB_FETCH_HOSTS = [
    "github.com",
    "raw.githubusercontent.com",
    "docs.rs",
    "developer.mozilla.org",
  ];

  const defaultState: SettingsState = {
    schemaVersion: 3,
    apiKeys: {
      anthropic: "",
      openai: "",
    },
    chatBackend: "ollama",
    ollamaEndpoint: "http://127.0.0.1:11434",
    llamacppEndpoint: DEFAULT_LLAMACPP_ENDPOINT,
    llamacppApiKey: "",
    selectedModel: "llama3.2:1b",
    lastOllamaModelId: "",
    ollamaModels: [],
    llamacppModels: [],
    anthropicExtendedThinking: true,
    workbenchTheme: "cursor-dark",
    anthropicContextBudget: null,
    webFetchAllowedHosts: DEFAULT_WEB_FETCH_HOSTS,
    agentLimits: { ...DEFAULT_AGENT_LIMITS },
  };

  function normalizeLoaded(parsed: Partial<SettingsState>): SettingsState {
    const api = { ...defaultState.apiKeys, ...(parsed.apiKeys ?? {}) };
    return {
      ...defaultState,
      ...parsed,
      schemaVersion: 3,
      apiKeys: api,
      ollamaEndpoint: parsed.ollamaEndpoint ?? defaultState.ollamaEndpoint,
      llamacppEndpoint: parsed.llamacppEndpoint ?? defaultState.llamacppEndpoint,
      llamacppApiKey: parsed.llamacppApiKey ?? defaultState.llamacppApiKey,
      lastOllamaModelId: parsed.lastOllamaModelId ?? defaultState.lastOllamaModelId,
      selectedModel: parsed.selectedModel ?? defaultState.selectedModel,
      ollamaModels: parsed.ollamaModels ?? defaultState.ollamaModels,
      llamacppModels: parsed.llamacppModels ?? defaultState.llamacppModels,
      workbenchTheme: normalizeWorkbenchTheme(parsed.workbenchTheme),
      anthropicContextBudget:
        parsed.anthropicContextBudget === null || parsed.anthropicContextBudget === undefined
          ? defaultState.anthropicContextBudget
          : typeof parsed.anthropicContextBudget === "number"
            ? parsed.anthropicContextBudget
            : defaultState.anthropicContextBudget,
      agentLimits: clampAgentLimits(parsed.agentLimits),
    };
  }

  function loadSettings(): SettingsState {
    if (typeof localStorage === "undefined") {
      return { ...defaultState };
    }
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) {
        return normalizeLoaded(JSON.parse(raw) as Partial<SettingsState>);
      }
      const oldKeys = ["tinyllama.settings.v2", "tinyllama.settings.v1"];
      for (const key of oldKeys) {
        const oldRaw = localStorage.getItem(key);
        if (oldRaw) {
          const migrated = normalizeLoaded(JSON.parse(oldRaw) as Partial<SettingsState>);
          localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(migrated));
          localStorage.removeItem(key);
          return migrated;
        }
      }
    } catch {
      return { ...defaultState };
    }
    return { ...defaultState };
  }

  const { subscribe, set, update } = writable<SettingsState>(loadSettings());

  subscribe((state) => {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* quota */
    }
  });

  return {
    subscribe,
    setApiKey: (provider: "anthropic" | "openai", key: string) => {
      update((state) => ({
        ...state,
        apiKeys: { ...state.apiKeys, [provider]: key },
      }));
    },
    setOllamaEndpoint: (endpoint: string) => {
      update((state) => ({
        ...state,
        ollamaEndpoint: endpoint,
      }));
    },
    setLlamacppEndpoint: (endpoint: string) => {
      update((state) => ({
        ...state,
        llamacppEndpoint: endpoint,
      }));
    },
    setLlamacppApiKey: (key: string) => {
      update((state) => ({
        ...state,
        llamacppApiKey: key,
      }));
    },
    setSelectedModel: (modelId: string) => {
      update((state) => {
        const ollamaIds = new Set(state.ollamaModels.map((m) => m.id));
        const cloud = AVAILABLE_MODELS.find((m) => m.id === modelId && m.provider === "anthropic");
        let anthropicContextBudget = state.anthropicContextBudget;
        if (
          cloud &&
          anthropicContextBudget != null &&
          anthropicContextBudget > cloud.contextWindow
        ) {
          anthropicContextBudget = cloud.contextWindow;
        }
        return {
          ...state,
          selectedModel: modelId,
          ...(ollamaIds.has(modelId) ? { lastOllamaModelId: modelId } : {}),
          anthropicContextBudget,
        };
      });
    },
    setChatBackend: (chatBackend: ChatBackend) => {
      update((state) => {
        if (chatBackend === "anthropic") {
          const cloud = AVAILABLE_MODELS.filter((m) => m.provider === "anthropic");
          const selected = cloud.some((m) => m.id === state.selectedModel)
            ? state.selectedModel
            : (cloud[0]?.id ?? state.selectedModel);
          const m = cloud.find((x) => x.id === selected);
          let anthropicContextBudget = state.anthropicContextBudget;
          if (
            m &&
            anthropicContextBudget != null &&
            anthropicContextBudget > m.contextWindow
          ) {
            anthropicContextBudget = m.contextWindow;
          }
          return { ...state, chatBackend, selectedModel: selected, anthropicContextBudget };
        }
        if (chatBackend === "ollama") {
          const ids = new Set(state.ollamaModels.map((m) => m.id));
          let selected = state.selectedModel;
          if (ids.has(selected)) {
            /* keep */
          } else if (state.lastOllamaModelId && ids.has(state.lastOllamaModelId)) {
            selected = state.lastOllamaModelId;
          } else {
            selected = state.ollamaModels[0]?.id ?? state.selectedModel;
          }
          return { ...state, chatBackend, selectedModel: selected };
        }
        const lp = state.llamacppModels;
        const selected = lp.some((m) => m.id === state.selectedModel)
          ? state.selectedModel
          : (lp[0]?.id ?? (state.selectedModel.trim() || "local-model"));
        return { ...state, chatBackend, selectedModel: selected };
      });
    },
    setOllamaModels: (models: ModelConfig[]) => {
      update((state) => {
        const ids = new Set(models.map((m) => m.id));
        let selectedModel = state.selectedModel;
        if (state.chatBackend === "ollama") {
          if (ids.has(selectedModel)) {
            /* keep */
          } else if (state.lastOllamaModelId && ids.has(state.lastOllamaModelId)) {
            selectedModel = state.lastOllamaModelId;
          } else if (models[0]) {
            selectedModel = models[0].id;
          }
        }
        return { ...state, ollamaModels: models, selectedModel };
      });
    },
    setLlamacppModels: (models: ModelConfig[]) => {
      update((state) => ({ ...state, llamacppModels: models }));
    },
    setAnthropicExtendedThinking: (anthropicExtendedThinking: boolean) => {
      update((state) => ({ ...state, anthropicExtendedThinking }));
    },
    setWorkbenchTheme: (workbenchTheme: string) => {
      update((state) => ({ ...state, workbenchTheme: normalizeWorkbenchTheme(workbenchTheme) }));
    },
    setAnthropicContextBudget: (anthropicContextBudget: number | null) => {
      update((state) => {
        const cloud = AVAILABLE_MODELS.find(
          (m) => m.id === state.selectedModel && m.provider === "anthropic"
        );
        const cap = cloud?.contextWindow ?? 200_000;
        if (anthropicContextBudget == null) {
          return { ...state, anthropicContextBudget: null };
        }
        const clamped = Math.max(2048, Math.min(Math.floor(anthropicContextBudget), cap));
        return { ...state, anthropicContextBudget: clamped };
      });
    },
    setWebFetchAllowedHosts: (webFetchAllowedHosts: string[]) => {
      update((state) => ({
        ...state,
        webFetchAllowedHosts: webFetchAllowedHosts
          .map((h) => h.trim().toLowerCase())
          .filter(Boolean),
      }));
    },
    setAgentLimits: (agentLimits: Partial<AgentLimits>) => {
      update((state) => ({
        ...state,
        agentLimits: clampAgentLimits({ ...state.agentLimits, ...agentLimits }),
      }));
    },
  };
}

export const settings = createSettingsStore();
