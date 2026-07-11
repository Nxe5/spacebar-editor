<script lang="ts">
  import { get } from "svelte/store";
  import {
    settings,
    AGENT_COMPACTION_BOUNDS,
    compactionThresholdPercent,
    compactionThresholdFromPercent,
    AUTOCOMPLETE_BOUNDS,
  } from "$lib/stores/settings";
  import { buildCompactionModelOptions } from "$lib/compactionModel";

  /**
   * Compaction + Autocomplete settings. Unlike Appearance, these persist immediately
   * on change, so this component owns its draft state and talks to the store directly.
   */
  interface Props {
    section: "experimental-compaction" | "experimental-autocomplete";
  }

  let { section }: Props = $props();

  const initial = get(settings);
  let compactEnabled = $state(initial.agentCompaction.enabled);
  let autoCompact = $state(initial.agentCompaction.autoCompact);
  let useActiveChatModel = $state(initial.agentCompaction.useActiveChatModel);
  let compactThresholdPct = $state(
    compactionThresholdPercent(initial.agentCompaction.compactThreshold)
  );
  let compactKeepRecent = $state(initial.agentCompaction.compactKeepRecentTurns);
  let compactionModelChoice = $state(initial.modelRoles.compaction ?? "");
  let autocompleteEnabled = $state(initial.autocomplete.enabled);
  let autocompleteDebounceMs = $state(initial.autocomplete.debounceMs);

  let activeChatModelLabel = $derived.by(() => {
    const st = $settings;
    if (st.chatBackend === "ollama") {
      return st.ollamaModels.find((m) => m.id === st.selectedModel)?.name ?? st.selectedModel;
    }
    if (st.chatBackend === "llamacpp") {
      return st.llamacppModels.find((m) => m.id === st.selectedModel)?.name ?? st.selectedModel;
    }
    if (st.chatBackend === "deepseek") {
      return st.deepseekModels.find((m) => m.id === st.selectedModel)?.name ?? "DeepSeek";
    }
    if (st.chatBackend === "glm") {
      return st.glmModels.find((m) => m.id === st.selectedModel)?.name ?? "GLM";
    }
    if (st.chatBackend === "kimi") {
      return st.kimiModels.find((m) => m.id === st.selectedModel)?.name ?? "Kimi";
    }
    if (st.chatBackend === "anthropic") {
      return st.anthropicModels.find((m) => m.id === st.selectedModel)?.name ?? "Anthropic";
    }
    return st.selectedModel;
  });

  let compactionModelOptions = $derived.by(() =>
    buildCompactionModelOptions({
      ollamaModels: $settings.ollamaModels,
      llamacppModels: $settings.llamacppModels,
      anthropicModels: $settings.anthropicModels,
      deepseekModels: $settings.deepseekModels,
      glmModels: $settings.glmModels,
      kimiModels: $settings.kimiModels,
    })
  );

  function persistAgentCompaction() {
    settings.setAgentCompaction({
      enabled: compactEnabled,
      autoCompact,
      useActiveChatModel,
      compactThreshold: compactionThresholdFromPercent(compactThresholdPct),
      compactKeepRecentTurns: compactKeepRecent,
    });
    if (useActiveChatModel) {
      settings.setModelRoles({ compaction: null });
      compactionModelChoice = "";
    }
    const saved = get(settings).agentCompaction;
    compactEnabled = saved.enabled;
    autoCompact = saved.autoCompact;
    useActiveChatModel = saved.useActiveChatModel;
    compactThresholdPct = compactionThresholdPercent(saved.compactThreshold);
    compactKeepRecent = saved.compactKeepRecentTurns;
    if (useActiveChatModel) {
      compactionModelChoice = "";
    }
  }

  function persistUseActiveChatModel() {
    if (useActiveChatModel) {
      compactionModelChoice = "";
    }
    persistAgentCompaction();
  }

  function persistCompactionModel() {
    settings.setModelRoles({
      compaction: compactionModelChoice.trim() || null,
    });
    if (compactionModelChoice.trim()) {
      useActiveChatModel = false;
      settings.setAgentCompaction({ useActiveChatModel: false });
    }
    compactionModelChoice = get(settings).modelRoles.compaction ?? "";
    useActiveChatModel = get(settings).agentCompaction.useActiveChatModel;
  }

  function persistAutocompleteSettings() {
    settings.setAutocompleteSettings({
      enabled: autocompleteEnabled,
      debounceMs: autocompleteDebounceMs,
    });
    const saved = get(settings).autocomplete;
    autocompleteEnabled = saved.enabled;
    autocompleteDebounceMs = saved.debounceMs;
  }
</script>

{#if section === "experimental-compaction"}
  <div class="stack">
    <div class="provider-page-head">
      <h3 class="provider-page-title">Compaction</h3>
    </div>
    <p class="note">
      Summarize-and-rehydrate long chat sessions when context fills up (spec 21). Enable
      compaction first, then choose manual-only or automatic behavior.
    </p>

    <label class="field checkbox-field">
      <input type="checkbox" bind:checked={compactEnabled} onchange={persistAgentCompaction} />
      <span class="name">Enable compaction</span>
    </label>
    <p class="note muted">
      When off, the chat footer Compact button and automatic compaction are disabled.
    </p>

    {#if compactEnabled}
      <p class="group-label">Compaction model</p>
      <label class="field checkbox-field">
        <input
          type="checkbox"
          bind:checked={useActiveChatModel}
          onchange={persistUseActiveChatModel}
        />
        <span class="name">Use active chat model</span>
      </label>
      {#if useActiveChatModel}
        <p class="note muted">Summaries use <strong>{activeChatModelLabel}</strong>.</p>
      {:else}
        <label class="field">
          <span class="name">Compaction model</span>
          <select class="input" bind:value={compactionModelChoice} onchange={persistCompactionModel}>
            <option value="" disabled>Select a model…</option>
            {#each compactionModelOptions as opt (opt.value)}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
          <span class="hint">
            Pick a model from any connected provider — useful for a cheaper or faster summarizer.
          </span>
        </label>
      {/if}

      <p class="group-label">Automatic compaction</p>
      <label class="field checkbox-field">
        <input type="checkbox" bind:checked={autoCompact} onchange={persistAgentCompaction} />
        <span class="name">Enable automatic compaction</span>
      </label>
      <p class="note muted">
        When off, compact only from the chat footer button. Manual compact is always available
        while compaction is enabled.
      </p>

      <label class="field" class:field--disabled={!autoCompact}>
        <span class="name">Auto-compact when context reaches</span>
        <div class="threshold-row">
          <input
            type="number"
            class="input threshold-input"
            min={compactionThresholdPercent(AGENT_COMPACTION_BOUNDS.compactThreshold.min)}
            max={compactionThresholdPercent(AGENT_COMPACTION_BOUNDS.compactThreshold.max)}
            bind:value={compactThresholdPct}
            disabled={!autoCompact}
            onchange={persistAgentCompaction}
          />
          <span class="threshold-suffix">% of model window</span>
        </div>
        <span class="hint">Range 50–95. Default 85 leaves headroom for the summary call.</span>
      </label>

      <label class="field">
        <span class="name">Keep last messages after compacting</span>
        <input
          type="number"
          class="input"
          min={AGENT_COMPACTION_BOUNDS.compactKeepRecentTurns.min}
          max={AGENT_COMPACTION_BOUNDS.compactKeepRecentTurns.max}
          bind:value={compactKeepRecent}
          onchange={persistAgentCompaction}
        />
        <span class="hint">
          Raw messages preserved after the summary (default 6, max {AGENT_COMPACTION_BOUNDS
            .compactKeepRecentTurns.max}).
        </span>
      </label>
    {/if}
  </div>
{:else if section === "experimental-autocomplete"}
  <div class="stack">
    <div class="provider-page-head">
      <h3 class="provider-page-title">Autocomplete</h3>
    </div>
    <p class="note">
      Inline code completions while you type. Not implemented yet — options are saved for when
      the feature lands.
    </p>

    <label class="field checkbox-field">
      <input
        type="checkbox"
        bind:checked={autocompleteEnabled}
        disabled
        onchange={persistAutocompleteSettings}
      />
      <span class="name">Enable inline autocomplete</span>
    </label>
    <p class="note muted">Coming soon — checkbox is disabled until the feature exists.</p>

    <label class="field">
      <span class="name">Debounce before requesting</span>
      <input
        type="number"
        class="input"
        min={AUTOCOMPLETE_BOUNDS.debounceMs.min}
        max={AUTOCOMPLETE_BOUNDS.debounceMs.max}
        bind:value={autocompleteDebounceMs}
        disabled
        onchange={persistAutocompleteSettings}
      />
      <span class="hint">Milliseconds to wait after you stop typing (100–2000).</span>
    </label>

    <p class="group-label">Model for autocomplete</p>
    <label class="field">
      <span class="name">Autocomplete model</span>
      <select class="input" disabled title="Not wired yet — uses active chat model">
        <option value="">{activeChatModelLabel} (active chat model)</option>
      </select>
      <span class="hint">A fast local model may be recommended when this ships.</span>
    </label>
  </div>
{/if}

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .provider-page-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .provider-page-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #e8e8e8;
  }

  .experimental-pill {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #c9a227;
    padding: 2px 8px;
    border-radius: 4px;
    background: rgba(201, 162, 39, 0.12);
  }

  .note {
    font-size: 12px;
    line-height: 1.45;
    color: #737373;
    margin: 0;
  }

  .note.muted {
    color: #5c5c5c;
  }

  .group-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #737373;
    margin: 4px 0 -4px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field--disabled {
    opacity: 0.55;
  }

  .checkbox-field {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-direction: row;
  }

  .checkbox-field .name {
    margin: 0;
  }

  .name {
    font-size: 12px;
    color: #a3a3a3;
  }

  .hint {
    font-size: 11px;
    color: #666;
  }

  .input {
    width: 100%;
    padding: 8px 10px;
    font-size: 13px;
    color: #e5e5e5;
    background: #1c1c1c;
    border: 1px solid #404040;
    border-radius: 6px;
  }

  .input:focus {
    outline: none;
    border-color: #525252;
  }

  .input:disabled {
    opacity: 0.45;
  }

  .threshold-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .threshold-input {
    width: 4.5rem;
  }

  .threshold-suffix {
    font-size: 12px;
    color: #a3a3a3;
  }
</style>
