<script lang="ts">
  import { settings, type ChatBackend, type ModelConfig } from "$lib/stores/settings";

  let {
    backend,
    model,
    providerDefaults,
  }: {
    backend: ChatBackend;
    model: ModelConfig;
    providerDefaults: {
      contextWindow: number;
      toolCallFormat: "native" | "text_fallback";
      parallelToolCalls: boolean;
      promptVerbosity: "standard" | "detailed";
    };
  } = $props();

  function patch(p: Partial<ModelConfig>) {
    settings.patchModelConfig(backend, model.id, p);
  }

  let contextWindow = $derived(model.contextWindow ?? providerDefaults.contextWindow);
  let toolCallFormat = $derived(model.toolCallFormat ?? providerDefaults.toolCallFormat);
  let parallelToolCalls = $derived(model.parallelToolCalls ?? providerDefaults.parallelToolCalls);
  let promptVerbosity = $derived(model.promptVerbosity ?? providerDefaults.promptVerbosity);
</script>

<div class="model-settings-expand">
  <label class="field">
    <span class="name">Context window</span>
    <input
      type="number"
      class="input"
      min="1024"
      step="1024"
      value={contextWindow}
      onchange={(e) =>
        patch({ contextWindow: Number((e.currentTarget as HTMLInputElement).value) })}
    />
  </label>
  <label class="field">
    <span class="name">Tool call format</span>
    <select
      class="input"
      value={toolCallFormat}
      onchange={(e) =>
        patch({
          toolCallFormat: (e.currentTarget as HTMLSelectElement).value as
            | "native"
            | "text_fallback",
        })}
    >
      <option value="native">Native (API tools)</option>
      <option value="text_fallback">Text fallback (prompt-based)</option>
    </select>
  </label>
  <label class="field checkbox-field">
    <input
      type="checkbox"
      checked={parallelToolCalls}
      onchange={(e) =>
        patch({ parallelToolCalls: (e.currentTarget as HTMLInputElement).checked })}
    />
    <span class="name">Parallel tool calls</span>
  </label>
  <label class="field">
    <span class="name">Prompt verbosity</span>
    <select
      class="input"
      value={promptVerbosity}
      onchange={(e) =>
        patch({
          promptVerbosity: (e.currentTarget as HTMLSelectElement).value as
            | "standard"
            | "detailed",
        })}
    >
      <option value="standard">Standard</option>
      <option value="detailed">Detailed</option>
    </select>
  </label>
</div>

<style>
  .model-settings-expand {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
    gap: 0.75rem;
    padding: 0.75rem;
    margin: 0.25rem 0 0.5rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: color-mix(in srgb, var(--background) 92%, var(--muted-foreground));
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .field.checkbox-field {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }

  .name {
    font-size: 0.8125rem;
    color: var(--muted-foreground);
  }

  .input {
    font: inherit;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--background);
    color: var(--foreground);
  }
</style>
