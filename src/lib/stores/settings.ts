import { writable } from "svelte/store";
import { DEFAULT_LLAMACPP_ENDPOINT } from "../llamaCppClient";
import { normalizeWorkbenchTheme, type WorkbenchThemeId } from "../workbench-theme";

export type ChatBackend = "anthropic" | "ollama" | "llamacpp";

export interface ModelConfig {
  id: string;
  name: string;
  provider: "anthropic" | "openai" | "ollama" | "llamacpp";
  contextWindow: number;
  /** Ollama: max context from `api/show` (model on disk). */
  contextLimitMax?: number;
}

/** Chat agent implementations (sidecar `harnessFactory`). */
export const HARNESS_OPTIONS = [
  {
    id: "pi-latest",
    label: "Pi (bundled SDK — default)",
    hint: "Uses the Pi npm package shipped with the sidecar for versioning; chat still flows through this app’s model router.",
  },
  {
    id: "pi-minimal",
    label: "Pi-style (read-only tools)",
    hint: "Same routing as Pi default, but only read_file and list_dir are exposed to the model.",
  },
] as const;

export type HarnessKindId = (typeof HARNESS_OPTIONS)[number]["id"];

export const AVAILABLE_MODELS: ModelConfig[] = [
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "anthropic", contextWindow: 200000 },
  { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", provider: "anthropic", contextWindow: 200000 },
  { id: "claude-3-opus-20240229", name: "Claude 3 Opus", provider: "anthropic", contextWindow: 200000 },
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", contextWindow: 128000 },
  { id: "gpt-4-turbo", name: "GPT-4 Turbo", provider: "openai", contextWindow: 128000 },
];

const SETTINGS_STORAGE_KEY = "tinyllama.settings.v1";

function createSettingsStore() {
  type SettingsState = {
    apiKeys: {
      anthropic: string;
      openai: string;
    };
    /** Which stack answers chat (Anthropic API vs local Ollama). OpenAI key is reserved for a future provider. */
    chatBackend: ChatBackend;
    /** Sidecar harness preset (see HARNESS_OPTIONS). */
    harnessKind: HarnessKindId;
    /** Filled when the sidecar reports @mariozechner/pi-coding-agent VERSION after start. */
    lastBundledPiSdkVersion: string;
    ollamaEndpoint: string;
    llamacppEndpoint: string;
    llamacppApiKey: string;
    selectedModel: string;
    /** Last Ollama tag the user chose (only updated when that tag is in `ollamaModels`). */
    lastOllamaModelId: string;
    ollamaModels: ModelConfig[];
    llamacppModels: ModelConfig[];
    /**
     * When true, Claude 4+ requests use adaptive extended thinking; thinking streams in a side panel in chat.
     * Disabled automatically for model IDs that do not support it (handled in the sidecar).
     */
    anthropicExtendedThinking: boolean;
    /** Workbench / editor / explorer / terminal palette (see `workbench-themes.css`). */
    workbenchTheme: WorkbenchThemeId;
    /**
     * Optional cap for the chat context meter (Anthropic). `null` = use the full context window of the selected model.
     */
    anthropicContextBudget: number | null;
  };

  const defaultState: SettingsState = {
    apiKeys: {
      anthropic: "",
      openai: "",
    },
    chatBackend: "anthropic",
    harnessKind: "pi-latest",
    lastBundledPiSdkVersion: "",
    ollamaEndpoint: "http://127.0.0.1:11434",
    llamacppEndpoint: DEFAULT_LLAMACPP_ENDPOINT,
    llamacppApiKey: "",
    selectedModel: "claude-sonnet-4-20250514",
    lastOllamaModelId: "",
    ollamaModels: [],
    llamacppModels: [],
    anthropicExtendedThinking: true,
    workbenchTheme: "vscode-dark",
    anthropicContextBudget: null,
  };

  function loadSettings(): SettingsState {
    if (typeof localStorage === "undefined") {
      return { ...defaultState };
    }
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return { ...defaultState };
      const parsed = JSON.parse(raw) as Partial<SettingsState>;
      return {
        ...defaultState,
        ...parsed,
        apiKeys: { ...defaultState.apiKeys, ...(parsed.apiKeys ?? {}) },
        lastOllamaModelId: parsed.lastOllamaModelId ?? defaultState.lastOllamaModelId,
        ollamaModels: parsed.ollamaModels ?? defaultState.ollamaModels,
        llamacppModels: parsed.llamacppModels ?? defaultState.llamacppModels,
        workbenchTheme: normalizeWorkbenchTheme(parsed.workbenchTheme),
        anthropicContextBudget:
          parsed.anthropicContextBudget === null || parsed.anthropicContextBudget === undefined
            ? defaultState.anthropicContextBudget
            : typeof parsed.anthropicContextBudget === "number"
              ? parsed.anthropicContextBudget
              : defaultState.anthropicContextBudget,
      };
    } catch {
      return { ...defaultState };
    }
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
      update((state) => ({ ...state, ollamaEndpoint: endpoint }));
    },
    setLlamacppEndpoint: (endpoint: string) => {
      update((state) => ({ ...state, llamacppEndpoint: endpoint }));
    },
    setLlamacppApiKey: (key: string) => {
      update((state) => ({ ...state, llamacppApiKey: key }));
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
    setHarnessKind: (harnessKind: HarnessKindId) => {
      update((state) => ({ ...state, harnessKind }));
    },
    setLastBundledPiSdkVersion: (v: string) => {
      update((state) => ({ ...state, lastBundledPiSdkVersion: v }));
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
  };
}

export const settings = createSettingsStore();
