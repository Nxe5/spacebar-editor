<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { settings } from "$lib/stores/settings";
  import { backendStatus, pollBackendHealth } from "$lib/stores/backendStatus";
  import PanelLeft from "@lucide/svelte/icons/panel-left";
  import PanelRight from "@lucide/svelte/icons/panel-right";
  import PanelBottom from "@lucide/svelte/icons/panel-bottom";
  import FolderOpen from "@lucide/svelte/icons/folder-open";
  import SettingsIcon from "@lucide/svelte/icons/settings";

  const POLL_MS = 10_000;

  let {
    showLeftPanel = true,
    showRightPanel = true,
    showBottomPanel = false,
    onToggleLeft,
    onToggleRight,
    onToggleBottom,
    onOpenWorkspace,
    onOpenSettings,
  }: {
    showLeftPanel?: boolean;
    showRightPanel?: boolean;
    showBottomPanel?: boolean;
    onToggleLeft?: () => void;
    onToggleRight?: () => void;
    onToggleBottom?: () => void;
    onOpenWorkspace?: () => void;
    onOpenSettings?: () => void;
  } = $props();
  let timer: ReturnType<typeof setInterval> | null = null;

  async function tick() {
    const line = await pollBackendHealth({
      chatBackend: $settings.chatBackend,
      selectedModel: $settings.selectedModel,
      ollamaEndpoint: $settings.ollamaEndpoint,
      llamacppEndpoint: $settings.llamacppEndpoint,
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
      $settings.apiKeys.anthropic,
    ];
    void tick();
  });
</script>

<div class="status-bar">
  <div class="status-bar__left" role="status" aria-live="polite">
    <span class="status-label">{$backendStatus.label}</span>
    <span class="status-dot" class:green={$backendStatus.dot === "green"} class:red={$backendStatus.dot === "red"} class:yellow={$backendStatus.dot === "yellow"} class:idle={$backendStatus.dot === "idle"} title={$backendStatus.detail}></span>
    <span class="status-detail">{$backendStatus.detail}</span>
  </div>
  <div class="status-bar__actions" role="toolbar" aria-label="Panels, workspace, and settings">
    <button
      type="button"
      class="status-toggle"
      class:active={showLeftPanel}
      aria-pressed={showLeftPanel}
      title="Toggle chat"
      onclick={() => onToggleLeft?.()}
    >
      <PanelLeft />
    </button>
    <button
      type="button"
      class="status-toggle"
      class:active={showBottomPanel}
      aria-pressed={showBottomPanel}
      title="Toggle bottom panel"
      onclick={() => onToggleBottom?.()}
    >
      <PanelBottom />
    </button>
    <button
      type="button"
      class="status-toggle"
      class:active={showRightPanel}
      aria-pressed={showRightPanel}
      title="Toggle explorer"
      onclick={() => onToggleRight?.()}
    >
      <PanelRight />
    </button>
    <button
      type="button"
      class="status-toggle status-toggle--after-panels"
      title="Open workspace folder (explorer + new terminals)"
      onclick={() => onOpenWorkspace?.()}
    >
      <FolderOpen />
    </button>
    <button type="button" class="status-toggle" title="Settings" onclick={() => onOpenSettings?.()}>
      <SettingsIcon />
    </button>
  </div>
</div>

<style>
  .status-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 24px;
    padding: 0 8px 0 12px;
    font-size: 11px;
    color: #a0a0a0;
    background: #252526;
    border-top: 1px solid transparent;
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
    gap: 2px;
    flex-shrink: 0;
  }

  .status-toggle--after-panels {
    margin-left: 8px;
  }

  .status-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: #7a7a7a;
    cursor: pointer;
  }

  .status-toggle:hover,
  .status-toggle:active {
    background: transparent;
    color: #b8b8b8;
  }

  .status-toggle.active {
    background: transparent;
    color: #ffffff;
  }

  .status-toggle.active:hover,
  .status-toggle.active:active {
    color: #ffffff;
  }

  .status-toggle:focus-visible {
    outline: 1px solid #6e6e6e;
    outline-offset: 1px;
  }

  .status-toggle :global(svg) {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }

  .status-label {
    font-weight: 600;
    color: #cccccc;
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
