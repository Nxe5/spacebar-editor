<script lang="ts">
  import CopyableSnippet from "$lib/components/CopyableSnippet.svelte";
  import {
    DEFAULT_OLLAMA_SERVER_TEMPLATE,
    OLLAMA_OVERRIDE_FIELDS,
    buildOllamaOverrideConf,
    type OllamaOverrideField,
    type OllamaServerTemplate,
  } from "$lib/providerServerConfig";

  let { template = $bindable(), compact = false }: { template: OllamaServerTemplate; compact?: boolean } =
    $props();

  let visibleFields = $derived(
    OLLAMA_OVERRIDE_FIELDS.filter((field) => !field.visible || field.visible(template))
  );

  let preview = $derived(buildOllamaOverrideConf(template));

  function reset() {
    template = { ...DEFAULT_OLLAMA_SERVER_TEMPLATE };
  }

  function isNestedField(field: OllamaOverrideField): boolean {
    return field.templateKey === "hsaOverrideVersion";
  }
</script>

<div class="ollama-override-panel" class:ollama-override-panel--compact={compact}>
  <div class="panel-toolbar">
    <button type="button" class="btn ghost" onclick={reset}>Reset defaults</button>
  </div>

  <div class="override-field-list">
    {#each visibleFields as field (field.templateKey)}
      <div
        class="override-field"
        class:override-field--nested={isNestedField(field)}
        class:override-field--bool={field.kind === "boolean"}
      >
        <span class="override-field-name">{field.label}</span>
        <p class="override-field-desc">
          <code class="env">{field.envVar}</code>
          {#if field.hint}
            <span class="hint">{field.hint}</span>
          {/if}
        </p>
        <div class="override-field-control">
          {#if field.kind === "boolean"}
            <label class="toggle-control">
              <input
                type="checkbox"
                class="checkbox"
                bind:checked={template[field.templateKey] as boolean}
              />
              <span class="toggle-label">{template[field.templateKey] ? "On" : "Off"}</span>
            </label>
          {:else if field.kind === "number"}
            <input
              class="input"
              type="number"
              min={field.min ?? undefined}
              bind:value={template[field.templateKey]}
              aria-label={field.label}
            />
          {:else}
            <input
              class="input"
              type="text"
              bind:value={template[field.templateKey]}
              aria-label={field.label}
            />
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <CopyableSnippet {compact} label="override.conf preview" text={preview} />
</div>

<style>
  .ollama-override-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .panel-toolbar {
    display: flex;
    justify-content: flex-end;
  }

  .override-field-list {
    display: flex;
    flex-direction: column;
    gap: 0;
    border: 1px solid var(--border, #383838);
    border-radius: 8px;
    overflow: hidden;
    background: #141414;
  }

  .override-field {
    display: grid;
    grid-template-columns: 8.25rem minmax(0, 1fr) minmax(9rem, 18rem);
    gap: 6px 12px;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border, #333);
  }

  .override-field:last-child {
    border-bottom: none;
  }

  .override-field--nested {
    padding-left: 20px;
    background: #181818;
    box-shadow: inset 3px 0 0 #505050;
  }

  .override-field-name {
    font-size: 12px;
    font-weight: 600;
    color: #e8e8e8;
    line-height: 1.3;
  }

  .override-field-desc {
    margin: 0;
    min-width: 0;
    font-size: 11px;
    line-height: 1.35;
    color: #999;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 8px;
  }

  .env {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    color: #86c9b7;
  }

  .hint {
    color: #888;
  }

  .hint::before {
    content: "— ";
    color: #555;
  }

  .override-field-control {
    min-width: 0;
    justify-self: stretch;
  }

  .override-field--bool {
    grid-template-columns: 8.25rem minmax(0, 1fr) auto;
  }

  .toggle-control {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    cursor: pointer;
    user-select: none;
    width: 100%;
  }

  .toggle-control .checkbox {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    cursor: pointer;
  }

  .toggle-label {
    font-size: 13px;
    color: #c8c8c8;
    min-width: 1.75rem;
  }

  .input {
    width: 100%;
    padding: 6px 8px;
    font-size: 12px;
    color: var(--foreground, #e5e5e5);
    background: var(--input, #1c1c1c);
    border: 1px solid var(--border, #404040);
    border-radius: 6px;
    box-sizing: border-box;
  }

  .ollama-override-panel--compact .override-field-name {
    font-size: 13px;
  }

  .ollama-override-panel--compact .override-field-desc {
    font-size: 12px;
  }

  .ollama-override-panel--compact .input {
    font-size: 13px;
  }
</style>
