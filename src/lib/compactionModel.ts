import type { StreamChatBackend } from "./agent/streamTurn";
import { modelsVisibleInPicker } from "./modelPicker";
import type { ChatBackend, ModelConfig } from "./stores/settings";

const REF_SEP = ":";

export type CompactionModelOption = {
  value: string;
  label: string;
};

export type CompactionTarget = {
  backend: StreamChatBackend;
  modelId: string;
  /** Human label for notices / debugging. */
  label: string;
  usesActiveChatModel: boolean;
};

export type CompactionSettingsSlice = {
  chatBackend: ChatBackend;
  selectedModel: string;
  agentCompaction: { useActiveChatModel: boolean };
  modelRoles: { compaction: string | null };
  ollamaModels: ModelConfig[];
  llamacppModels: ModelConfig[];
  anthropicModels: ModelConfig[];
  deepseekModels: ModelConfig[];
  glmModels: ModelConfig[];
  kimiModels: ModelConfig[];
  apiKeys: { anthropic: string; deepseek: string; glm: string; kimi: string };
  cloudApiKeyStored?: { anthropic: boolean; deepseek: boolean; glm: boolean; kimi: boolean };
};

const BACKENDS: StreamChatBackend[] = [
  "ollama",
  "llamacpp",
  "anthropic",
  "deepseek",
  "glm",
  "kimi",
];

const PROVIDER_LABELS: Record<StreamChatBackend, string> = {
  ollama: "Ollama",
  llamacpp: "llama.cpp",
  anthropic: "Anthropic",
  deepseek: "DeepSeek",
  glm: "GLM",
  kimi: "Kimi",
};

export function encodeCompactionModelRef(backend: ChatBackend, modelId: string): string {
  return `${backend}${REF_SEP}${modelId}`;
}

export function parseCompactionModelRef(ref: string): { backend: StreamChatBackend; modelId: string } | null {
  const idx = ref.indexOf(REF_SEP);
  if (idx <= 0) return null;
  const backend = ref.slice(0, idx) as StreamChatBackend;
  const modelId = ref.slice(idx + 1).trim();
  if (!modelId || !BACKENDS.includes(backend)) return null;
  return { backend, modelId };
}

function modelLabel(models: ModelConfig[], modelId: string, fallback: string): string {
  return models.find((m) => m.id === modelId)?.name ?? modelId ?? fallback;
}

function modelsForBackend(settings: CompactionSettingsSlice, backend: StreamChatBackend): ModelConfig[] {
  switch (backend) {
    case "ollama":
      return settings.ollamaModels;
    case "llamacpp":
      return settings.llamacppModels;
    case "anthropic":
      return settings.anthropicModels;
    case "deepseek":
      return settings.deepseekModels;
    case "glm":
      return settings.glmModels;
    case "kimi":
      return settings.kimiModels;
  }
}

function activeChatTarget(settings: CompactionSettingsSlice): CompactionTarget {
  const { chatBackend, selectedModel } = settings;
  const models = modelsForBackend(settings, chatBackend);
  return {
    backend: chatBackend,
    modelId: selectedModel,
    label: `${modelLabel(models, selectedModel, selectedModel)} (${PROVIDER_LABELS[chatBackend]})`,
    usesActiveChatModel: true,
  };
}

export function buildCompactionModelOptions(settings: {
  ollamaModels: ModelConfig[];
  llamacppModels: ModelConfig[];
  anthropicModels: ModelConfig[];
  deepseekModels: ModelConfig[];
  glmModels: ModelConfig[];
  kimiModels: ModelConfig[];
}): CompactionModelOption[] {
  const out: CompactionModelOption[] = [];
  for (const m of modelsVisibleInPicker(settings.ollamaModels)) {
    out.push({
      value: encodeCompactionModelRef("ollama", m.id),
      label: `${m.name} (Ollama)`,
    });
  }
  for (const m of settings.llamacppModels) {
    out.push({
      value: encodeCompactionModelRef("llamacpp", m.id),
      label: `${m.name} (llama.cpp)`,
    });
  }
  for (const m of modelsVisibleInPicker(settings.anthropicModels)) {
    out.push({
      value: encodeCompactionModelRef("anthropic", m.id),
      label: `${m.name} (Anthropic)`,
    });
  }
  for (const m of modelsVisibleInPicker(settings.deepseekModels)) {
    out.push({
      value: encodeCompactionModelRef("deepseek", m.id),
      label: `${m.name} (DeepSeek)`,
    });
  }
  for (const m of modelsVisibleInPicker(settings.glmModels)) {
    out.push({
      value: encodeCompactionModelRef("glm", m.id),
      label: `${m.name} (GLM)`,
    });
  }
  for (const m of modelsVisibleInPicker(settings.kimiModels)) {
    out.push({
      value: encodeCompactionModelRef("kimi", m.id),
      label: `${m.name} (Kimi)`,
    });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

export function resolveCompactionTarget(settings: CompactionSettingsSlice): CompactionTarget {
  const useActive = settings.agentCompaction.useActiveChatModel;
  const ref = settings.modelRoles.compaction;

  if (useActive) return activeChatTarget(settings);

  if (!ref) {
    throw new Error(
      "Pick a compaction model in Settings → Compaction, or turn on Use active chat model."
    );
  }

  const parsed = parseCompactionModelRef(ref);
  if (!parsed) {
    throw new Error("Invalid compaction model setting — reset it in Settings → Compaction.");
  }

  const { backend, modelId } = parsed;
  const models = modelsForBackend(settings, backend);

  if (!models.some((m) => m.id === modelId)) {
    throw new Error(`Compaction model "${modelId}" is not available — pick another in Settings.`);
  }

  return {
    backend,
    modelId,
    label: `${modelLabel(models, modelId, modelId)} (${PROVIDER_LABELS[backend]})`,
    usesActiveChatModel: false,
  };
}

export function assertCompactionCredentials(settings: CompactionSettingsSlice, backend: StreamChatBackend): void {
  const keyOk = (slot: keyof CompactionSettingsSlice["apiKeys"]) =>
    settings.apiKeys[slot].trim().length > 0;

  if (backend === "anthropic" && !keyOk("anthropic")) {
    throw new Error("Anthropic API key required for the selected compaction model.");
  }
  if (backend === "deepseek" && !keyOk("deepseek")) {
    throw new Error("DeepSeek API key required for the selected compaction model.");
  }
  if (backend === "glm" && !keyOk("glm")) {
    throw new Error("GLM API key required for the selected compaction model.");
  }
  if (backend === "kimi" && !keyOk("kimi")) {
    throw new Error("Kimi API key required for the selected compaction model.");
  }
}
