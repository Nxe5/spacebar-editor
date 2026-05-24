<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { settings } from "$lib/stores/settings";
  import { files } from "$lib/stores/files";
  import { backendStatus, pollBackendHealth } from "$lib/stores/backendStatus";
  import { gitCurrentBranch, gitStatus, isTauriAvailable } from "$lib/ipc";
  import SidebarIcon from "phosphor-svelte/lib/SidebarIcon";
  import RowsIcon from "phosphor-svelte/lib/RowsIcon";

  const POLL_MS = 10_000;

  let {
    showLeftPanel = true,
    showRightPanel = true,
    showBottomPanel = false,
    onToggleLeft,
    onToggleRight,
    onToggleBottom,
  }: {
    showLeftPanel?: boolean;
    showRightPanel?: boolean;
    showBottomPanel?: boolean;
    onToggleLeft?: () => void;
    onToggleRight?: () => void;
    onToggleBottom?: () => void;
  } = $props();
  let timer: ReturnType<typeof setInterval> | null = null;
  let gitBranch = $state<string | null>(null);
  let gitCounts = $state<{ dirty: number } | null>(null);

  async function refreshGit() {
    if (!isTauriAvailable()) {
      gitBranch = null;
      gitCounts = null;
      return;
    }
    const root = $files.workspacePath;
    if (!root) {
      gitBranch = null;
      gitCounts = null;
      return;
    }
    try {
      gitBranch = await gitCurrentBranch(root);
      const st = await gitStatus(root);
      const dirty = st.filter((r) => r.worktree !== "-" || r.index !== "-").length;
      gitCounts = { dirty };
    } catch {
      gitBranch = null;
      gitCounts = null;
    }
  }

  async function tick() {
    const line = await pollBackendHealth({
      chatBackend: $settings.chatBackend,
      selectedModel: $settings.selectedModel,
      ollamaEndpoint: $settings.ollamaEndpoint,
      llamacppEndpoint: $settings.llamacppEndpoint,
      llamacppApiKey: $settings.llamacppApiKey,
      anthropicApiKey: $settings.apiKeys.anthropic,
    });
    backendStatus.set(line);
  }

  onMount(() => {
    void tick();
    timer = setInterval(() => void tick(), POLL_MS);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  $effect(() => {
    void [
      $settings.chatBackend,
      $settings.selectedModel,
      $settings.ollamaEndpoint,
      $settings.llamacppEndpoint,
      $settings.llamacppApiKey,
      $settings.apiKeys.anthropic,
      $files.workspacePath,
    ];
    void tick();
    void refreshGit();
  });
</script>

<div class="status-bar">
  <div class="status-bar__actions" role="toolbar" aria-label="Panel toggles">
    <button
      type="button"
      class="status-toggle workbench-icon-btn"
      class:active={showLeftPanel}
      aria-pressed={showLeftPanel}
      title="Toggle chat"
      onclick={() => onToggleLeft?.()}
    >
      <SidebarIcon size={18} aria-hidden="true" />
    </button>
    <button
      type="button"
      class="status-toggle workbench-icon-btn"
      class:active={showBottomPanel}
      aria-pressed={showBottomPanel}
      title="Toggle bottom panel"
      onclick={() => onToggleBottom?.()}
    >
      <RowsIcon size={18} aria-hidden="true" />
    </button>
    <button
      type="button"
      class="status-toggle workbench-icon-btn"
      class:active={showRightPanel}
      aria-pressed={showRightPanel}
      title="Toggle explorer"
      onclick={() => onToggleRight?.()}
    >
      <SidebarIcon size={18} mirrored aria-hidden="true" />
    </button>
  </div>
  <span class="status-sep status-sep--actions" aria-hidden="true"></span>
  <div class="status-bar__left" role="status" aria-live="polite">
    {#if gitBranch}
      <span class="git-pill" title="Git branch">
        {gitBranch}
        {#if gitCounts && gitCounts.dirty > 0}
          <span class="git-dirty">· {gitCounts.dirty}</span>
        {/if}
      </span>
      <span class="status-sep" aria-hidden="true"></span>
    {/if}
    <span class="status-label">{$backendStatus.label}</span>
    <span class="status-dot" class:green={$backendStatus.dot === "green"} class:red={$backendStatus.dot === "red"} class:yellow={$backendStatus.dot === "yellow"} class:idle={$backendStatus.dot === "idle"} title={$backendStatus.detail}></span>
    <span class="status-detail">{$backendStatus.detail}</span>
  </div>
</div>

<style>
  .status-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    box-sizing: border-box;
    height: var(--workbench-shell-header-height);
    min-height: var(--workbench-shell-header-height);
    padding: 0 8px 0 4px;
    font-size: 10px;
    line-height: 1.25;
    color: var(--muted-foreground);
    background: color-mix(in srgb, var(--surface, var(--card)) 88%, var(--background) 12%);
    border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    flex-shrink: 0;
    min-width: 0;
  }

  .status-bar__left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }

  .status-bar__actions {
    display: flex;
    align-items: center;
    gap: 0;
    flex-shrink: 0;
  }

  .status-sep--actions {
    margin: 0 4px 0 2px;
  }

  .git-pill {
    font-family: ui-monospace, monospace;
    font-size: 10px;
    color: var(--foreground);
    flex-shrink: 0;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .git-dirty {
    color: #d29922;
  }

  .status-sep {
    width: 1px;
    height: 12px;
    background: color-mix(in srgb, var(--border) 55%, transparent);
    flex-shrink: 0;
  }

  .status-label {
    font-weight: 600;
    color: var(--foreground);
    flex-shrink: 0;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    background: #555;
  }

  .status-dot.green {
    background: #3fb950;
    box-shadow: 0 0 6px rgba(63, 185, 80, 0.45);
  }

  .status-dot.red {
    background: #f85149;
    box-shadow: 0 0 6px rgba(248, 81, 73, 0.35);
  }

  .status-dot.yellow {
    background: #d29922;
    box-shadow: 0 0 6px rgba(210, 153, 34, 0.4);
  }

  .status-dot.idle {
    background: #555;
  }

  .status-detail {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
</style>
