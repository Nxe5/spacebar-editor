/** Cloud API keys — stored in app settings (localStorage / Tauri webview storage). */

import { get } from "svelte/store";
import { settings } from "./stores/settings";

export type CloudApiProvider = "anthropic" | "deepseek" | "glm" | "kimi";

export async function saveCloudApiKey(provider: CloudApiProvider, secret: string): Promise<void> {
  settings.setApiKey(provider, secret);
}

export async function hasCloudApiKey(provider: CloudApiProvider): Promise<boolean> {
  return get(settings).apiKeys[provider].trim().length > 0;
}

export async function getCloudApiKey(provider: CloudApiProvider): Promise<string> {
  return get(settings).apiKeys[provider].trim();
}

/** Resolved keys for provider streaming. */
export async function cloudApiKeysForStream(): Promise<{
  anthropic: string;
  deepseek: string;
  glm: string;
  kimi: string;
}> {
  const keys = get(settings).apiKeys;
  return {
    anthropic: keys.anthropic.trim(),
    deepseek: keys.deepseek.trim(),
    glm: keys.glm.trim(),
    kimi: keys.kimi.trim(),
  };
}
