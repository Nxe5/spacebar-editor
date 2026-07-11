/** Optional dev API keys from project `.env` (see vite.config.ts `define`). */

declare const __SPACEBAR_EDITOR_ENV_ANTHROPIC_API_KEY__: string | undefined;
declare const __SPACEBAR_EDITOR_ENV_DEEPSEEK_API_KEY__: string | undefined;
declare const __SPACEBAR_EDITOR_ENV_GLM_API_KEY__: string | undefined;
declare const __SPACEBAR_EDITOR_ENV_KIMI_API_KEY__: string | undefined;

export type EnvApiKeySlot = "anthropic" | "deepseek" | "glm" | "kimi";

function injectedKey(slot: EnvApiKeySlot): string {
  if (!import.meta.env.DEV) return "";
  const raw =
    slot === "anthropic"
      ? typeof __SPACEBAR_EDITOR_ENV_ANTHROPIC_API_KEY__ !== "undefined"
        ? __SPACEBAR_EDITOR_ENV_ANTHROPIC_API_KEY__
        : ""
      : slot === "deepseek"
        ? typeof __SPACEBAR_EDITOR_ENV_DEEPSEEK_API_KEY__ !== "undefined"
          ? __SPACEBAR_EDITOR_ENV_DEEPSEEK_API_KEY__
          : ""
        : slot === "glm"
          ? typeof __SPACEBAR_EDITOR_ENV_GLM_API_KEY__ !== "undefined"
            ? __SPACEBAR_EDITOR_ENV_GLM_API_KEY__
            : ""
          : typeof __SPACEBAR_EDITOR_ENV_KIMI_API_KEY__ !== "undefined"
            ? __SPACEBAR_EDITOR_ENV_KIMI_API_KEY__
            : "";
  return typeof raw === "string" ? raw.trim() : "";
}

/** Fill empty stored keys from `.env` in dev when Settings fields are empty. */
export function mergeApiKeysFromEnv(apiKeys: {
  anthropic: string;
  deepseek: string;
  glm: string;
  kimi: string;
  openai: string;
}): { anthropic: string; deepseek: string; glm: string; kimi: string; openai: string } {
  if (!import.meta.env.DEV) return apiKeys;
  return {
    anthropic: apiKeys.anthropic.trim() || injectedKey("anthropic"),
    deepseek: apiKeys.deepseek.trim() || injectedKey("deepseek"),
    glm: apiKeys.glm.trim() || injectedKey("glm"),
    kimi: apiKeys.kimi.trim() || injectedKey("kimi"),
    openai: apiKeys.openai,
  };
}

// These functions run in Node/test context only — declare process to satisfy browser-targeting svelte-check.
declare const process: { env: Record<string, string | undefined> };

/** Node/tests: read DeepSeek key from process.env (supports `deepseek_api_key` in `.env`). */
export function deepseekApiKeyFromProcessEnv(): string {
  const raw =
    process.env.DEEPSEEK_API_KEY ??
    process.env.deepseek_api_key ??
    process.env.VITE_DEEPSEEK_API_KEY ??
    "";
  return raw.trim();
}

export function anthropicApiKeyFromProcessEnv(): string {
  const raw =
    process.env.ANTHROPIC_API_KEY ??
    process.env.anthropic_api_key ??
    process.env.VITE_ANTHROPIC_API_KEY ??
    "";
  return raw.trim();
}

export function glmApiKeyFromProcessEnv(): string {
  const raw =
    process.env.GLM_API_KEY ??
    process.env.glm_api_key ??
    process.env.ZAI_API_KEY ??
    process.env.VITE_GLM_API_KEY ??
    "";
  return raw.trim();
}

export function kimiApiKeyFromProcessEnv(): string {
  const raw =
    process.env.KIMI_API_KEY ??
    process.env.kimi_api_key ??
    process.env.MOONSHOT_API_KEY ??
    process.env.VITE_KIMI_API_KEY ??
    "";
  return raw.trim();
}
