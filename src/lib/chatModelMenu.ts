import type { ModelConfig } from "./stores/settings";
import { modelsVisibleInPicker } from "./modelPicker";

const MIN_CLOUD_KEY_LEN = 20;

export function cloudApiKeyPresent(key: string): boolean {
  return key.trim().length >= MIN_CLOUD_KEY_LEN;
}

/** Cloud provider is listed in the chat model menu after a successful catalog sync. */
export function cloudProviderMenuReady(
  apiKey: string,
  models: ModelConfig[],
  catalogFetched: boolean
): boolean {
  return (
    cloudApiKeyPresent(apiKey) &&
    catalogFetched &&
    modelsVisibleInPicker(models).length > 0
  );
}

export function ollamaProviderMenuReady(
  catalogOk: boolean,
  models: ModelConfig[]
): boolean {
  return catalogOk && modelsVisibleInPicker(models).length > 0;
}
