<script lang="ts">
  import { bottomTerminals } from "$lib/stores/bottomTerminals";
  import TerminalPane from "../terminal/TerminalPane.svelte";
  import AgentTerminalOutput from "../terminal/AgentTerminalOutput.svelte";
  import { isTauriAvailable } from "$lib/ipc";
  import Plus from "@lucide/svelte/icons/plus";
  import X from "@lucide/svelte/icons/x";
  import TerminalIcon from "@lucide/svelte/icons/terminal";
  import Bot from "@lucide/svelte/icons/bot";

  interface Props {
    /** When false, dock is hidden but PTY sessions stay alive. */
    open: boolean;
  }

  let { open }: Props = $props();

  type DockPanelId = "terminal" | "debug" | "serial";

  let activePanel = $state<DockPanelId>("terminal");
  let terminalError = $state<string | null>(null);
  let addingTerminal = $state(false);

  const panelTabs: { id: DockPanelId; label: string }[] = [
    { id: "terminal", label: "Terminal" },
    { id: "debug", label: "Debug Console" },
    { id: "serial", label: "Serial" },
  ];

  let activeTerminal = $derived(
    $bottomTerminals.tabs.find((t) => t.id === $bottomTerminals.activeTabId) ?? null
  );

  async function ensureDefaultTerminal() {
    if (!open || activePanel !== "terminal") return;
    if (!isTauriAvailable()) return;
    if ($bottomTerminals.tabs.length > 0) return;
    await addTerminal();
  }

  $effect(() => {
    if (open && activePanel === "terminal") {
      void ensureDefaultTerminal();
    }
  });

  async function addTerminal() {
    if (!isTauriAvailable() || addingTerminal) return;
    addingTerminal = true;
    terminalError = null;
    try {
      await bottomTerminals.createTab({ source: "user" });
    } catch (e) {
      terminalError = String(e);
    } finally {
      addingTerminal = false;
    }
  }

  function closeTerminalTab(tabId: string, e: MouseEvent) {
    e.stopPropagation();
    bottomTerminals.closeTab(tabId);
  }
</script>

<div class="dock-root flex h-full min-h-0 flex-col">
  <div class="dock-header">
    <div class="dock-tablist" role="tablist" aria-label="Bottom panel">
      {#each panelTabs as t (t.id)}
        <div class="dock-tab-wrap" class:dock-tab-wrap--active={activePanel === t.id}>
          <button
            type="button"
            role="tab"
            class="dock-tab-main"
            aria-selected={activePanel === t.id}
            tabindex={activePanel === t.id ? 0 : -1}
            title={t.label}
            onclick={() => (activePanel = t.id)}
          >
            {t.label}
          </button>
        </div>
      {/each}

      {#if activePanel === "terminal" && isTauriAvailable()}
        <button
          type="button"
          class="terminal-add-btn"
          title="New terminal"
          aria-label="New terminal"
          disabled={addingTerminal}
          onclick={() => void addTerminal()}
        >
          <Plus size={14} aria-hidden="true" />
        </button>
      {/if}
    </div>
  </div>

  <div class="dock-body">
    <div class="relative min-h-0 min-w-0 flex-1 overflow-hidden">
      {#if activePanel === "terminal"}
        {#if !isTauriAvailable()}
          <div class="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
            Integrated terminal needs the desktop app. Run
            <code class="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">pnpm tauri dev</code>
            instead of <code class="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono">pnpm dev</code>.
          </div>
        {:else if terminalError}
          <div class="flex h-full items-center justify-center p-4 text-center text-sm text-destructive">
            {terminalError}
          </div>
        {:else if !activeTerminal}
          <div class="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <span>No terminal open.</span>
            <button type="button" class="dock-link-btn" onclick={() => void addTerminal()}>New terminal</button>
          </div>
        {:else if activeTerminal.output != null}
          {#key activeTerminal.id}
            <div class="absolute inset-0 flex min-h-0 flex-col">
              <AgentTerminalOutput output={activeTerminal.output} />
            </div>
          {/key}
        {:else}
          {#key activeTerminal.sessionId}
            <div class="absolute inset-0 flex min-h-0 flex-col">
              <TerminalPane
                sessionId={activeTerminal.sessionId}
                onExit={() => bottomTerminals.closeTab(activeTerminal.id)}
              />
            </div>
          {/key}
        {/if}
      {:else if activePanel === "debug"}
        <div class="h-full overflow-auto p-3 font-mono text-xs text-muted-foreground">
          <p class="mb-2 text-foreground">Debug Console</p>
          <p>Harness logs, extension output, and DAP messages will show here.</p>
          <p class="mt-2 opacity-70">Not wired yet.</p>
        </div>
      {:else}
        <div class="h-full overflow-auto p-3 text-sm text-muted-foreground">
          <p class="mb-2 font-medium text-foreground">Serial monitor</p>
          <p class="mb-4">For ESP32 and similar boards: pick COM/tty port and baud (e.g. 115200), then stream RX/TX here.</p>
          <div class="flex flex-wrap items-center gap-2 opacity-60">
            <label class="flex items-center gap-1 text-xs">
              <span>Port</span>
              <select class="rounded border border-border bg-muted px-2 py-1 text-foreground" disabled>
                <option>(not connected)</option>
              </select>
            </label>
            <label class="flex items-center gap-1 text-xs">
              <span>Baud</span>
              <select class="rounded border border-border bg-muted px-2 py-1 text-foreground" disabled>
                <option>115200</option>
              </select>
            </label>
            <button type="button" class="rounded border border-border bg-muted px-2 py-1 text-xs" disabled>Connect</button>
          </div>
          <p class="mt-4 text-xs opacity-70">Stub — serial backend not implemented.</p>
        </div>
      {/if}
    </div>

    {#if activePanel === "terminal" && isTauriAvailable() && $bottomTerminals.tabs.length > 0}
      <div class="terminal-sessions" role="tablist" aria-label="Terminal sessions" aria-orientation="vertical">
        {#each $bottomTerminals.tabs as tab (tab.id)}
          <div
            class="terminal-session"
            class:terminal-session--active={$bottomTerminals.activeTabId === tab.id}
            class:terminal-session--agent={tab.source === "agent"}
          >
            <button
              type="button"
              role="tab"
              class="terminal-session__main"
              aria-selected={$bottomTerminals.activeTabId === tab.id}
              title={tab.title}
              onclick={() => bottomTerminals.setActiveTab(tab.id)}
            >
              {#if tab.source === "agent"}
                <Bot size={13} aria-hidden="true" class="terminal-session__icon" />
              {:else}
                <TerminalIcon size={13} aria-hidden="true" class="terminal-session__icon" />
              {/if}
              <span class="terminal-session__title">{tab.title}</span>
            </button>
            <button
              type="button"
              class="terminal-session__close"
              aria-label="Close terminal"
              title="Close"
              onclick={(e) => closeTerminalTab(tab.id, e)}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .dock-root {
    border: none;
    background: var(--chat-panel-bg, var(--background));
  }

  .dock-header {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .dock-body {
    display: flex;
    flex-direction: row;
    min-height: 0;
    flex: 1;
    overflow: hidden;
  }

  .dock-tablist {
    display: flex;
    height: var(--workbench-row-header-height, 26px);
    flex-shrink: 0;
    align-items: center;
    gap: 4px;
    padding: 2px 6px 3px;
    background: transparent;
    box-sizing: border-box;
  }

  .dock-tab-wrap {
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    flex: 0 0 auto;
    min-width: 0;
    flex-shrink: 0;
    border-radius: 4px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--muted-foreground);
    box-sizing: border-box;
  }

  .dock-tab-wrap--active {
    background: var(--muted);
    color: var(--foreground);
  }

  .dock-tab-wrap:hover:not(.dock-tab-wrap--active) {
    background: color-mix(in srgb, var(--muted) 60%, transparent);
  }

  .dock-tab-main {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: center;
    padding: 2px 10px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font-size: 11px;
    line-height: 1.2;
    font-weight: 500;
    cursor: pointer;
    text-align: center;
    white-space: nowrap;
  }

  /* VS Code-style sessions list to the right of the terminal viewport. */
  .terminal-sessions {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 0 0 auto;
    width: 168px;
    min-width: 120px;
    padding: 4px;
    overflow-y: auto;
    border-left: 1px solid color-mix(in srgb, var(--border) 45%, transparent);
    box-sizing: border-box;
  }

  .terminal-session {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    border-radius: 4px;
    color: var(--muted-foreground);
  }

  .terminal-session--active {
    background: var(--muted);
    color: var(--foreground);
  }

  .terminal-session:hover:not(.terminal-session--active) {
    background: color-mix(in srgb, var(--muted) 60%, transparent);
  }

  .terminal-session--agent :global(.terminal-session__icon) {
    color: var(--primary);
  }

  .terminal-session__main {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
    padding: 3px 6px;
    border: none;
    background: transparent;
    color: inherit;
    font-size: 11px;
    line-height: 1.2;
    cursor: pointer;
    text-align: left;
  }

  .terminal-session__main :global(.terminal-session__icon) {
    flex-shrink: 0;
  }

  .terminal-session__title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .terminal-session__close {
    display: none;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    margin-right: 3px;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: inherit;
    opacity: 0.65;
    cursor: pointer;
    flex-shrink: 0;
  }

  .terminal-session:hover .terminal-session__close,
  .terminal-session__close:focus-visible {
    display: flex;
  }

  .terminal-session__close:hover {
    opacity: 1;
    background: color-mix(in srgb, var(--foreground) 10%, transparent);
  }

  .terminal-add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
  }

  .terminal-add-btn:hover:not(:disabled) {
    background: var(--muted);
    color: var(--foreground);
  }

  .terminal-add-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .dock-tab-main:focus-visible,
  .terminal-add-btn:focus-visible,
  .terminal-session__main:focus-visible,
  .terminal-session__close:focus-visible {
    outline: 1px solid var(--ring);
    outline-offset: 1px;
  }

  .dock-link-btn {
    border: none;
    background: none;
    color: var(--primary);
    font-size: inherit;
    cursor: pointer;
    text-decoration: underline;
  }
</style>
