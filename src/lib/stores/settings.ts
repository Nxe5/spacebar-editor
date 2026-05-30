import { writable } from "svelte/store";
import {
  DEFAULT_AGENT_COMPACTION,
  normalizeAgentCompaction,
  type AgentCompactionSettings,
} from "../agentCompaction";
import {
  DEFAULT_AGENT_LIMITS,
  normalizeAgentLimits,
  type AgentLimits,
} from "../agentLimits";
import {
  DEFAULT_AUTOCOMPLETE,
  normalizeAutocompleteSettings,
  type AutocompleteSettings,
} from "../autocompleteSettings";
import { DEFAULT_MODEL_ROLES, normalizeModelRoles, type ModelRoleOverrides } from "../modelRoles";
import { mergeApiKeysFromEnv } from "../envApiKeys";
import { DEFAULT_LLAMACPP_ENDPOINT } from "../llamaCppClient";
import {
  DEFAULT_LLAMACPP_SERVER_TEMPLATE,
  DEFAULT_OLLAMA_SERVER_TEMPLATE,
  normalizeLlamacppServerTemplate,
  normalizeOllamaServerTemplate,
  type LlamacppServerTemplate,
  type OllamaServerTemplate,
} from "../providerServerConfig";
import { normalizeUniformTabWidthPx } from "../editor/tabWidth";
import { normalizeWorkbenchTheme, type WorkbenchThemeId } from "../workbench-theme";
import {
  ANTHROPIC_MODEL_FALLBACKS,
  DEEPSEEK_MODEL_FALLBACKS,
  seedAnthropicModels,
  seedDeepseekModels,
} from "../cloudModelCatalog";
import { modelsVisibleInPicker } from "../modelPicker";
import {
  DEFAULT_PROVIDER_MODEL_DEFAULTS,
  normalizeModelConfig,
  normalizeProviderModelDefaults,
  type ProviderModelDefaults,
  type ProviderModelDefaultsMap,
  type PromptVerbosity,
  type ToolCallFormat,
} from "../modelSettings";
import {
  DEFAULT_READ_FILE_CAP,
  normalizeReadFileCap,
  type ReadFileCapSettings,
} from "../readFileCap";

export type { AgentLimits };
export type { ReadFileCapSettings, ProviderModelDefaults, ProviderModelDefaultsMap };
export type { ToolCallFormat, PromptVerbosity };
export { DEFAULT_PROVIDER_MODEL_DEFAULTS } from "../modelSettings";
export { DEFAULT_READ_FILE_CAP, READ_FILE_CAP_BOUNDS } from "../readFileCap";
export type { AgentCompactionSettings };
export type { AutocompleteSettings };
export type { ModelRoleOverrides };
export { DEFAULT_AGENT_LIMITS, AGENT_LIMIT_BOUNDS } from "../agentLimits";
export {
  DEFAULT_AGENT_COMPACTION,
  AGENT_COMPACTION_BOUNDS,
  compactionThresholdPercent,
  compactionThresholdFromPercent,
} from "../agentCompaction";
export { DEFAULT_AUTOCOMPLETE, AUTOCOMPLETE_BOUNDS } from "../autocompleteSettings";
export { DEFAULT_MODEL_ROLES } from "../modelRoles";

export type ChatBackend = "anthropic" | "deepseek" | "ollama" | "llamacpp";

export type EditorSettings = {
  wordWrap: boolean;
  formatOnSave: boolean;
  /** When true, chat and workbench header tabs share a fixed width. */
  uniformTabWidth: boolean;
  /** Pixel width when `uniformTabWidth` is true. */
  uniformTabWidthPx: number;
};

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  wordWrap: false,
  formatOnSave: false,
  uniformTabWidth: false,
  uniformTabWidthPx: normalizeUniformTabWidthPx(undefined),
};

function normalizeEditorSettings(parsed: Partial<EditorSettings> | undefined): EditorSettings {
  return {
    wordWrap: parsed?.wordWrap === true,
    formatOnSave: parsed?.formatOnSave === true,
    uniformTabWidth: parsed?.uniformTabWidth === true,
    uniformTabWidthPx: normalizeUniformTabWidthPx(parsed?.uniformTabWidthPx),
  };
}

export interface ModelConfig {
  id: string;
  name: string;
  provider: "anthropic" | "deepseek" | "openai" | "ollama" | "llamacpp";
  contextWindow: number;
  contextLimitMax?: number;
  /** When false, hidden from the chat model picker (default: shown). */
  showInPicker?: boolean;
  toolCallFormat?: ToolCallFormat;
  parallelToolCalls?: boolean;
  promptVerbosity?: PromptVerbosity;
}

/** @deprecated Use `anthropicModels` / `deepseekModels` from settings; kept for tests and fallbacks. */
export const AVAILABLE_MODELS: ModelConfig[] = [
  ...ANTHROPIC_MODEL_FALLBACKS,
  ...DEEPSEEK_MODEL_FALLBACKS,
];

const SETTINGS_STORAGE_KEY = "tinyllama.settings.v4";
const LEGACY_SETTINGS_KEYS = ["tinyllama.settings.v3", "tinyllama.settings.v2", "tinyllama.settings.v1"];

export type SettingsState = {
  schemaVersion: 4;
  apiKeys: {
    anthropic: string;
    deepseek: string;
    openai: string;
  };
  chatBackend: ChatBackend;
  ollamaEndpoint: string;
  ollamaApiKey: string;
  llamacppEndpoint: string;
  llamacppApiKey: string;
  selectedModel: string;
  lastOllamaModelId: string;
  ollamaModels: ModelConfig[];
  llamacppModels: ModelConfig[];
  anthropicModels: ModelConfig[];
  deepseekModels: ModelConfig[];
  anthropicCatalogFetched: boolean;
  deepseekCatalogFetched: boolean;
  anthropicExtendedThinking: boolean;
  workbenchTheme: WorkbenchThemeId;
  anthropicContextBudget: number | null;
  webFetchAllowedHosts: string[];
  agentLimits: AgentLimits;
  agentCompaction: AgentCompactionSettings;
  autocomplete: AutocompleteSettings;
  modelRoles: ModelRoleOverrides;
  ollamaServerTemplate: OllamaServerTemplate;
  llamacppServerTemplate: LlamacppServerTemplate;
  editor: EditorSettings;
  /** Include workspace path block in chat mode system prompt (default off). */
  includeWorkspaceInChat: boolean;
  readFileCap: ReadFileCapSettings;
  providerModelDefaults: ProviderModelDefaultsMap;
};

function createSettingsStore() {
  const DEFAULT_WEB_FETCH_HOSTS = [
    "github.com",
    "raw.githubusercontent.com",
    "docs.rs",
    "developer.mozilla.org",
  ];

  const defaultState: SettingsState = {
    schemaVersion: 4,
    apiKeys: {
      anthropic: "",
      deepseek: "",
      openai: "",
    },
    chatBackend: "ollama",
    ollamaEndpoint: "http://127.0.0.1:11434",
    ollamaApiKey: "",
    llamacppEndpoint: DEFAULT_LLAMACPP_ENDPOINT,
    llamacppApiKey: "",
    selectedModel: "llama3.2:1b",
    lastOllamaModelId: "",
    ollamaModels: [],
    llamacppModels: [],
    anthropicModels: [],
    deepseekModels: [],
    anthropicCatalogFetched: false,
    deepseekCatalogFetched: false,
    anthropicExtendedThinking: true,
    workbenchTheme: "vscode-dark",
    anthropicContextBudget: null,
    webFetchAllowedHosts: DEFAULT_WEB_FETCH_HOSTS,
    agentLimits: { ...DEFAULT_AGENT_LIMITS },
    agentCompaction: { ...DEFAULT_AGENT_COMPACTION },
    autocomplete: { ...DEFAULT_AUTOCOMPLETE },
    modelRoles: { ...DEFAULT_MODEL_ROLES },
    ollamaServerTemplate: { ...DEFAULT_OLLAMA_SERVER_TEMPLATE },
    llamacppServerTemplate: { ...DEFAULT_LLAMACPP_SERVER_TEMPLATE },
    editor: { ...DEFAULT_EDITOR_SETTINGS },
    includeWorkspaceInChat: false,
    readFileCap: { ...DEFAULT_READ_FILE_CAP },
    providerModelDefaults: structuredClone(DEFAULT_PROVIDER_MODEL_DEFAULTS),
  };

  function normalizeModelList(
    list: ModelConfig[] | undefined,
    provider: ModelConfig["provider"],
    defaults: ProviderModelDefaults
  ): ModelConfig[] {
    return (list ?? []).map((m) =>
      normalizeModelConfig({ ...m, provider: m.provider ?? provider }, provider, defaults)
    );
  }

  function migrateV3ToV4(parsed: Partial<SettingsState>): SettingsState {
    return normalizeLoaded(parsed);
  }

  function normalizeLoadedInner(
    parsed: Partial<SettingsState>,
    providerDefaults: ProviderModelDefaultsMap
  ): SettingsState {
    const api = mergeApiKeysFromEnv({
      ...defaultState.apiKeys,
      ...(parsed.apiKeys ?? {}),
    });
    const modelRoles = normalizeModelRoles(parsed.modelRoles);
    return {
      ...defaultState,
      ...parsed,
      schemaVersion: 4,
      apiKeys: api,
      ollamaEndpoint: parsed.ollamaEndpoint ?? defaultState.ollamaEndpoint,
      ollamaApiKey: parsed.ollamaApiKey ?? defaultState.ollamaApiKey,
      llamacppEndpoint: parsed.llamacppEndpoint ?? defaultState.llamacppEndpoint,
      llamacppApiKey: parsed.llamacppApiKey ?? defaultState.llamacppApiKey,
      lastOllamaModelId: parsed.lastOllamaModelId ?? defaultState.lastOllamaModelId,
      selectedModel: parsed.selectedModel ?? defaultState.selectedModel,
      ollamaModels: normalizeModelList(parsed.ollamaModels, "ollama", providerDefaults.ollama),
      llamacppModels: normalizeModelList(
        parsed.llamacppModels,
        "llamacpp",
        providerDefaults.llamacpp
      ),
      anthropicModels: seedAnthropicModels(
        normalizeModelList(parsed.anthropicModels, "anthropic", providerDefaults.anthropic)
      ),
      deepseekModels: seedDeepseekModels(
        normalizeModelList(parsed.deepseekModels, "deepseek", providerDefaults.deepseek)
      ),
      anthropicCatalogFetched: parsed.anthropicCatalogFetched === true,
      deepseekCatalogFetched: parsed.deepseekCatalogFetched === true,
      workbenchTheme: normalizeWorkbenchTheme(parsed.workbenchTheme),
      anthropicContextBudget:
        parsed.anthropicContextBudget === null || parsed.anthropicContextBudget === undefined
          ? defaultState.anthropicContextBudget
          : typeof parsed.anthropicContextBudget === "number"
            ? parsed.anthropicContextBudget
            : defaultState.anthropicContextBudget,
      agentLimits: normalizeAgentLimits(parsed.agentLimits),
      modelRoles,
      agentCompaction: normalizeAgentCompaction(parsed.agentCompaction, modelRoles.compaction),
      autocomplete: normalizeAutocompleteSettings(parsed.autocomplete),
      ollamaServerTemplate: normalizeOllamaServerTemplate(parsed.ollamaServerTemplate),
      llamacppServerTemplate: normalizeLlamacppServerTemplate(parsed.llamacppServerTemplate),
      editor: normalizeEditorSettings(parsed.editor),
      includeWorkspaceInChat: parsed.includeWorkspaceInChat === true,
      readFileCap: normalizeReadFileCap(parsed.readFileCap),
      providerModelDefaults: providerDefaults,
    };
  }

  function normalizeLoaded(parsed: Partial<SettingsState>): SettingsState {
    const providerDefaults = normalizeProviderModelDefaults(parsed.providerModelDefaults);
    return normalizeLoadedInner(parsed, providerDefaults);
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
      for (const key of LEGACY_SETTINGS_KEYS) {
        const oldRaw = localStorage.getItem(key);
        if (oldRaw) {
          const migrated = migrateV3ToV4(JSON.parse(oldRaw) as Partial<SettingsState>);
          localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(migrated));
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
    setApiKey: (provider: "anthropic" | "deepseek" | "openai", key: string) => {
      update((state) => {
        const prevKey = state.apiKeys[provider];
        const nextKeys = { ...state.apiKeys, [provider]: key };
        if (prevKey === key) {
          return { ...state, apiKeys: nextKeys };
        }
        if (provider === "anthropic") {
          return {
            ...state,
            apiKeys: nextKeys,
            anthropicModels: [],
            anthropicCatalogFetched: false,
          };
        }
        if (provider === "deepseek") {
          return {
            ...state,
            apiKeys: nextKeys,
            deepseekModels: [],
            deepseekCatalogFetched: false,
          };
        }
        return { ...state, apiKeys: nextKeys };
      });
    },
    setOllamaEndpoint: (endpoint: string) => {
      update((state) => ({
        ...state,
        ollamaEndpoint: endpoint,
      }));
    },
    setOllamaApiKey: (key: string) => {
      update((state) => ({
        ...state,
        ollamaApiKey: key,
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
        const cloud = state.anthropicModels.find((m) => m.id === modelId && m.provider === "anthropic");
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
          const cloud = modelsVisibleInPicker(state.anthropicModels);
          const selected = cloud.some((m) => m.id === state.selectedModel)
            ? state.selectedModel
            : (cloud[0]?.id ?? state.selectedModel);
          const m = state.anthropicModels.find((x) => x.id === selected);
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
        if (chatBackend === "deepseek") {
          const cloud = modelsVisibleInPicker(state.deepseekModels);
          const selected = cloud.some((m) => m.id === state.selectedModel)
            ? state.selectedModel
            : (cloud[0]?.id ?? state.selectedModel);
          return { ...state, chatBackend, selectedModel: selected };
        }
        if (chatBackend === "ollama") {
          const ids = new Set(modelsVisibleInPicker(state.ollamaModels).map((m) => m.id));
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
        const visible = modelsVisibleInPicker(models);
        const ids = new Set(visible.map((m) => m.id));
        let selectedModel = state.selectedModel;
        if (state.chatBackend === "ollama") {
          if (ids.has(selectedModel)) {
            /* keep */
          } else if (state.lastOllamaModelId && ids.has(state.lastOllamaModelId)) {
            selectedModel = state.lastOllamaModelId;
          } else if (visible[0]) {
            selectedModel = visible[0].id;
          }
        }
        return { ...state, ollamaModels: models, selectedModel };
      });
    },
    setLlamacppModels: (models: ModelConfig[]) => {
      update((state) => {
        let selectedModel = state.selectedModel;
        if (state.chatBackend === "llamacpp" && models.length > 0) {
          if (!models.some((m) => m.id === selectedModel)) {
            selectedModel = models[0]!.id;
          }
        }
        return { ...state, llamacppModels: models, selectedModel };
      });
    },
    setAnthropicModels: (models: ModelConfig[]) => {
      update((state) => {
        const visible = modelsVisibleInPicker(models);
        let selectedModel = state.selectedModel;
        if (state.chatBackend === "anthropic") {
          if (!visible.some((m) => m.id === selectedModel)) {
            selectedModel = visible[0]?.id ?? selectedModel;
          }
        }
        return {
          ...state,
          anthropicModels: models,
          anthropicCatalogFetched: models.length > 0,
          selectedModel,
        };
      });
    },
    setDeepseekModels: (models: ModelConfig[]) => {
      update((state) => {
        const visible = modelsVisibleInPicker(models);
        let selectedModel = state.selectedModel;
        if (state.chatBackend === "deepseek") {
          if (!visible.some((m) => m.id === selectedModel)) {
            selectedModel = visible[0]?.id ?? selectedModel;
          }
        }
        return {
          ...state,
          deepseekModels: models,
          deepseekCatalogFetched: models.length > 0,
          selectedModel,
        };
      });
    },
    setModelShowInPicker: (
      provider: "anthropic" | "deepseek" | "ollama",
      modelId: string,
      showInPicker: boolean
    ) => {
      update((state) => {
        const patch = (list: ModelConfig[]) =>
          list.map((m) => (m.id === modelId ? { ...m, showInPicker } : m));
        if (provider === "anthropic") {
          return { ...state, anthropicModels: patch(state.anthropicModels) };
        }
        if (provider === "deepseek") {
          return { ...state, deepseekModels: patch(state.deepseekModels) };
        }
        return { ...state, ollamaModels: patch(state.ollamaModels) };
      });
    },
    setAnthropicExtendedThinking: (anthropicExtendedThinking: boolean) => {
      update((state) => ({ ...state, anthropicExtendedThinking }));
    },
    setWorkbenchTheme: (workbenchTheme: string) => {
      update((state) => ({ ...state, workbenchTheme: normalizeWorkbenchTheme(workbenchTheme) }));
    },
    setAnthropicContextBudget: (anthropicContextBudget: number | null) => {
      update((state) => {
        const cloud = state.anthropicModels.find(
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
        agentLimits: normalizeAgentLimits({ ...state.agentLimits, ...agentLimits }),
      }));
    },
    setAgentCompaction: (agentCompaction: Partial<AgentCompactionSettings>) => {
      update((state) => ({
        ...state,
        agentCompaction: normalizeAgentCompaction(
          { ...state.agentCompaction, ...agentCompaction },
          state.modelRoles.compaction
        ),
      }));
    },
    setAutocompleteSettings: (autocomplete: Partial<AutocompleteSettings>) => {
      update((state) => ({
        ...state,
        autocomplete: normalizeAutocompleteSettings({ ...state.autocomplete, ...autocomplete }),
      }));
    },
    setModelRoles: (modelRoles: Partial<ModelRoleOverrides>) => {
      update((state) => ({
        ...state,
        modelRoles: normalizeModelRoles({ ...state.modelRoles, ...modelRoles }),
      }));
    },
    setOllamaServerTemplate: (template: Partial<OllamaServerTemplate>) => {
      update((state) => ({
        ...state,
        ollamaServerTemplate: normalizeOllamaServerTemplate({
          ...state.ollamaServerTemplate,
          ...template,
        }),
      }));
    },
    setLlamacppServerTemplate: (template: Partial<LlamacppServerTemplate>) => {
      update((state) => ({
        ...state,
        llamacppServerTemplate: normalizeLlamacppServerTemplate({
          ...state.llamacppServerTemplate,
          ...template,
        }),
      }));
    },
    setEditorSettings: (editor: Partial<EditorSettings>) => {
      update((state) => ({
        ...state,
        editor: normalizeEditorSettings({ ...state.editor, ...editor }),
      }));
    },
    setIncludeWorkspaceInChat: (includeWorkspaceInChat: boolean) => {
      update((state) => ({ ...state, includeWorkspaceInChat }));
    },
    setReadFileCap: (readFileCap: Partial<ReadFileCapSettings>) => {
      update((state) => ({
        ...state,
        readFileCap: normalizeReadFileCap({ ...state.readFileCap, ...readFileCap }),
      }));
    },
    setProviderModelDefaults: (
      backend: ChatBackend,
      patch: Partial<ProviderModelDefaults>
    ) => {
      update((state) => {
        const current = state.providerModelDefaults[backend];
        const next = normalizeProviderModelDefaults({
          ...state.providerModelDefaults,
          [backend]: { ...current, ...patch },
        });
        return { ...state, providerModelDefaults: next };
      });
    },
    patchModelConfig: (
      backend: ChatBackend,
      modelId: string,
      patch: Partial<ModelConfig>
    ) => {
      update((state) => {
        const defaults = state.providerModelDefaults[backend];
        const apply = (list: ModelConfig[]) =>
          list.map((m) =>
            m.id === modelId ? normalizeModelConfig({ ...m, ...patch }, m.provider, defaults) : m
          );
        if (backend === "anthropic") {
          return { ...state, anthropicModels: apply(state.anthropicModels) };
        }
        if (backend === "deepseek") {
          return { ...state, deepseekModels: apply(state.deepseekModels) };
        }
        if (backend === "ollama") {
          return { ...state, ollamaModels: apply(state.ollamaModels) };
        }
        return { ...state, llamacppModels: apply(state.llamacppModels) };
      });
    },
  };
}

export const settings = createSettingsStore();
