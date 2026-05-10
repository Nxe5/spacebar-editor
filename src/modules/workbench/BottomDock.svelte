<script lang="ts">
  import { onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { files } from "$lib/stores/files";
  import TerminalPane from "../terminal/TerminalPane.svelte";
  import { isTauriAvailable, ptyCreate, ptyClose } from "$lib/ipc";

  interface Props {
    /** When false, dock is hidden and PTY is released */
    open: boolean;
  }

  let { open }: Props = $props();

  type DockTabId = "terminal" | "debug" | "serial";

  let activeTab = $state<DockTabId>("terminal");
  let dockSessionId = $state<string | null>(null);
  let terminalError = $state<string | null>(null);
  let starting = $state(false);

  function releasePty() {
    if (dockSessionId) {
      void ptyClose(dockSessionId);
      dockSessionId = null;
    }
    terminalError = null;
    starting = false;
  }

  $effect(() => {
    if (!open) {
      releasePty();
      return;
    }
    if (activeTab !== "terminal") return;
    if (!isTauriAvailable()) {
      terminalError = null;
      return;
    }
    if (dockSessionId || starting) return;

    starting = true;
    terminalError = null;
    void (async () => {
      try {
        const cwd = get(files).workspacePath ?? undefined;
        const id = await ptyCreate(cwd ?? null);
        dockSessionId = id;
      } catch (e) {
        terminalError = String(e);
      } finally {
        starting = false;
      }
    })();
  });

  onDestroy(() => {
    releasePty();
  });

  const tabs: { id: DockTabId; label: string }[] = [
    { id: "terminal", label: "Terminal" },
    { id: "debug", label: "Debug Console" },
    { id: "serial", label: "Serial" },
  ];
</script>

<div class="dock-root flex h-full min-h-0 flex-col bg-background">
  <div class="dock-tablist" role="tablist" aria-label="Bottom panel">
    {#each tabs as t (t.id)}
      <div class="dock-tab-wrap" class:dock-tab-wrap--active={activeTab === t.id}>
        <button
          type="button"
          role="tab"
          class="dock-tab-main"
          aria-selected={activeTab === t.id}
          tabindex={activeTab === t.id ? 0 : -1}
          title={t.label}
          onclick={() => (activeTab = t.id)}
        >
          {t.label}
        </button>
      </div>
    {/each}
  </div>

  <div class="relative min-h-0 flex-1 overflow-hidden">
    {#if activeTab === "terminal"}
      {#if !isTauriAvailable()}
        <div class="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
          Integrated terminal needs the desktop app. Run
          <code class="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">npm run tauri dev</code>
          instead of <code class="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono">npm run dev</code>.
        </div>
      {:else if terminalError}
        <div class="flex h-full items-center justify-center p-4 text-center text-sm text-destructive">
          {terminalError}
        </div>
      {:else if starting || !dockSessionId}
        <div class="flex h-full items-center justify-center text-sm text-muted-foreground">Starting terminal…</div>
      {:else}
        {#key dockSessionId}
          <div class="absolute inset-0 flex min-h-0 flex-col">
            <TerminalPane sessionId={dockSessionId} />
          </div>
        {/key}
      {/if}
    {:else if activeTab === "debug"}
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
</div>

<style>
  /**
   * Top edge uses the same tone as the right activity strip (`sidebar-icons` / `--activity-bar-bg`).
   */
  .dock-root {
    border: none;
    border-top: 1px solid var(--activity-bar-bg);
  }

  .dock-tablist {
    display: flex;
    height: var(--workbench-row-header-height, 26px);
    flex-shrink: 0;
    align-items: center;
    gap: 4px;
    padding: 2px 6px 3px;
    background: transparent;
    border: none;
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
    background: var(--secondary);
    color: var(--muted-foreground);
    box-sizing: border-box;
  }

  .dock-tab-wrap--active {
    background: var(--muted);
    color: var(--foreground);
  }

  .dock-tab-wrap:hover:not(.dock-tab-wrap--active) {
    background: var(--muted);
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

  .dock-tab-main:focus-visible {
    outline: 1px solid var(--ring);
    outline-offset: 1px;
  }
</style>
