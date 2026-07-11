/** Optional dev API keys from project `.env` (see vite.config.ts `define`). */

import { isTauriAvailable } from "./ipc";

declare const __SPACEBAR_EDITOR_ENV_ANTHROPIC_API_KEY__: string | undefined;
declare const __SPACEBAR_EDITOR_ENV_DEEPSEEK_API_KEY__: string | undefined;

export type EnvApiKeySlot = "anthropic" | "deepseek";

function injectedKey(slot: EnvApiKeySlot): string {
  if (!import.meta.env.DEV) return "";
  const raw =
    slot === "anthropic"
      ? typeof __SPACEBAR_EDITOR_ENV_ANTHROPIC_API_KEY__ !== "undefined"
        ? __SPACEBAR_EDITOR_ENV_ANTHROPIC_API_KEY__
        : ""
      : typeof __SPACEBAR_EDITOR_ENV_DEEPSEEK_API_KEY__ !== "undefined"
        ? __SPACEBAR_EDITOR_ENV_DEEPSEEK_API_KEY__
        : "";
  return typeof raw === "string" ? raw.trim() : "";
}

/** Fill empty stored keys from `.env` in web dev only — never in Tauri (keychain). */
export function mergeApiKeysFromEnv(apiKeys: {
  anthropic: string;
  deepseek: string;
  openai: string;
}): { anthropic: string; deepseek: string; openai: string } {
  if (!import.meta.env.DEV || isTauriAvailable()) return apiKeys;
  return {
    anthropic: apiKeys.anthropic.trim() || injectedKey("anthropic"),
    deepseek: apiKeys.deepseek.trim() || injectedKey("deepseek"),
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
