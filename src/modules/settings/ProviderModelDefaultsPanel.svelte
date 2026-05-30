<script lang="ts">
  import { settings, type ChatBackend } from "$lib/stores/settings";
  import type { ProviderModelDefaults } from "$lib/modelSettings";

  let { backend }: { backend: ChatBackend } = $props();

  let defaults = $derived($settings.providerModelDefaults[backend]);

  function patch(patch: Partial<ProviderModelDefaults>) {
    settings.setProviderModelDefaults(backend, patch);
  }
</script>

<div class="provider-defaults">
  <p class="group-label">Provider defaults</p>
  <p class="note muted">
    Applied when new models are added. Existing models keep their current settings unless you
    change them per model.
  </p>
  <label class="field">
    <span class="name">Default context window</span>
    <input
      type="number"
      class="input"
      min="1024"
      step="1024"
      value={defaults.contextWindow}
      onchange={(e) =>
        patch({ contextWindow: Number((e.currentTarget as HTMLInputElement).value) })}
    />
  </label>
  <label class="field">
    <span class="name">Default tool call format</span>
    <select
      class="input"
      value={defaults.toolCallFormat}
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
      checked={defaults.parallelToolCalls}
      onchange={(e) =>
        patch({ parallelToolCalls: (e.currentTarget as HTMLInputElement).checked })}
    />
    <span class="name">Allow parallel tool calls</span>
  </label>
  <label class="field">
    <span class="name">Default prompt verbosity</span>
    <select
      class="input"
      value={defaults.promptVerbosity}
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
  .provider-defaults {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 0;
    border-top: 1px solid var(--border);
    margin-top: 0.5rem;
  }

  .group-label {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted-foreground);
  }

  .note {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--muted-foreground);
    line-height: 1.45;
  }

  .note.muted {
    opacity: 0.9;
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
    font-size: 0.875rem;
  }

  .input {
    font: inherit;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--background);
    color: var(--foreground);
    max-width: 16rem;
  }
</style>
