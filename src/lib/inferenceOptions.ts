import type { ChatBackend } from "./stores/settings";
import type { ModelConfig } from "./stores/settings";
import type { InferenceOptions } from "./providers/openaiCompat";

type InferenceSettingsSlice = {
  chatBackend: ChatBackend;
  selectedModel: string;
  ollamaModels: ModelConfig[];
  llamacppModels: ModelConfig[];
  ollamaServerTemplate: { numThreads: number };
};

export function inferenceOptionsForModel(
  st: InferenceSettingsSlice,
  backend: ChatBackend,
  modelId: string
): InferenceOptions | undefined {
  if (backend === "ollama") {
    const row = st.ollamaModels.find((m) => m.id === modelId);
    return {
      ...(row?.contextWindow ? { num_ctx: row.contextWindow } : {}),
      num_thread: st.ollamaServerTemplate.numThreads,
      think: true,
    };
  }
  if (backend === "llamacpp") {
    const row = st.llamacppModels.find((m) => m.id === modelId);
    if (!row?.contextWindow) return undefined;
    return { num_ctx: row.contextWindow, think: true };
  }
  return undefined;
}

export function inferenceOptionsForSettings(st: InferenceSettingsSlice): InferenceOptions | undefined {
  return inferenceOptionsForModel(st, st.chatBackend, st.selectedModel);
}
