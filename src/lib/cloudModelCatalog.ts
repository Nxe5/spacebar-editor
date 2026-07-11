import type { ModelConfig } from "./stores/settings";

const ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models";
const ANTHROPIC_VERSION = "2023-06-01";
const DEEPSEEK_MODELS_URL = "https://api.deepseek.com/models";
const GLM_MODELS_URL = "https://api.z.ai/api/paas/v4/models";
const KIMI_MODELS_URL = "https://api.moonshot.ai/v1/models";

/** Static fallbacks when the catalog API is unavailable (dev / offline). */
export const ANTHROPIC_MODEL_FALLBACKS: ModelConfig[] = [
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "anthropic", contextWindow: 200_000 },
  { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", provider: "anthropic", contextWindow: 200_000 },
  { id: "claude-3-opus-20240229", name: "Claude 3 Opus", provider: "anthropic", contextWindow: 200_000 },
  { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", provider: "anthropic", contextWindow: 200_000 },
];

export const DEEPSEEK_MODEL_FALLBACKS: ModelConfig[] = [
  { id: "deepseek-chat", name: "DeepSeek Chat", provider: "deepseek", contextWindow: 65_536 },
  { id: "deepseek-reasoner", name: "DeepSeek Reasoner", provider: "deepseek", contextWindow: 65_536 },
];

export const GLM_MODEL_FALLBACKS: ModelConfig[] = [
  { id: "glm-4-flash", name: "GLM-4 Flash", provider: "glm", contextWindow: 128_000 },
  { id: "glm-4-plus", name: "GLM-4 Plus", provider: "glm", contextWindow: 128_000 },
  { id: "glm-5.2", name: "GLM-5.2", provider: "glm", contextWindow: 200_000 },
];

export const KIMI_MODEL_FALLBACKS: ModelConfig[] = [
  { id: "kimi-k2.5", name: "Kimi K2.5", provider: "kimi", contextWindow: 262_144 },
  { id: "kimi-k2-turbo-preview", name: "Kimi K2 Turbo", provider: "kimi", contextWindow: 262_144 },
];

type AnthropicModelRow = {
  id: string;
  display_name?: string;
  max_input_tokens?: number;
};

type AnthropicListResponse = {
  data?: AnthropicModelRow[];
  has_more?: boolean;
  last_id?: string;
};

type DeepseekListResponse = {
  data?: Array<{ id: string }>;
};

type OpenAIModelListResponse = {
  data?: Array<{ id: string }>;
};

function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

/** List models available to the Anthropic API key (paginated). */
export async function fetchAnthropicModelCatalog(apiKey: string): Promise<ModelConfig[]> {
  const key = apiKey.trim();
  if (key.length < 10) {
    throw new Error("Anthropic API key is missing or too short");
  }

  const out: ModelConfig[] = [];
  let afterId: string | undefined;

  for (let page = 0; page < 20; page++) {
    const url = new URL(ANTHROPIC_MODELS_URL);
    url.searchParams.set("limit", "100");
    if (afterId) url.searchParams.set("after_id", afterId);

    const res = await fetch(url.toString(), {
      headers: anthropicHeaders(key),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Anthropic models API ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
    }

    const body = (await res.json()) as AnthropicListResponse;
    for (const row of body.data ?? []) {
      if (!row.id) continue;
      out.push({
        id: row.id,
        name: row.display_name?.trim() || row.id,
        provider: "anthropic",
        contextWindow: row.max_input_tokens ?? 200_000,
        showInPicker: true,
      });
    }

    if (!body.has_more || !body.last_id) break;
    afterId = body.last_id;
  }

  if (out.length === 0) {
    throw new Error("Anthropic returned no models for this API key");
  }

  return out;
}

/** List models available to the DeepSeek API key. */
export async function fetchDeepseekModelCatalog(apiKey: string): Promise<ModelConfig[]> {
  const key = apiKey.trim();
  if (key.length < 10) {
    throw new Error("DeepSeek API key is missing or too short");
  }

  const res = await fetch(DEEPSEEK_MODELS_URL, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DeepSeek models API ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }

  const body = (await res.json()) as DeepseekListResponse;
  const out: ModelConfig[] = [];
  for (const row of body.data ?? []) {
    if (!row.id) continue;
    out.push({
      id: row.id,
      name: formatDeepseekModelName(row.id),
      provider: "deepseek",
      contextWindow: 65_536,
      showInPicker: true,
    });
  }

  if (out.length === 0) {
    throw new Error("DeepSeek returned no models for this API key");
  }

  return out;
}

function formatGlmModelName(id: string): string {
  if (id === "glm-4-flash") return "GLM-4 Flash";
  if (id === "glm-4-plus") return "GLM-4 Plus";
  if (id === "glm-5.2") return "GLM-5.2";
  return id;
}

function formatKimiModelName(id: string): string {
  if (id === "kimi-k2.5") return "Kimi K2.5";
  if (id === "kimi-k2-turbo-preview") return "Kimi K2 Turbo";
  if (id.startsWith("kimi-k2")) return id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return id;
}

function defaultContextForGlmModel(id: string): number {
  if (id.includes("5.2") || id.includes("5-")) return 200_000;
  return 128_000;
}

function defaultContextForKimiModel(id: string): number {
  if (id.includes("k2") || id.includes("moonshot")) return 262_144;
  return 128_000;
}

async function fetchBearerModelCatalog(input: {
  url: string;
  provider: ModelConfig["provider"];
  apiKey: string;
  providerLabel: string;
  defaultContextWindow: number;
  formatName: (id: string) => string;
  contextForId?: (id: string) => number;
}): Promise<ModelConfig[]> {
  const key = input.apiKey.trim();
  if (key.length < 10) {
    throw new Error(`${input.providerLabel} API key is missing or too short`);
  }

  const res = await fetch(input.url, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `${input.providerLabel} models API ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`
    );
  }

  const body = (await res.json()) as OpenAIModelListResponse;
  const out: ModelConfig[] = [];
  for (const row of body.data ?? []) {
    if (!row.id) continue;
    out.push({
      id: row.id,
      name: input.formatName(row.id),
      provider: input.provider,
      contextWindow: input.contextForId?.(row.id) ?? input.defaultContextWindow,
      showInPicker: true,
    });
  }

  if (out.length === 0) {
    throw new Error(`${input.providerLabel} returned no models for this API key`);
  }

  return out;
}

/** List models available to the GLM (Z.ai) API key. */
export async function fetchGlmModelCatalog(apiKey: string): Promise<ModelConfig[]> {
  return fetchBearerModelCatalog({
    url: GLM_MODELS_URL,
    provider: "glm",
    apiKey,
    providerLabel: "GLM",
    defaultContextWindow: 128_000,
    formatName: formatGlmModelName,
    contextForId: defaultContextForGlmModel,
  });
}

/** List models available to the Kimi (Moonshot) API key. */
export async function fetchKimiModelCatalog(apiKey: string): Promise<ModelConfig[]> {
  return fetchBearerModelCatalog({
    url: KIMI_MODELS_URL,
    provider: "kimi",
    apiKey,
    providerLabel: "Kimi",
    defaultContextWindow: 262_144,
    formatName: formatKimiModelName,
    contextForId: defaultContextForKimiModel,
  });
}

function formatDeepseekModelName(id: string): string {
  if (id === "deepseek-chat") return "DeepSeek Chat";
  if (id === "deepseek-reasoner") return "DeepSeek Reasoner";
  return id;
}

export function seedAnthropicModels(parsed: ModelConfig[] | undefined): ModelConfig[] {
  if (!parsed?.length) return [];
  return parsed.map((m) => ({
    ...m,
    provider: "anthropic" as const,
    showInPicker: m.showInPicker !== false,
  }));
}

export function seedDeepseekModels(parsed: ModelConfig[] | undefined): ModelConfig[] {
  if (!parsed?.length) return [];
  return parsed.map((m) => ({
    ...m,
    provider: "deepseek" as const,
    showInPicker: m.showInPicker !== false,
  }));
}

export function seedGlmModels(parsed: ModelConfig[] | undefined): ModelConfig[] {
  if (!parsed?.length) return [];
  return parsed.map((m) => ({
    ...m,
    provider: "glm" as const,
    showInPicker: m.showInPicker !== false,
  }));
}

export function seedKimiModels(parsed: ModelConfig[] | undefined): ModelConfig[] {
  if (!parsed?.length) return [];
  return parsed.map((m) => ({
    ...m,
    provider: "kimi" as const,
    showInPicker: m.showInPicker !== false,
  }));
}
