import { writable } from "svelte/store";
import type { ChatBackend } from "./settings";
import { probeOllama, probeLlamacpp } from "../providerHealth";
import { ollamaAuthHeaders } from "../ollamaClient";

export type StatusDot = "green" | "red" | "yellow" | "idle";

export interface BackendStatusLine {
  backend: ChatBackend;
  dot: StatusDot;
  label: string;
  detail: string;
}

function createBackendStatusStore() {
  const initial: BackendStatusLine = {
    backend: "anthropic",
    dot: "idle",
    label: "—",
    detail: "",
  };
  const { subscribe, set } = writable<BackendStatusLine>(initial);

  return {
    subscribe,
    set,
  };
}

export const backendStatus = createBackendStatusStore();

/** Normalize Ollama tag names (strip optional :latest). */
function ollamaTagMatches(tags: string[], selected: string): boolean {
  const want = selected.trim();
  if (!want) return false;
  return tags.some((t) => t === want || t === `${want}:latest` || want === `${t}:latest`);
}

/**
 * Poll reachability for the active chat backend. Green = ready, yellow = host up but model missing,
 * red = unreachable / misconfigured.
 */
export async function pollBackendHealth(input: {
  chatBackend: ChatBackend;
  selectedModel: string;
  ollamaEndpoint: string;
  ollamaApiKey?: string;
  llamacppEndpoint: string;
  llamacppApiKey?: string;
  anthropicApiKey: string;
  deepseekApiKey: string;
}): Promise<BackendStatusLine> {
  const {
    chatBackend,
    selectedModel,
    ollamaEndpoint,
    ollamaApiKey,
    llamacppEndpoint,
    llamacppApiKey,
    anthropicApiKey,
    deepseekApiKey,
  } = input;

  if (chatBackend === "ollama") {
    const h = await probeOllama(ollamaEndpoint, ollamaApiKey);
    const base = ollamaEndpoint.replace(/\/$/, "");
    const ollamaHeaders = ollamaAuthHeaders(ollamaApiKey);
    if (h.dot === "red") {
      return { backend: "ollama", dot: "red", label: "Ollama", detail: h.detail };
    }
    if (h.dot === "yellow" && h.modelCount === 0) {
      return { backend: "ollama", dot: "yellow", label: "Ollama", detail: h.detail };
    }
    try {
      const tagsRes = await fetch(`${base}/api/tags`, {
        headers: ollamaHeaders,
        signal: AbortSignal.timeout(8_000),
      });
      const tagsJson = (await tagsRes.json()) as { models?: { name: string }[] };
      const names = (tagsJson.models ?? []).map((m) => m.name);
      if (ollamaTagMatches(names, selectedModel)) {
        return { backend: "ollama", dot: "green", label: "Ollama", detail: selectedModel };
      }
      return {
        backend: "ollama",
        dot: "yellow",
        label: "Ollama",
        detail: `Model not installed: ${selectedModel} (pull or pick another)`,
      };
    } catch {
      return { backend: "ollama", dot: h.dot, label: "Ollama", detail: h.detail };
    }
  }

  if (chatBackend === "llamacpp") {
    const h = await probeLlamacpp(llamacppEndpoint, llamacppApiKey);
    const base = llamacppEndpoint.replace(/\/$/, "");
    if (h.dot === "red") {
      return { backend: "llamacpp", dot: "red", label: "llama.cpp", detail: h.detail };
    }
    try {
      const headers: Record<string, string> = {};
      const k = llamacppApiKey?.trim();
      if (k) headers.Authorization = `Bearer ${k}`;
      const res = await fetch(`${base}/v1/models`, { headers, signal: AbortSignal.timeout(8_000) });
      const j = (await res.json()) as { data?: { id: string }[] };
      const ids = (j.data ?? []).map((m) => m.id);
      const okModel =
        ids.includes(selectedModel) || ids.some((id) => id.endsWith(selectedModel));
      if (okModel) {
        return {
          backend: "llamacpp",
          dot: "green",
          label: "llama.cpp",
          detail: selectedModel,
        };
      }
      return {
        backend: "llamacpp",
        dot: "yellow",
        label: "llama.cpp",
        detail: ids.length
          ? `Server up; model "${selectedModel}" not in /v1/models`
          : h.detail,
      };
    } catch {
      return { backend: "llamacpp", dot: h.dot, label: "llama.cpp", detail: h.detail };
    }
  }

  if (chatBackend === "deepseek") {
    const key = deepseekApiKey.trim();
    if (key.length >= 20) {
      return {
        backend: "deepseek",
        dot: "green",
        label: "DeepSeek",
        detail: selectedModel,
      };
    }
    return {
      backend: "deepseek",
      dot: "red",
      label: "DeepSeek",
      detail: "Add an API key in Settings",
    };
  }

  const key = anthropicApiKey.trim();
  if (key.length >= 20) {
    return {
      backend: "anthropic",
      dot: "green",
      label: "Anthropic",
      detail: selectedModel,
    };
  }
  return {
    backend: "anthropic",
    dot: "red",
    label: "Anthropic",
    detail: "Add an API key in Settings",
  };
}
