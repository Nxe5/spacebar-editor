<script lang="ts">
  import type { ChatMode } from "$lib/stores/mode";
  import { MODE_CONFIG } from "$lib/stores/mode";
  import { files } from "$lib/stores/files";
  import { settings } from "$lib/stores/settings";
  import { systemPrompts } from "$lib/stores/systemPrompts";
  import { combinePromptContents } from "$lib/systemPrompts/config";
  import { resolveActiveModelSettings } from "$lib/modelSettings";
  import {
    buildAssemblyPreview,
    formatAssemblyPreviewDocument,
  } from "$lib/agent/systemPrompt/assemble";
  import ChatMarkdown from "$lib/components/ChatMarkdown.svelte";

  const MODES: ChatMode[] = ["chat", "plan", "agent"];

  let {
    open = false,
    onClose,
    initialMode = "agent" as ChatMode,
  }: {
    open: boolean;
    onClose: () => void;
    initialMode?: ChatMode;
  } = $props();

  let previewMode = $state<ChatMode>("agent");
  let viewMode = $state<"document" | "outline">("document");

  $effect(() => {
    if (open) previewMode = initialMode;
  });

  function assemblyInput(
    mode: ChatMode,
    st: typeof $settings,
    prompts: typeof $systemPrompts,
    workspacePath: string | null
  ) {
    return {
      workspacePath,
      includeWorkspaceInChat: st.includeWorkspaceInChat,
      userPromptText: combinePromptContents(prompts.entries, prompts.contents, mode),
      toolsEnabled: MODE_CONFIG[mode].tools.length > 0,
      modelSettings: resolveActiveModelSettings(st),
      skillBlocks: [] as Array<{ id: string; label: string; text: string }>,
    };
  }

  let previewByMode = $derived.by(() => {
    const st = $settings;
    const prompts = $systemPrompts;
    const ws = $files.workspacePath;
    return {
      chat: buildAssemblyPreview("chat", assemblyInput("chat", st, prompts, ws)),
      plan: buildAssemblyPreview("plan", assemblyInput("plan", st, prompts, ws)),
      agent: buildAssemblyPreview("agent", assemblyInput("agent", st, prompts, ws)),
    };
  });

  let activePreview = $derived(previewByMode[previewMode]);

  let documentMarkdown = $derived(
    formatAssemblyPreviewDocument(
      previewMode,
      activePreview.sections,
      activePreview.totalTokens
    )
  );

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="preview-backdrop" role="presentation" onclick={onClose}>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
      class="preview-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assembly-preview-title"
      onclick={(e) => e.stopPropagation()}
    >
      <header class="preview-header">
        <div class="preview-header-text">
          <h3 id="assembly-preview-title">Assembled system prompt</h3>
          <p class="preview-subtitle">
            ~{activePreview.totalTokens.toLocaleString()} tokens in {previewMode} mode (active blocks only)
          </p>
        </div>
        <button type="button" class="icon-close" onclick={onClose} aria-label="Close">×</button>
      </header>

      <div class="preview-toolbar">
        <div class="mode-tabs" role="tablist" aria-label="Chat mode">
          {#each MODES as mode (mode)}
            <button
              type="button"
              role="tab"
              class="mode-tab"
              class:mode-tab--active={previewMode === mode}
              aria-selected={previewMode === mode}
              onclick={() => (previewMode = mode)}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
              <span class="mode-tab-tokens">{previewByMode[mode].totalTokens.toLocaleString()} tok</span>
            </button>
          {/each}
        </div>
        <div class="view-toggle" role="group" aria-label="Preview layout">
          <button
            type="button"
            class="view-toggle-btn"
            class:view-toggle-btn--active={viewMode === "document"}
            onclick={() => (viewMode = "document")}
          >
            Document
          </button>
          <button
            type="button"
            class="view-toggle-btn"
            class:view-toggle-btn--active={viewMode === "outline"}
            onclick={() => (viewMode = "outline")}
          >
            Sections
          </button>
        </div>
      </div>

      <div class="preview-body">
        {#if viewMode === "document"}
          <div class="preview-document">
            <ChatMarkdown content={documentMarkdown} />
          </div>
        {:else}
          <div class="preview-outline">
            {#each activePreview.sections as section (section.slotId + section.order)}
              <article
                class="outline-section"
                class:outline-section--skipped={section.status === "skipped"}
                class:outline-section--placeholder={section.status === "placeholder"}
              >
                <header class="outline-section-head">
                  <span class="outline-order">{section.order}</span>
                  <span class="outline-label">{section.label}</span>
                  <span class="outline-badges">
                    {#if section.status === "active" && section.tokenEstimate > 0}
                      <span class="badge badge--tok">{section.tokenEstimate.toLocaleString()} tok</span>
                    {:else if section.status === "skipped"}
                      <span class="badge badge--skip">Skipped</span>
                    {:else}
                      <span class="badge badge--ph">Placeholder</span>
                    {/if}
                  </span>
                </header>
                {#if section.note}
                  <p class="outline-note">{section.note}</p>
                {/if}
                {#if section.status === "active" && section.text}
                  <pre class="outline-body">{section.text}</pre>
                {:else}
                  <p class="outline-empty">(no content in this slot)</p>
                {/if}
              </article>
            {/each}
          </div>
        {/if}
      </div>

      <footer class="preview-footer">
        <button type="button" class="btn secondary" onclick={onClose}>Close</button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .preview-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.6);
  }

  .preview-modal {
    width: min(920px, 100%);
    height: min(88vh, 900px);
    display: flex;
    flex-direction: column;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--background);
    box-shadow: 0 20px 56px rgba(0, 0, 0, 0.45);
  }

  .preview-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .preview-header-text {
    min-width: 0;
  }

  .preview-header h3 {
    margin: 0;
    font-size: 1.0625rem;
    font-weight: 600;
  }

  .preview-subtitle {
    margin: 0.25rem 0 0;
    font-size: 0.8125rem;
    color: var(--muted-foreground);
  }

  .icon-close {
    flex-shrink: 0;
    font-size: 1.35rem;
    line-height: 1;
    padding: 0.25rem 0.5rem;
    border: none;
    background: none;
    color: var(--muted-foreground);
    cursor: pointer;
  }

  .preview-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.625rem 1.25rem;
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--muted) 25%, transparent);
    flex-shrink: 0;
  }

  .mode-tabs {
    display: flex;
    gap: 4px;
  }

  .mode-tab {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 6px 14px;
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--muted-foreground);
    cursor: pointer;
  }

  .mode-tab--active {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 14%, var(--background));
    color: var(--foreground);
  }

  .mode-tab-tokens {
    font-size: 0.6875rem;
    font-weight: 400;
    opacity: 0.85;
  }

  .view-toggle {
    display: flex;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }

  .view-toggle-btn {
    font: inherit;
    font-size: 0.75rem;
    padding: 6px 12px;
    border: none;
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
  }

  .view-toggle-btn--active {
    background: var(--muted);
    color: var(--foreground);
    font-weight: 600;
  }

  .preview-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 1rem 1.25rem;
    background: color-mix(in srgb, var(--muted) 12%, var(--background));
  }

  .preview-document {
    padding: 1.25rem 1.5rem;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--background);
    min-height: 100%;
  }

  .preview-document :global(.chat-markdown) {
    font-size: 0.875rem;
    line-height: 1.6;
  }

  .preview-outline {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .outline-section {
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--background);
    overflow: hidden;
  }

  .outline-section--skipped {
    opacity: 0.72;
    border-style: dashed;
  }

  .outline-section--placeholder {
    border-style: dashed;
    background: color-mix(in srgb, var(--muted) 20%, var(--background));
  }

  .outline-section-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0.875rem;
    background: color-mix(in srgb, var(--foreground) 5%, transparent);
    border-bottom: 1px solid var(--border);
  }

  .outline-order {
    flex-shrink: 0;
    width: 1.375rem;
    height: 1.375rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.6875rem;
    font-weight: 700;
    border-radius: 4px;
    background: var(--muted);
    color: var(--muted-foreground);
  }

  .outline-label {
    flex: 1;
    min-width: 0;
    font-size: 0.8125rem;
    font-weight: 600;
  }

  .outline-badges {
    flex-shrink: 0;
  }

  .badge {
    font-size: 0.6875rem;
    font-weight: 500;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .badge--tok {
    background: color-mix(in srgb, var(--primary) 18%, transparent);
    color: var(--foreground);
  }

  .badge--skip {
    background: color-mix(in srgb, var(--muted) 80%, transparent);
    color: var(--muted-foreground);
  }

  .badge--ph {
    background: color-mix(in srgb, var(--muted) 50%, transparent);
    color: var(--muted-foreground);
  }

  .outline-note {
    margin: 0;
    padding: 0.5rem 0.875rem 0;
    font-size: 0.8125rem;
    line-height: 1.45;
    color: var(--muted-foreground);
  }

  .outline-body {
    margin: 0;
    padding: 0.875rem;
    font-size: 0.8125rem;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: none;
    overflow: visible;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    background: transparent;
    border: none;
  }

  .outline-empty {
    margin: 0;
    padding: 0.75rem 0.875rem;
    font-size: 0.8125rem;
    color: var(--muted-foreground);
    font-style: italic;
  }

  .preview-footer {
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: flex-end;
    flex-shrink: 0;
  }

  .btn {
    font: inherit;
    font-size: 0.8125rem;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    cursor: pointer;
    background: var(--background);
    color: var(--foreground);
  }
</style>
