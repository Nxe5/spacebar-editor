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
  apiKeys: { anthropic: string; deepseek: string };
};

const BACKENDS: StreamChatBackend[] = ["ollama", "llamacpp", "anthropic", "deepseek"];

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

function activeChatTarget(settings: CompactionSettingsSlice): CompactionTarget {
  const { chatBackend, selectedModel } = settings;
  const providerLabel =
    chatBackend === "ollama"
      ? "Ollama"
      : chatBackend === "llamacpp"
        ? "llama.cpp"
        : chatBackend === "anthropic"
          ? "Anthropic"
          : "DeepSeek";
  const models =
    chatBackend === "ollama"
      ? settings.ollamaModels
      : chatBackend === "llamacpp"
        ? settings.llamacppModels
        : chatBackend === "anthropic"
          ? settings.anthropicModels
          : settings.deepseekModels;
  return {
    backend: chatBackend,
    modelId: selectedModel,
    label: `${modelLabel(models, selectedModel, selectedModel)} (${providerLabel})`,
    usesActiveChatModel: true,
  };
}

export function buildCompactionModelOptions(settings: {
  ollamaModels: ModelConfig[];
  llamacppModels: ModelConfig[];
  anthropicModels: ModelConfig[];
  deepseekModels: ModelConfig[];
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
  const models =
    backend === "ollama"
      ? settings.ollamaModels
      : backend === "llamacpp"
        ? settings.llamacppModels
        : backend === "anthropic"
          ? settings.anthropicModels
          : settings.deepseekModels;

  if (!models.some((m) => m.id === modelId)) {
    throw new Error(`Compaction model "${modelId}" is not available — pick another in Settings.`);
  }

  const providerLabel =
    backend === "ollama"
      ? "Ollama"
      : backend === "llamacpp"
        ? "llama.cpp"
        : backend === "anthropic"
          ? "Anthropic"
          : "DeepSeek";

  return {
    backend,
    modelId,
    label: `${modelLabel(models, modelId, modelId)} (${providerLabel})`,
    usesActiveChatModel: false,
  };
}

export function assertCompactionCredentials(settings: CompactionSettingsSlice, backend: StreamChatBackend): void {
  if (backend === "anthropic" && !settings.apiKeys.anthropic.trim()) {
    throw new Error("Anthropic API key required for the selected compaction model.");
  }
  if (backend === "deepseek" && !settings.apiKeys.deepseek.trim()) {
    throw new Error("DeepSeek API key required for the selected compaction model.");
  }
}
