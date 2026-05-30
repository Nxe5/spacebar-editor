<script lang="ts">
  import { systemPrompts } from "$lib/stores/systemPrompts";
  import { files } from "$lib/stores/files";
  import { isTauriAvailable } from "$lib/ipc";
  import { openWorkspaceFile } from "$lib/filesystemSync";
  import {
    ALL_PROMPT_MODES,
    promptModesSummary,
    resolvedPromptModes,
    togglePromptMode,
  } from "$lib/systemPrompts/config";
  import PlusIcon from "phosphor-svelte/lib/PlusIcon";
  import TrashIcon from "phosphor-svelte/lib/TrashIcon";
  import CaretDownIcon from "phosphor-svelte/lib/CaretDownIcon";
  import type { SystemPromptEntry } from "$lib/systemPrompts/types";
  import type { ChatMode } from "$lib/stores/mode";
  import { onMount } from "svelte";

  let {
    variant = "sidebar",
  }: {
    variant?: "sidebar" | "settings";
  } = $props();

  let newPromptName = $state("");
  let creating = $state(false);
  let initializing = $state(false);
  let busyId = $state<string | null>(null);
  let error = $state<string | null>(null);
  let openModesMenuId = $state<string | null>(null);

  const modeLabels: Record<ChatMode, string> = {
    chat: "Chat",
    plan: "Plan",
    agent: "Agent",
  };

  const DEFAULT_PROMPT_IDS = new Set(["chat", "plan", "agent"]);

  let enabledCount = $derived(
    $systemPrompts.entries.filter((e) => e.enabled && resolvedPromptModes(e).length > 0).length
  );

  let activePromptPath = $derived.by(() => {
    const ws = $files.workspacePath;
    const active = $files.activeFilePath;
    if (!ws || !active) return null;
    return $systemPrompts.entries.some(
      (e) => systemPrompts.promptPath(ws, e) === active.replace(/\/+$/, "")
    )
      ? active
      : null;
  });

  function canDelete(entry: SystemPromptEntry): boolean {
    return !DEFAULT_PROMPT_IDS.has(entry.id);
  }

  function entryMissing(entry: SystemPromptEntry): boolean {
    return !$systemPrompts.initialized || !systemPrompts.entryFileExists(entry);
  }

  function modeChecked(entry: SystemPromptEntry, mode: ChatMode): boolean {
    return resolvedPromptModes(entry).includes(mode);
  }

  function closeModesMenu() {
    openModesMenuId = null;
  }

  function toggleModesMenu(entryId: string, e: MouseEvent) {
    e.stopPropagation();
    openModesMenuId = openModesMenuId === entryId ? null : entryId;
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
      if (nextModes.length > 0 && !entry.enabled) {
        await systemPrompts.setEnabled(ws, entry.id, true);
      }
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busyId = null;
    }
  }

  async function openPrompt(entry: SystemPromptEntry) {
    const ws = $files.workspacePath;
    if (!ws) return;
    closeModesMenu();
    error = null;
    if (entryMissing(entry)) {
      await createPromptFiles();
      if (!$systemPrompts.initialized) return;
    }
    await openWorkspaceFile(systemPrompts.promptPath(ws, entry));
  }

  async function createPrompt() {
    const ws = $files.workspacePath;
    if (!ws || creating || !newPromptName.trim()) return;
    if (!$systemPrompts.initialized) {
      await createPromptFiles();
      if (!$systemPrompts.initialized) return;
    }
    creating = true;
    error = null;
    try {
      const entry = await systemPrompts.addPrompt(ws, newPromptName);
      newPromptName = "";
      if (entry) await openPrompt(entry);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      creating = false;
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
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busyId = null;
    }
  }

  function onCreateKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      void createPrompt();
    }
  }

  function onDocumentPointerDown(e: PointerEvent) {
    const target = e.target as HTMLElement | null;
    if (target?.closest(".prompt-modes-menu")) return;
    closeModesMenu();
  }

  $effect(() => {
    if ($files.workspacePath && isTauriAvailable()) {
      void systemPrompts.load($files.workspacePath);
    }
  });

  onMount(() => {
    document.addEventListener("pointerdown", onDocumentPointerDown);
    return () => document.removeEventListener("pointerdown", onDocumentPointerDown);
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
          Default prompt files are listed below. Create them on disk, then enable each prompt and
          choose which modes it applies to.
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

    <ul class="prompt-list" role="list">
      {#each $systemPrompts.entries as entry (entry.id)}
        {@const path = systemPrompts.promptPath($files.workspacePath!, entry)}
        {@const isActive = activePromptPath === path}
        {@const missing = entryMissing(entry)}
        {@const menuOpen = openModesMenuId === entry.id}
        <li
          class="prompt-row"
          class:prompt-row--active={isActive}
          class:prompt-row--missing={missing}
        >
          <button
            type="button"
            class="prompt-main"
            onclick={() => openPrompt(entry)}
            title={missing ? "Create files, then open in editor" : "Open in editor"}
          >
            <span class="prompt-label">{entry.label}</span>
            <span class="prompt-file">{entry.filename}{missing ? " · not created" : ""}</span>
          </button>

          <label
            class="prompt-enable"
            title={missing ? "Create prompt files first" : entry.enabled ? "Disable prompt" : "Enable prompt"}
          >
            <input
              type="checkbox"
              checked={entry.enabled}
              disabled={busyId === entry.id || missing || resolvedPromptModes(entry).length === 0}
              onchange={(e) => toggleEnabled(entry, (e.currentTarget as HTMLInputElement).checked)}
            />
            <span class="sr-only">Enable {entry.label}</span>
          </label>

          <div class="prompt-modes-menu">
            <button
              type="button"
              class="prompt-caret"
              class:prompt-caret--open={menuOpen}
              aria-expanded={menuOpen}
              aria-haspopup="true"
              aria-label="Modes for {entry.label}: {promptModesSummary(entry)}"
              disabled={busyId === entry.id || missing}
              onclick={(e) => toggleModesMenu(entry.id, e)}
            >
              <CaretDownIcon size={14} weight="bold" />
            </button>
            {#if menuOpen}
              <div class="prompt-modes-popover" role="menu">
                <p class="prompt-modes-popover-title">Apply in modes</p>
                {#each ALL_PROMPT_MODES as mode (mode)}
                  <label class="prompt-mode-option">
                    <input
                      type="checkbox"
                      checked={modeChecked(entry, mode)}
                      disabled={busyId === entry.id}
                      onchange={(e) =>
                        toggleMode(entry, mode, (e.currentTarget as HTMLInputElement).checked)}
                    />
                    <span>{modeLabels[mode]}</span>
                  </label>
                {/each}
              </div>
            {/if}
          </div>

          {#if canDelete(entry) && $systemPrompts.initialized}
            <button
              type="button"
              class="prompt-delete"
              title="Remove prompt"
              aria-label="Remove {entry.label}"
              disabled={busyId === entry.id}
              onclick={() => removePrompt(entry)}
            >
              <TrashIcon size={14} />
            </button>
          {/if}
        </li>
      {/each}
    </ul>

    {#if $systemPrompts.initialized}
      <div class="prompt-add">
        <input
          type="text"
          class="prompt-add-input"
          placeholder="New prompt name…"
          bind:value={newPromptName}
          disabled={creating}
          onkeydown={onCreateKeydown}
        />
        <button
          type="button"
          class="prompt-add-btn"
          title="Add prompt file"
          aria-label="Add prompt file"
          disabled={creating || !newPromptName.trim()}
          onclick={createPrompt}
        >
          <PlusIcon size={16} />
        </button>
      </div>
    {/if}
  {/if}

  <div class="prompt-footer">
    <span class="prompt-hint">
      {#if $files.workspacePath && isTauriAvailable()}
        {enabledCount} enabled · click title to edit in the editor
      {:else}
        Enabled prompts append to the mode base prompt
      {/if}
    </span>
  </div>
</div>

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

  .prompt-list {
    list-style: none;
    margin: 0;
    padding: 0 8px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .prompt-manager--settings .prompt-list {
    padding: 0;
    flex: none;
    overflow: visible;
  }

  .prompt-row {
    display: flex;
    align-items: center;
    gap: 6px;
    border-radius: 6px;
    min-height: 48px;
    padding: 2px 2px 2px 0;
  }

  .prompt-row--active {
    background: color-mix(in srgb, var(--primary) 12%, transparent);
  }

  .prompt-row--missing {
    opacity: 0.82;
  }

  .prompt-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 6px 8px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--foreground);
    text-align: left;
    cursor: pointer;
  }

  .prompt-main:hover {
    background: var(--muted);
  }

  .prompt-label {
    font-size: 12px;
    font-weight: 600;
    line-height: 1.25;
    color: var(--foreground);
  }

  .prompt-file {
    font-size: 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: var(--muted-foreground);
    line-height: 1.3;
  }

  .prompt-enable {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    padding: 0 2px;
    cursor: pointer;
  }

  .prompt-enable input {
    margin: 0;
    cursor: pointer;
  }

  .prompt-enable input:disabled {
    cursor: not-allowed;
  }

  .prompt-modes-menu {
    position: relative;
    flex-shrink: 0;
  }

  .prompt-caret {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
  }

  .prompt-caret:hover:not(:disabled) {
    background: var(--muted);
    color: var(--foreground);
  }

  .prompt-caret--open {
    background: var(--muted);
    color: var(--foreground);
  }

  .prompt-caret--open :global(svg) {
    transform: rotate(180deg);
  }

  .prompt-caret:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .prompt-modes-popover {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 20;
    min-width: 148px;
    padding: 6px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--popover, var(--background));
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.22);
  }

  .prompt-modes-popover-title {
    margin: 0 0 4px;
    padding: 2px 6px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted-foreground);
  }

  .prompt-mode-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 6px;
    border-radius: 4px;
    font-size: 12px;
    color: var(--foreground);
    cursor: pointer;
  }

  .prompt-mode-option:hover {
    background: var(--muted);
  }

  .prompt-mode-option input {
    margin: 0;
    cursor: pointer;
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

  .prompt-delete {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
    opacity: 0;
  }

  .prompt-row:hover .prompt-delete,
  .prompt-row:focus-within .prompt-delete {
    opacity: 1;
  }

  .prompt-delete:hover:not(:disabled) {
    background: rgba(244, 135, 113, 0.15);
    color: #f48771;
  }

  .prompt-delete:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .prompt-add {
    display: flex;
    gap: 6px;
    padding: 8px 12px 4px;
    flex-shrink: 0;
  }

  .prompt-manager--settings .prompt-add {
    padding: 8px 0 4px;
  }

  .prompt-add-input {
    flex: 1;
    min-width: 0;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--foreground);
    font-size: 12px;
  }

  .prompt-add-input:focus {
    outline: none;
    border-color: var(--ring);
  }

  .prompt-add-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: var(--primary);
    color: var(--primary-foreground);
    cursor: pointer;
    flex-shrink: 0;
  }

  .prompt-add-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .prompt-footer {
    display: flex;
    align-items: center;
    padding: 8px 12px 12px;
    flex-shrink: 0;
  }

  .prompt-manager--settings .prompt-footer {
    padding: 8px 0 0;
  }

  .prompt-hint {
    font-size: 10px;
    color: var(--muted-foreground);
  }
</style>
