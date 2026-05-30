<script lang="ts">
  import { systemPrompts } from "$lib/stores/systemPrompts";
  import { files } from "$lib/stores/files";
  import { isTauriAvailable } from "$lib/ipc";
  import {
    ALL_PROMPT_MODES,
    isBuiltinPromptEntry,
    resolvedPromptModes,
    togglePromptMode,
  } from "$lib/systemPrompts/config";
  import TrashIcon from "phosphor-svelte/lib/TrashIcon";
  import GearIcon from "phosphor-svelte/lib/GearIcon";
  import type { SystemPromptEntry } from "$lib/systemPrompts/types";
  import type { ChatMode } from "$lib/stores/mode";
  import { onMount } from "svelte";

  let {
    variant = "sidebar",
  }: {
    variant?: "sidebar" | "settings";
  } = $props();

  let initializing = $state(false);
  let createOpen = $state(false);
  let createTitle = $state("");
  let createContent = $state("");
  let createSaving = $state(false);
  let busyId = $state<string | null>(null);
  let error = $state<string | null>(null);

  let editorEntry = $state<SystemPromptEntry | null>(null);
  let editorDraft = $state("");
  let editorSaving = $state(false);

  const modeLabels: Record<ChatMode, string> = {
    chat: "Chat",
    plan: "Plan",
    agent: "Agent",
  };

  const BUILTIN_ORDER: ChatMode[] = ["chat", "plan", "agent"];

  let sortedEntries = $derived.by(() => {
    const entries = $systemPrompts.entries;
    return [...entries].sort((a, b) => {
      const ai = BUILTIN_ORDER.indexOf(a.id as ChatMode);
      const bi = BUILTIN_ORDER.indexOf(b.id as ChatMode);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.label.localeCompare(b.label);
    });
  });

  let enabledCount = $derived(
    $systemPrompts.entries.filter(
      (e) => e.enabled && resolvedPromptModes(e).length > 0
    ).length
  );

  function modeChecked(entry: SystemPromptEntry, mode: ChatMode): boolean {
    return resolvedPromptModes(entry).includes(mode);
  }

  function promptContent(entry: SystemPromptEntry): string {
    return $systemPrompts.contents[entry.filename] ?? "";
  }

  function entryMissing(entry: SystemPromptEntry): boolean {
    return !$systemPrompts.initialized || !systemPrompts.entryFileExists(entry);
  }

  function openEditor(entry: SystemPromptEntry) {
    editorEntry = entry;
    editorDraft = promptContent(entry);
    error = null;
  }

  function closeEditor() {
    editorEntry = null;
    editorDraft = "";
  }

  async function ensureInitialized(): Promise<boolean> {
    const ws = $files.workspacePath;
    if (!ws || $systemPrompts.initialized) return Boolean($systemPrompts.initialized);
    await createPromptFiles();
    return $systemPrompts.initialized;
  }

  async function createPromptFiles() {
    const ws = $files.workspacePath;
    if (!ws || initializing) return;
    initializing = true;
    error = null;
    try {
      await systemPrompts.initialize(ws);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      initializing = false;
    }
  }

  async function toggleEnabled(entry: SystemPromptEntry, enabled: boolean) {
    const ws = $files.workspacePath;
    if (!ws || busyId || entryMissing(entry)) return;
    busyId = entry.id;
    error = null;
    try {
      await systemPrompts.setEnabled(ws, entry.id, enabled);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busyId = null;
    }
  }

  async function toggleMode(entry: SystemPromptEntry, mode: ChatMode, on: boolean) {
    const ws = $files.workspacePath;
    if (!ws || busyId || entryMissing(entry)) return;
    const nextModes = togglePromptMode(entry, mode, on);
    busyId = entry.id;
    error = null;
    try {
      await systemPrompts.setModes(ws, entry.id, nextModes);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busyId = null;
    }
  }

  async function openEditorForEntry(entry: SystemPromptEntry) {
    if (!(await ensureInitialized())) return;
    if (entryMissing(entry)) return;
    openEditor(entry);
  }

  async function saveEditor() {
    const ws = $files.workspacePath;
    const entry = editorEntry;
    if (!ws || !entry || editorSaving) return;
    editorSaving = true;
    error = null;
    try {
      await systemPrompts.saveContent(ws, entry.id, editorDraft);
      closeEditor();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      editorSaving = false;
    }
  }

  async function resetEditor() {
    const ws = $files.workspacePath;
    const entry = editorEntry;
    if (!ws || !entry || editorSaving) return;
    editorSaving = true;
    error = null;
    try {
      await systemPrompts.resetToDefault(ws, entry.id);
      editorDraft = $systemPrompts.contents[entry.filename] ?? "";
    } catch (e) {
      error = (e as Error).message;
    } finally {
      editorSaving = false;
    }
  }

  function openCreateModal() {
    createTitle = "";
    createContent = "";
    createOpen = true;
    error = null;
  }

  function closeCreateModal() {
    createOpen = false;
    createTitle = "";
    createContent = "";
  }

  async function openCreateModalFromButton() {
    if (!(await ensureInitialized())) return;
    openCreateModal();
  }

  async function saveCreateModal() {
    const ws = $files.workspacePath;
    const title = createTitle.trim();
    if (!ws || createSaving || !title) return;
    createSaving = true;
    error = null;
    try {
      await systemPrompts.addPrompt(ws, title, createContent);
      closeCreateModal();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      createSaving = false;
    }
  }

  async function removePrompt(entry: SystemPromptEntry) {
    const ws = $files.workspacePath;
    if (!ws || busyId) return;
    if (!confirm(`Remove "${entry.label}" and delete ${entry.filename}?`)) return;
    busyId = entry.id;
    error = null;
    try {
      await systemPrompts.removePrompt(ws, entry.id);
      if (editorEntry?.id === entry.id) closeEditor();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busyId = null;
    }
  }

  function onEditorKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeEditor();
    }
  }

  $effect(() => {
    if ($files.workspacePath && isTauriAvailable()) {
      void systemPrompts.load($files.workspacePath);
    }
  });

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (createOpen) closeCreateModal();
      else if (editorEntry) closeEditor();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
</script>

<div class="prompt-manager" class:prompt-manager--settings={variant === "settings"}>
  {#if variant === "sidebar"}
    <div class="prompt-header">
      <div class="prompt-title">
        <h3>System Prompts</h3>
        <span class="prompt-path">.tinyllama/prompts/</span>
      </div>
    </div>
  {/if}

  {#if error}
    <div class="prompt-error" role="alert">{error}</div>
  {/if}

  {#if !$files.workspacePath}
    <p class="prompt-empty">Open a project folder to manage prompts.</p>
  {:else if !isTauriAvailable()}
    <p class="prompt-empty">System prompt files are available in the desktop app.</p>
  {:else}
    {#if !$systemPrompts.initialized}
      <div class="prompt-setup">
        <p class="prompt-setup-text">
          Create prompt files on disk, then enable each prompt, choose modes, and edit with the gear
          icon.
        </p>
        <button
          type="button"
          class="prompt-setup-btn"
          disabled={initializing}
          onclick={createPromptFiles}
        >
          {initializing ? "Creating…" : "Create prompt files"}
        </button>
      </div>
    {/if}

    <section class="prompt-section">
      <p class="prompt-section-hint">
        Enabled prompts append to the system message. Mode checkboxes control where each file
        applies. Use the gear to edit <code>.md</code> content.
      </p>

      <div class="prompt-table-wrap">
        <table class="prompt-table">
          <colgroup>
            <col class="w-enable" />
            <col class="w-name" />
            <col class="w-mode" />
            <col class="w-mode" />
            <col class="w-mode" />
            <col class="w-actions" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" class="cell-enable">Enable</th>
              <th scope="col" class="cell-name">Prompt</th>
              {#each ALL_PROMPT_MODES as mode (mode)}
                <th scope="col" class="cell-mode">{modeLabels[mode]}</th>
              {/each}
              <th scope="col" class="cell-actions">Edit</th>
            </tr>
          </thead>
          <tbody>
            {#each sortedEntries as entry (entry.id)}
              {@const missing = entryMissing(entry)}
              <tr class:prompt-row--missing={missing}>
                <td class="cell-enable">
                  <label
                    class="prompt-enable-label"
                    title={missing ? "Create prompt files first" : entry.enabled ? "Disable prompt" : "Enable prompt"}
                  >
                    <input
                      type="checkbox"
                      checked={entry.enabled}
                      disabled={busyId === entry.id || missing}
                      onchange={(e) =>
                        toggleEnabled(entry, (e.currentTarget as HTMLInputElement).checked)}
                    />
                  </label>
                </td>
                <td class="cell-name">
                  <span class="prompt-row-label">{entry.label}</span>
                  <span class="prompt-row-file">{entry.filename}{missing ? " · not created" : ""}</span>
                </td>
                {#each ALL_PROMPT_MODES as mode (mode)}
                  <td class="cell-mode">
                    <label class="prompt-mode-check" title="Use in {modeLabels[mode]} mode">
                      <input
                        type="checkbox"
                        checked={modeChecked(entry, mode)}
                        disabled={busyId === entry.id || missing}
                        onchange={(e) =>
                          toggleMode(entry, mode, (e.currentTarget as HTMLInputElement).checked)}
                      />
                    </label>
                  </td>
                {/each}
                <td class="cell-actions">
                  <div class="prompt-actions-inner">
                    <button
                      type="button"
                      class="prompt-gear-btn"
                      title="Edit {entry.filename}"
                      aria-label="Edit {entry.label}"
                      disabled={missing || busyId === entry.id}
                      onclick={() => openEditorForEntry(entry)}
                    >
                      <GearIcon size={16} aria-hidden="true" />
                    </button>
                    {#if !isBuiltinPromptEntry(entry) && $systemPrompts.initialized}
                      <button
                        type="button"
                        class="prompt-gear-btn prompt-gear-btn--danger"
                        title="Remove"
                        aria-label="Remove {entry.label}"
                        disabled={busyId === entry.id}
                        onclick={() => removePrompt(entry)}
                      >
                        <TrashIcon size={14} />
                      </button>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="prompt-section-bar">
        <span class="prompt-hint">
          {#if $systemPrompts.initialized}
            {enabledCount} enabled · stored in <code>.tinyllama/prompts/</code>
          {:else}
            Create prompt files to add custom instructions.
          {/if}
        </span>
        {#if $files.workspacePath && isTauriAvailable()}
          <button
            type="button"
            class="prompt-add-trigger"
            disabled={createSaving}
            onclick={() => openCreateModalFromButton()}
          >
            Add system prompt
          </button>
        {/if}
      </div>
    </section>
  {/if}
</div>

{#if createOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="prompt-editor-backdrop" role="presentation" onclick={closeCreateModal}>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
      class="prompt-editor-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-create-title"
      onclick={(e) => e.stopPropagation()}
      onkeydown={onEditorKeydown}
    >
      <header class="prompt-editor-header">
        <h3 id="prompt-create-title">Add system prompt</h3>
        <button type="button" class="prompt-editor-close" onclick={closeCreateModal} aria-label="Close">
          ×
        </button>
      </header>
      <div class="prompt-create-fields">
        <label class="prompt-create-field">
          <span class="prompt-create-label">Title</span>
          <input
            type="text"
            class="prompt-create-input"
            bind:value={createTitle}
            placeholder="e.g. TypeScript conventions"
            disabled={createSaving}
          />
        </label>
        <label class="prompt-create-field">
          <span class="prompt-create-label">Content</span>
          <textarea
            class="prompt-editor-textarea prompt-create-textarea"
            bind:value={createContent}
            rows="12"
            spellcheck="true"
            placeholder="Instructions appended to the system prompt when enabled…"
            disabled={createSaving}
          ></textarea>
        </label>
      </div>
      <footer class="prompt-editor-footer prompt-editor-footer--end">
        <button
          type="button"
          class="prompt-editor-btn prompt-editor-btn--ghost"
          disabled={createSaving}
          onclick={closeCreateModal}
        >
          Cancel
        </button>
        <button
          type="button"
          class="prompt-editor-btn prompt-editor-btn--primary"
          disabled={createSaving || !createTitle.trim()}
          onclick={saveCreateModal}
        >
          {createSaving ? "Saving…" : "Save"}
        </button>
      </footer>
    </div>
  </div>
{/if}

{#if editorEntry}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="prompt-editor-backdrop" role="presentation" onclick={closeEditor}>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
      class="prompt-editor-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-editor-title"
      onclick={(e) => e.stopPropagation()}
      onkeydown={onEditorKeydown}
    >
      <header class="prompt-editor-header">
        <h3 id="prompt-editor-title">Edit {editorEntry.label} prompt</h3>
        <button type="button" class="prompt-editor-close" onclick={closeEditor} aria-label="Close">
          ×
        </button>
      </header>
      <p class="prompt-editor-file">
        <code>{editorEntry.filename}</code>
      </p>
      <textarea
        class="prompt-editor-textarea"
        bind:value={editorDraft}
        rows="14"
        spellcheck="true"
        aria-label="Prompt content"
      ></textarea>
      <footer class="prompt-editor-footer">
        <button
          type="button"
          class="prompt-editor-btn prompt-editor-btn--ghost"
          disabled={editorSaving}
          onclick={resetEditor}
        >
          Reset to default
        </button>
        <div class="prompt-editor-actions">
          <button
            type="button"
            class="prompt-editor-btn prompt-editor-btn--ghost"
            disabled={editorSaving}
            onclick={closeEditor}
          >
            Cancel
          </button>
          <button
            type="button"
            class="prompt-editor-btn prompt-editor-btn--primary"
            disabled={editorSaving}
            onclick={saveEditor}
          >
            {editorSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </footer>
    </div>
  </div>
{/if}

<style>
  .prompt-manager {
    display: flex;
    flex-direction: column;
    flex: 1;
    height: 100%;
    min-height: 0;
    background-color: var(--explorer-panel-bg, var(--workbench-panel-bg, var(--sidebar)));
  }

  .prompt-manager--settings {
    flex: none;
    height: auto;
    min-height: 0;
    background: transparent;
  }

  .prompt-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    padding: 12px 12px 8px;
    flex-shrink: 0;
  }

  .prompt-title {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .prompt-title h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--foreground);
  }

  .prompt-path {
    font-size: 10px;
    color: var(--muted-foreground);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }

  .prompt-setup {
    margin: 0 12px 10px;
    padding: 10px 12px;
    border-radius: 6px;
    border: 1px dashed var(--border);
    background: color-mix(in srgb, var(--muted) 40%, transparent);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .prompt-manager--settings .prompt-setup {
    margin: 0 0 12px;
  }

  .prompt-setup-text {
    margin: 0;
    font-size: 11px;
    color: var(--muted-foreground);
    line-height: 1.45;
  }

  .prompt-setup-btn {
    align-self: flex-start;
    font-size: 12px;
    padding: 6px 12px;
    border: none;
    border-radius: 6px;
    background: var(--primary);
    color: var(--primary-foreground);
    cursor: pointer;
  }

  .prompt-setup-btn:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  .prompt-setup-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .prompt-error {
    margin: 0 12px 8px;
    padding: 8px 10px;
    font-size: 11px;
    color: #f48771;
    background: rgba(244, 135, 113, 0.1);
    border-radius: 4px;
    border: 1px solid rgba(244, 135, 113, 0.3);
  }

  .prompt-manager--settings .prompt-error {
    margin: 0 0 8px;
  }

  .prompt-empty {
    margin: 0;
    padding: 8px 12px;
    font-size: 11px;
    color: var(--muted-foreground);
  }

  .prompt-manager--settings .prompt-empty {
    padding: 0;
  }

  .prompt-section {
    margin-bottom: 16px;
  }

  .prompt-manager--settings .prompt-section {
    margin-bottom: 20px;
  }

  .prompt-section-title {
    margin: 0 0 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted-foreground);
  }

  .prompt-section-hint {
    margin: 0 0 10px;
    font-size: 11px;
    color: var(--muted-foreground);
    line-height: 1.45;
  }

  .prompt-section-hint code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.95em;
  }

  .prompt-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--background);
  }

  .prompt-table {
    width: 100%;
    border-collapse: collapse;
    border-spacing: 0;
  }

  .prompt-table .w-enable {
    width: 3.5rem;
  }

  .prompt-table .w-mode {
    width: 3.5rem;
  }

  .prompt-table .w-actions {
    width: 5.5rem;
  }

  .prompt-table .w-name {
    width: 100%;
  }

  .prompt-table thead th {
    padding: 8px 10px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted-foreground);
    text-align: left;
    vertical-align: middle;
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--muted) 35%, transparent);
  }

  .prompt-table thead th.cell-enable,
  .prompt-table thead th.cell-mode,
  .prompt-table thead th.cell-actions {
    text-align: center;
  }

  .prompt-table tbody td {
    padding: 8px 10px;
    vertical-align: middle;
    border-bottom: 1px solid var(--border);
  }

  .prompt-table tbody td.cell-enable,
  .prompt-table tbody td.cell-mode,
  .prompt-table tbody td.cell-actions {
    text-align: center;
  }

  .prompt-table tbody td.cell-name {
    text-align: left;
  }

  .prompt-table tbody tr:last-child td {
    border-bottom: none;
  }

  .prompt-table tbody tr:hover td {
    background: color-mix(in srgb, var(--muted) 22%, transparent);
  }

  .prompt-row--missing {
    opacity: 0.75;
  }

  .prompt-enable-label,
  .prompt-mode-check {
    cursor: pointer;
  }

  .prompt-enable-label input,
  .prompt-mode-check input {
    margin: 0;
    vertical-align: middle;
    cursor: pointer;
  }

  .prompt-actions-inner {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    vertical-align: middle;
  }

  .prompt-row-label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: var(--foreground);
  }

  .prompt-row-file {
    display: block;
    margin-top: 2px;
    font-size: 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: var(--muted-foreground);
    word-break: break-all;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }

  .prompt-gear-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
  }

  .prompt-gear-btn:hover:not(:disabled) {
    background: var(--muted);
    color: var(--foreground);
  }

  .prompt-gear-btn--danger:hover:not(:disabled) {
    background: rgba(244, 135, 113, 0.15);
    color: #f48771;
  }

  .prompt-gear-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .prompt-section-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 12px;
    flex-wrap: wrap;
  }

  .prompt-hint {
    font-size: 10px;
    color: var(--muted-foreground);
    line-height: 1.4;
  }

  .prompt-hint code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.95em;
  }

  .prompt-add-trigger {
    margin-left: auto;
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    padding: 8px 14px;
    border: none;
    border-radius: 6px;
    background: var(--primary);
    color: var(--primary-foreground);
    cursor: pointer;
    flex-shrink: 0;
  }

  .prompt-add-trigger:hover:not(:disabled) {
    filter: brightness(1.06);
  }

  .prompt-add-trigger:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .prompt-create-fields {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 0 16px 4px;
  }

  .prompt-create-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .prompt-create-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .prompt-create-input {
    font: inherit;
    font-size: 13px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--foreground);
  }

  .prompt-create-input:focus {
    outline: none;
    border-color: var(--ring);
  }

  .prompt-create-textarea {
    margin: 0;
    min-height: 180px;
  }

  .prompt-editor-footer--end {
    justify-content: flex-end;
  }

  .prompt-editor-footer--end .prompt-editor-actions {
    display: flex;
    gap: 8px;
  }

  .prompt-editor-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(0, 0, 0, 0.55);
  }

  .prompt-editor-modal {
    width: min(560px, 100%);
    max-height: min(85vh, 720px);
    display: flex;
    flex-direction: column;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--background);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
  }

  .prompt-editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 0;
  }

  .prompt-editor-header h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }

  .prompt-editor-close {
    font-size: 1.25rem;
    line-height: 1;
    padding: 4px 8px;
    border: none;
    background: none;
    color: var(--muted-foreground);
    cursor: pointer;
  }

  .prompt-editor-file {
    margin: 4px 16px 0;
    font-size: 11px;
    color: var(--muted-foreground);
  }

  .prompt-editor-file code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }

  .prompt-editor-textarea {
    margin: 12px 16px;
    flex: 1;
    min-height: 200px;
    padding: 10px 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.5;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--foreground);
    resize: vertical;
  }

  .prompt-editor-textarea:focus {
    outline: none;
    border-color: var(--ring);
  }

  .prompt-editor-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 16px 14px;
    flex-wrap: wrap;
  }

  .prompt-editor-actions {
    display: flex;
    gap: 8px;
  }

  .prompt-editor-btn {
    font: inherit;
    font-size: 12px;
    padding: 7px 14px;
    border-radius: 6px;
    border: 1px solid var(--border);
    cursor: pointer;
    background: var(--background);
    color: var(--foreground);
  }

  .prompt-editor-btn--ghost:hover:not(:disabled) {
    background: var(--muted);
  }

  .prompt-editor-btn--primary {
    border-color: transparent;
    background: var(--primary);
    color: var(--primary-foreground);
  }

  .prompt-editor-btn--primary:hover:not(:disabled) {
    filter: brightness(1.06);
  }

  .prompt-editor-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
</style>
