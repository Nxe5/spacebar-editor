<script lang="ts">
  import GearIcon from "phosphor-svelte/lib/GearIcon";
  import { settings, type ChatBackend, type ModelConfig } from "$lib/stores/settings";
  import ModelSettingsExpand from "./ModelSettingsExpand.svelte";

  let {
    backend,
    onTogglePicker,
    readonly = false,
    loadedModelId = null as string | null,
  }: {
    backend: ChatBackend;
    onTogglePicker?: (modelId: string, show: boolean) => void;
    readonly?: boolean;
    loadedModelId?: string | null;
  } = $props();

  let models = $derived.by((): ModelConfig[] => {
    switch (backend) {
      case "anthropic":
        return $settings.anthropicModels;
      case "deepseek":
        return $settings.deepseekModels;
      case "glm":
        return $settings.glmModels;
      case "kimi":
        return $settings.kimiModels;
      case "ollama":
        return $settings.ollamaModels;
      case "llamacpp":
        return $settings.llamacppModels;
    }
  });

  let expandedId = $state<string | null>(null);
  let providerDefaults = $derived($settings.providerModelDefaults[backend]);

  function fmtCtx(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
    if (n >= 1000) return `${Math.round(n / 1000)}k`;
    return String(n);
  }

  function toggleExpand(modelId: string) {
    expandedId = expandedId === modelId ? null : modelId;
  }
</script>

<div class="model-picker-cards">
  {#each models as model (model.id)}
    <div class="model-row">
      {#if readonly}
        <div
          class="model-picker-card model-picker-card--readonly"
          class:model-picker-card--loaded={loadedModelId != null && model.id === loadedModelId}
        >
          <span class="model-picker-card-body">
            <span class="model-picker-card-name" title={model.name}>{model.name}</span>
            {#if model.contextWindow}
              <span class="model-list-meta">{fmtCtx(model.contextWindow)} ctx</span>
            {/if}
            {#if loadedModelId != null && model.id === loadedModelId}
              <span class="model-list-meta model-list-meta--loaded">Loaded on server</span>
            {/if}
          </span>
          <button
            type="button"
            class="model-gear-btn"
            aria-label="Model settings for {model.name}"
            aria-expanded={expandedId === model.id}
            onclick={() => toggleExpand(model.id)}
          >
            <GearIcon size={14} aria-hidden="true" />
          </button>
        </div>
      {:else}
        <label
          class="model-picker-card"
          class:model-picker-card--hidden={model.showInPicker === false}
        >
          <input
            type="checkbox"
            class="checkbox"
            checked={model.showInPicker !== false}
            aria-label="Show {model.name} in chat model menu"
            onchange={(e) =>
              onTogglePicker?.(model.id, (e.currentTarget as HTMLInputElement).checked)}
          />
          <span class="model-picker-card-body">
            <span class="model-picker-card-name" title={model.name}>{model.name}</span>
            {#if model.contextWindow}
              <span class="model-list-meta">{fmtCtx(model.contextWindow)} ctx</span>
            {/if}
          </span>
          <button
            type="button"
            class="model-gear-btn"
            aria-label="Model settings for {model.name}"
            aria-expanded={expandedId === model.id}
            onclick={(e) => {
              e.preventDefault();
              toggleExpand(model.id);
            }}
          >
            <GearIcon size={14} aria-hidden="true" />
          </button>
        </label>
      {/if}
      {#if expandedId === model.id}
        <ModelSettingsExpand {backend} {model} {providerDefaults} />
      {/if}
    </div>
  {/each}
</div>

<style>
  .model-picker-cards {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .model-row {
    display: flex;
    flex-direction: column;
  }

  .model-picker-card {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.625rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    cursor: pointer;
  }

  .model-picker-card--readonly {
    cursor: default;
  }

  .model-picker-card--hidden {
    opacity: 0.55;
  }

  .model-picker-card--loaded {
    border-color: var(--accent, #3b82f6);
  }

  .model-picker-card-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.35rem 0.5rem;
  }

  .model-picker-card-name {
    font-size: 0.875rem;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .model-list-meta {
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }

  .model-list-meta--loaded {
    color: var(--accent, #3b82f6);
  }

  .model-gear-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
  }

  .model-gear-btn:hover {
    background: color-mix(in srgb, var(--foreground) 8%, transparent);
    color: var(--foreground);
  }

  .checkbox {
    flex-shrink: 0;
  }
</style>
