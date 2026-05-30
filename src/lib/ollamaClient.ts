export type OllamaModelConfig = {
  id: string;
  name: string;
  provider: "ollama";
  /** User-selected effective context (matches chat `num_ctx`). */
  contextWindow: number;
  /** Upper bound from Ollama model metadata (`/api/show`). */
  contextLimitMax?: number;
  /** When false, hidden from the chat model picker. */
  showInPicker?: boolean;
};

/** Pull these for a good local dev experience (small downloads, roughly 0.5–2.5 GB total). */
export const RECOMMENDED_OLLAMA_MODELS: OllamaModelConfig[] = [
  { id: "llama3.2:1b", name: "Llama 3.2 1B", provider: "ollama", contextWindow: 131072, contextLimitMax: 131072 },
  { id: "qwen2.5:0.5b", name: "Qwen 2.5 0.5B", provider: "ollama", contextWindow: 32768, contextLimitMax: 32768 },
  { id: "tinyllama", name: "TinyLlama 1.1B", provider: "ollama", contextWindow: 2048, contextLimitMax: 2048 },
  { id: "gemma2:2b", name: "Gemma 2 2B", provider: "ollama", contextWindow: 8192, contextLimitMax: 8192 },
];

/** Lower bound for context budget pickers (Ollama / chat meter). */
export const MIN_CTX = 2048;
const DEFAULT_MAX = 8192;

/** Powers of two from MIN_CTX up to `max` (inclusive). */
export function contextOptionsUpTo(max: number): number[] {
  const cap = Math.max(MIN_CTX, Math.floor(max));
  const out: number[] = [];
  for (let n = MIN_CTX; n <= cap; n *= 2) {
    out.push(n);
  }
  if (out.length === 0 || out[out.length - 1] < cap) {
    if (!out.includes(cap)) out.push(cap);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/** Pick a valid option at or below `preferred`, else largest ≤ max. */
export function pickContextOption(preferred: number, max: number): number {
  const opts = contextOptionsUpTo(max);
  if (opts.length === 0) return Math.min(Math.max(preferred, MIN_CTX), max);
  const p = Math.min(Math.max(preferred, MIN_CTX), max);
  let best = opts[0];
  for (const o of opts) {
    if (o <= p) best = o;
  }
  return best;
}

function parseMaxFromModelInfo(modelInfo: unknown): number | null {
  if (!modelInfo || typeof modelInfo !== "object") return null;
  let best = 0;
  for (const [k, v] of Object.entries(modelInfo as Record<string, unknown>)) {
    if (!k.toLowerCase().includes("context_length")) continue;
    if (typeof v === "number" && Number.isFinite(v) && v > best) best = v;
  }
  return best > 0 ? best : null;
}

function parseNumCtxFromParameters(parameters: string | undefined): number | null {
  if (!parameters) return null;
  const m = parameters.match(/num_ctx\s+(\d+)/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Auth headers for remote or secured Ollama instances. */
export function ollamaAuthHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const k = apiKey?.trim();
  if (k) headers.Authorization = `Bearer ${k}`;
  return headers;
}

/**
 * Max context length Ollama reports for an installed model (`POST /api/show`).
 */
export async function fetchOllamaModelMaxContext(
  endpoint: string,
  modelName: string,
  apiKey?: string
): Promise<number> {
  const base = endpoint.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ollamaAuthHeaders(apiKey) },
      body: JSON.stringify({ name: modelName }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return DEFAULT_MAX;
    const data = (await res.json()) as {
      model_info?: Record<string, unknown>;
      parameters?: string;
    };
    const fromInfo = parseMaxFromModelInfo(data.model_info);
    const fromParams = parseNumCtxFromParameters(data.parameters);
    const candidates = [fromInfo, fromParams].filter((x): x is number => x != null && x > 0);
    if (candidates.length === 0) return DEFAULT_MAX;
    return Math.max(...candidates);
  } catch {
    return DEFAULT_MAX;
  }
}

function mergePreviousContext(
  id: string,
  maxCtx: number,
  previous: { id: string; contextWindow: number; showInPicker?: boolean }[] | undefined
): { contextWindow: number; contextLimitMax: number; showInPicker: boolean } {
  const prev = previous?.find((m) => m.id === id);
  const max = Math.max(MIN_CTX, maxCtx);
  const prevSel = prev?.contextWindow;
  const raw =
    typeof prevSel === "number" && prevSel >= MIN_CTX && prevSel <= max ? prevSel : Math.min(DEFAULT_MAX, max);
  return {
    contextLimitMax: max,
    contextWindow: pickContextOption(raw, max),
    showInPicker: prev?.showInPicker !== false,
  };
}

/**
 * Lists installed models from `/api/tags` and enriches each with max context from `/api/show`.
 * Preserves prior `contextWindow` when still valid.
 */
export async function fetchOllamaModelList(
  endpoint: string,
  previousModels?: { id: string; contextWindow: number; showInPicker?: boolean }[],
  apiKey?: string
): Promise<OllamaModelConfig[]> {
  const base = endpoint.replace(/\/$/, "");
  const res = await fetch(`${base}/api/tags`, {
    headers: ollamaAuthHeaders(apiKey),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Ollama returned ${res.status} at ${base}/api/tags`);
  }
  const data = (await res.json()) as { models?: { name: string }[] };
  const names = (data.models ?? []).map((m) => m.name);

  const enriched = await Promise.all(
    names.map(async (name) => {
      const maxCtx = await fetchOllamaModelMaxContext(endpoint, name, apiKey);
      const { contextWindow, contextLimitMax, showInPicker } = mergePreviousContext(
        name,
        maxCtx,
        previousModels
      );
      return {
        id: name,
        name,
        provider: "ollama" as const,
        contextWindow,
        contextLimitMax,
        showInPicker,
      };
    })
  );

  return enriched;
}
