import type { ChatBackend, ModelConfig, SettingsState } from "./stores/settings";

export type ToolCallFormat = "native" | "text_fallback";
export type PromptVerbosity = "standard" | "detailed";

export type ProviderModelDefaults = {
  contextWindow: number;
  toolCallFormat: ToolCallFormat;
  parallelToolCalls: boolean;
  promptVerbosity: PromptVerbosity;
};

export type ProviderModelDefaultsMap = Record<ChatBackend, ProviderModelDefaults>;

export const DEFAULT_PROVIDER_MODEL_DEFAULTS: ProviderModelDefaultsMap = {
  anthropic: {
    contextWindow: 200_000,
    toolCallFormat: "native",
    parallelToolCalls: true,
    promptVerbosity: "standard",
  },
  deepseek: {
    contextWindow: 64_000,
    toolCallFormat: "native",
    parallelToolCalls: true,
    promptVerbosity: "standard",
  },
  glm: {
    contextWindow: 128_000,
    toolCallFormat: "native",
    parallelToolCalls: true,
    promptVerbosity: "standard",
  },
  kimi: {
    contextWindow: 262_144,
    toolCallFormat: "native",
    parallelToolCalls: true,
    promptVerbosity: "standard",
  },
  ollama: {
    contextWindow: 32_768,
    toolCallFormat: "text_fallback",
    parallelToolCalls: true,
    promptVerbosity: "standard",
  },
  llamacpp: {
    contextWindow: 32_768,
    toolCallFormat: "text_fallback",
    parallelToolCalls: true,
    promptVerbosity: "standard",
  },
};

export type ResolvedModelSettings = {
  contextWindow: number;
  toolCallFormat: ToolCallFormat;
  parallelToolCalls: boolean;
  promptVerbosity: PromptVerbosity;
};

function pickToolCallFormat(raw: unknown, fallback: ToolCallFormat): ToolCallFormat {
  return raw === "native" || raw === "text_fallback" ? raw : fallback;
}

function pickPromptVerbosity(raw: unknown, fallback: PromptVerbosity): PromptVerbosity {
  return raw === "standard" || raw === "detailed" ? raw : fallback;
}

export function normalizeProviderModelDefaults(
  raw: Partial<ProviderModelDefaultsMap> | undefined
): ProviderModelDefaultsMap {
  const base = DEFAULT_PROVIDER_MODEL_DEFAULTS;
  const pick = (backend: ChatBackend): ProviderModelDefaults => {
    const row = raw?.[backend];
    const def = base[backend];
    return {
      contextWindow:
        typeof row?.contextWindow === "number" && row.contextWindow > 0
          ? Math.floor(row.contextWindow)
          : def.contextWindow,
      toolCallFormat: pickToolCallFormat(row?.toolCallFormat, def.toolCallFormat),
      parallelToolCalls: row?.parallelToolCalls !== false,
      promptVerbosity: pickPromptVerbosity(row?.promptVerbosity, def.promptVerbosity),
    };
  };
  return {
    anthropic: pick("anthropic"),
    deepseek: pick("deepseek"),
    glm: pick("glm"),
    kimi: pick("kimi"),
    ollama: pick("ollama"),
    llamacpp: pick("llamacpp"),
  };
}

export function normalizeModelConfig(
  raw: Partial<ModelConfig>,
  provider: ModelConfig["provider"],
  defaults: ProviderModelDefaults
): ModelConfig {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : id;
  return {
    id,
    name: name || id,
    provider,
    contextWindow:
      typeof raw.contextWindow === "number" && raw.contextWindow > 0
        ? Math.floor(raw.contextWindow)
        : defaults.contextWindow,
    contextLimitMax: raw.contextLimitMax,
    showInPicker: raw.showInPicker !== false,
    toolCallFormat: pickToolCallFormat(raw.toolCallFormat, defaults.toolCallFormat),
    parallelToolCalls: raw.parallelToolCalls ?? defaults.parallelToolCalls,
    promptVerbosity: pickPromptVerbosity(raw.promptVerbosity, defaults.promptVerbosity),
  };
}

export function applyProviderDefaultsToModel(
  model: ModelConfig,
  defaults: ProviderModelDefaults
): ModelConfig {
  return normalizeModelConfig(model, model.provider, defaults);
}

export function modelsForBackend(state: SettingsState, backend: ChatBackend): ModelConfig[] {
  switch (backend) {
    case "anthropic":
      return state.anthropicModels;
    case "deepseek":
      return state.deepseekModels;
    case "glm":
      return state.glmModels;
    case "kimi":
      return state.kimiModels;
    case "ollama":
      return state.ollamaModels;
    case "llamacpp":
      return state.llamacppModels;
  }
}

export function resolveActiveModelSettings(state: SettingsState): ResolvedModelSettings {
  const backend = state.chatBackend;
  const defaults = state.providerModelDefaults[backend];
  const list = modelsForBackend(state, backend);
  const row = list.find((m) => m.id === state.selectedModel);
  if (!row) return { ...defaults };
  return {
    contextWindow: row.contextWindow || defaults.contextWindow,
    toolCallFormat: row.toolCallFormat ?? defaults.toolCallFormat,
    parallelToolCalls: row.parallelToolCalls ?? defaults.parallelToolCalls,
    promptVerbosity: row.promptVerbosity ?? defaults.promptVerbosity,
  };
}

export function usesNativeToolCalls(settings: ResolvedModelSettings): boolean {
  return settings.toolCallFormat === "native";
}
