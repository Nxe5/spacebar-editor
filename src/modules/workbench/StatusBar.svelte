<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { settings } from "$lib/stores/settings";
  import { files } from "$lib/stores/files";
  import { cloudApiKeysForStream } from "$lib/apiSecrets";
  import { backendStatus, pollBackendHealth } from "$lib/stores/backendStatus";
  import { gitCurrentBranch, gitStatus, isTauriAvailable, openExternalUrl } from "$lib/ipc";
  import { updateStatus } from "$lib/stores/updateStatus";
  import AppIcon from "$lib/components/AppIcon.svelte";
  import SidebarIcon from "phosphor-svelte/lib/SidebarIcon";
  import RowsIcon from "phosphor-svelte/lib/RowsIcon";
  import AppWindowIcon from "phosphor-svelte/lib/AppWindowIcon";
  import { chat, activeSession } from "$lib/stores/chat";
  import Globe from "phosphor-svelte/lib/Globe";
  import { workspaceRestricted } from "$lib/workspaceTrust";

  const POLL_MS = 10_000;

  let {
    showLeftPanel = true,
    showRightPanel = true,
    showBottomPanel = false,
    showTabStrip = true,
    onToggleLeft,
    onToggleTabStrip,
    onToggleRight,
    onToggleBottom,
    rightExplorerOpen = false,
    onOpenWorkspace,
    onOpenSettings,
    onOpenFeedback,
    onToggleWebAccess,
  }: {
    showLeftPanel?: boolean;
    showRightPanel?: boolean;
    showBottomPanel?: boolean;
    showTabStrip?: boolean;
    rightExplorerOpen?: boolean;
    onToggleLeft?: () => void;
    onToggleTabStrip?: () => void;
    onToggleRight?: () => void;
    onToggleBottom?: () => void;
    onOpenWorkspace?: () => void;
    onOpenSettings?: () => void;
    onOpenFeedback?: () => void;
    onToggleWebAccess?: () => void;
  } = $props();

  let timer: ReturnType<typeof setInterval> | null = null;
  let gitBranch = $state<string | null>(null);
  let gitCounts = $state<{ dirty: number } | null>(null);

  let webAccessOn = $derived($activeSession?.webAccessEnabled === true);

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
    const cloudKeys = await cloudApiKeysForStream();
    const line = await pollBackendHealth({
      chatBackend: $settings.chatBackend,
      selectedModel: $settings.selectedModel,
      ollamaEndpoint: $settings.ollamaEndpoint,
      ollamaApiKey: $settings.ollamaApiKey,
      llamacppEndpoint: $settings.llamacppEndpoint,
      llamacppApiKey: $settings.llamacppApiKey,
      anthropicApiKey: cloudKeys.anthropic,
      deepseekApiKey: cloudKeys.deepseek,
      glmApiKey: cloudKeys.glm,
      kimiApiKey: cloudKeys.kimi,
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
      $settings.ollamaApiKey,
      $settings.llamacppEndpoint,
      $settings.llamacppApiKey,
      $settings.apiKeys.anthropic,
      $settings.apiKeys.deepseek,
      $settings.apiKeys.glm,
      $settings.apiKeys.kimi,
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
      class:active={showTabStrip}
      aria-pressed={showTabStrip}
      title="Toggle tab bar"
      aria-label="Toggle tab bar"
      onclick={() => onToggleTabStrip?.()}
    >
      <AppWindowIcon size={18} aria-hidden="true" />
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
      class:active={showRightPanel && rightExplorerOpen}
      aria-pressed={showRightPanel && rightExplorerOpen}
      title="Toggle explorer panel"
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
    {#if $workspaceRestricted}
      <span class="restricted-pill" title="Agent context from this project is not loaded">Restricted</span>
      <span class="status-sep" aria-hidden="true"></span>
    {/if}
    <span class="status-label">{$backendStatus.label}</span>
    <span
      class="status-dot"
      class:green={$backendStatus.dot === "green"}
      class:red={$backendStatus.dot === "red"}
      class:yellow={$backendStatus.dot === "yellow"}
      class:idle={$backendStatus.dot === "idle"}
      title={$backendStatus.detail}
    ></span>
    <span class="status-detail">{$backendStatus.detail}</span>
  </div>
  <div class="status-bar__right">
    <div class="status-bar__group" role="toolbar" aria-label="Web access">
      <button
        type="button"
        class="status-toggle workbench-icon-btn web-access-btn"
        class:active={webAccessOn}
        aria-pressed={webAccessOn}
        title={webAccessOn
          ? "Web access enabled — agent can fetch URLs"
          : "Web access disabled — click to allow web_fetch for this session"}
        aria-label={webAccessOn ? "Disable web access" : "Enable web access"}
        onclick={() => onToggleWebAccess?.()}
      >
        <Globe size={16} weight={webAccessOn ? "fill" : "regular"} aria-hidden="true" />
      </button>
    </div>

    <span class="status-sep" aria-hidden="true"></span>

    <div class="status-bar__group" role="toolbar" aria-label="Workspace and settings">
      <button
        type="button"
        class="status-toggle workbench-icon-btn"
        title="Open workspace folder"
        aria-label="Open workspace folder"
        onclick={() => onOpenWorkspace?.()}
      >
        <AppIcon name="open-new-window" size={16} />
      </button>
      <button
        type="button"
        class="status-toggle workbench-icon-btn"
        title="Send feedback"
        aria-label="Send feedback"
        onclick={() => onOpenFeedback?.()}
      >
        <AppIcon name="mail-open" size={16} />
      </button>
      <button
        type="button"
        class="status-toggle workbench-icon-btn"
        title="Settings"
        aria-label="Settings"
        onclick={() => onOpenSettings?.()}
      >
        <AppIcon name="settings" size={16} />
      </button>
    </div>

    {#if $updateStatus.dot !== "idle"}
      <span class="status-sep" aria-hidden="true"></span>
      <div class="status-bar__group version-group">
        {#if $updateStatus.dot === "yellow"}
          <button
            type="button"
            class="update-pill"
            title={`v${$updateStatus.latestVersion} available — open release page`}
            onclick={() =>
              void openExternalUrl(
                `https://github.com/Nxe5/spacebar-editor/releases/tag/v${$updateStatus.latestVersion}`,
              )}
          >
            Update
          </button>
        {/if}
        <span
          class="status-dot"
          class:green={$updateStatus.dot === "green"}
          class:red={$updateStatus.dot === "red"}
          class:yellow={$updateStatus.dot === "yellow"}
          title={$updateStatus.detail}
        ></span>
        <span class="version-text">v{$updateStatus.currentVersion}</span>
      </div>
    {/if}
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
    background: var(--workbench-panel-bg, var(--chat-panel-bg, var(--sidebar)));
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

  .status-bar__right {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    margin-left: auto;
    position: relative;
    z-index: 2;
  }

  .status-bar__group {
    display: flex;
    align-items: center;
    gap: 0;
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

  .restricted-pill {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    background: color-mix(in srgb, #f59e0b 18%, transparent);
    color: #fbbf24;
    border: 1px solid color-mix(in srgb, #f59e0b 35%, transparent);
    flex-shrink: 0;
  }

  .web-access-btn:not(.active) {
    opacity: 0.45;
  }

  .web-access-btn.active {
    color: var(--syntax-string, #98c379);
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

  .version-group {
    gap: 6px;
    padding: 0 4px;
  }

  .version-text {
    font-size: 10px;
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .update-pill {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid #d29922;
    background: rgba(210, 153, 34, 0.12);
    color: #d29922;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .update-pill:hover {
    background: rgba(210, 153, 34, 0.22);
  }

</style>
