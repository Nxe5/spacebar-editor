/** Cloud API keys in OS keychain (desktop) with localStorage fallback (web dev). */

import { get } from "svelte/store";
import { isTauriAvailable } from "./ipc";
import { settings } from "./stores/settings";

export type CloudApiProvider = "anthropic" | "deepseek";

async function ensureTauriInvoke() {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke;
}

export async function saveCloudApiKey(provider: CloudApiProvider, secret: string): Promise<void> {
  if (!isTauriAvailable()) {
    settings.setApiKey(provider, secret);
    return;
  }
  const invoke = await ensureTauriInvoke();
  await invoke("save_cloud_api_key", { provider, secret });
  settings.setCloudApiKeyStored(provider, secret.trim().length > 0);
  if (!secret.trim()) {
    settings.setApiKey(provider, "");
  }
}

export async function hasCloudApiKey(provider: CloudApiProvider): Promise<boolean> {
  if (!isTauriAvailable()) {
    return get(settings).apiKeys[provider].trim().length > 0;
  }
  const invoke = await ensureTauriInvoke();
  return invoke<boolean>("has_cloud_api_key", { provider });
}

export async function getCloudApiKey(provider: CloudApiProvider): Promise<string> {
  if (!isTauriAvailable()) {
    return get(settings).apiKeys[provider].trim();
  }
  try {
    const invoke = await ensureTauriInvoke();
    return (await invoke<string>("get_cloud_api_key", { provider })).trim();
  } catch {
    return get(settings).apiKeys[provider].trim();
  }
}

/** Move keys from settings JSON into keychain once (desktop upgrade path). */
/** Resolved keys for provider streaming (keychain on desktop). */
export async function cloudApiKeysForStream(): Promise<{
  anthropic: string;
  deepseek: string;
}> {
  return {
    anthropic: await getCloudApiKey("anthropic"),
    deepseek: await getCloudApiKey("deepseek"),
  };
}

export async function migrateCloudApiKeysFromSettings(): Promise<void> {
  if (!isTauriAvailable()) return;
  const st = get(settings);
  for (const provider of ["anthropic", "deepseek"] as const) {
    const legacy = st.apiKeys[provider].trim();
    if (!legacy) continue;
    await saveCloudApiKey(provider, legacy);
  }
  for (const provider of ["anthropic", "deepseek"] as const) {
    if (await hasCloudApiKey(provider)) {
      settings.setCloudApiKeyStored(provider, true);
    }
  }
}
