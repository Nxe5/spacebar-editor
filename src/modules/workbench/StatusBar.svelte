<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { settings } from "$lib/stores/settings";
  import { files } from "$lib/stores/files";
  import { activeEditorFile, activeWorkbenchTab } from "$lib/stores/workbench";
  import { backendStatus, pollBackendHealth } from "$lib/stores/backendStatus";
  import { gitCurrentBranch, gitStatus, isTauriAvailable } from "$lib/ipc";
  import {
    isPrettierSupportedPath,
    isContentPrettierFormatted,
  } from "$lib/editor/formatDocument";
  import PrettierIcon from "$lib/components/PrettierIcon.svelte";
  import AppIcon from "$lib/components/AppIcon.svelte";
  import SidebarIcon from "phosphor-svelte/lib/SidebarIcon";
  import RowsIcon from "phosphor-svelte/lib/RowsIcon";
  import AppWindowIcon from "phosphor-svelte/lib/AppWindowIcon";
  import { EXPLORER_PANEL_TABS, type ExplorerPanelTab } from "$lib/explorerPanel";
  import type { AppIconName } from "$lib/icons/appIcons";

  const EXPLORER_TAB_ICONS: Record<ExplorerPanelTab, AppIconName> = {
    files: "page-search",
    search: "search",
    git: "git",
  };

  const POLL_MS = 10_000;
  const PRETTIER_CHECK_MS = 500;

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
    explorerActiveTab = "files",
    onExplorerTab,
    onOpenWorkspace,
    onOpenSettings,
    onOpenFeedback,
  }: {
    showLeftPanel?: boolean;
    showRightPanel?: boolean;
    showBottomPanel?: boolean;
    showTabStrip?: boolean;
    rightExplorerOpen?: boolean;
    explorerActiveTab?: ExplorerPanelTab;
    onToggleLeft?: () => void;
    onToggleTabStrip?: () => void;
    onToggleRight?: () => void;
    onToggleBottom?: () => void;
    onExplorerTab?: (tab: ExplorerPanelTab) => void;
    onOpenWorkspace?: () => void;
    onOpenSettings?: () => void;
    onOpenFeedback?: () => void;
  } = $props();

  function explorerTabPressed(tab: ExplorerPanelTab): boolean {
    return Boolean(showRightPanel && rightExplorerOpen && explorerActiveTab === tab);
  }

  let timer: ReturnType<typeof setInterval> | null = null;
  let gitBranch = $state<string | null>(null);
  let gitCounts = $state<{ dirty: number } | null>(null);
  let prettierState = $state<"idle" | "checking" | "formatted" | "unformatted">("idle");
  let prettierTimer: ReturnType<typeof setTimeout> | null = null;

  let editorTabActive = $derived($activeWorkbenchTab?.kind === "editor");
  let showPrettier = $derived(
    editorTabActive &&
      $activeEditorFile != null &&
      $activeEditorFile.diffBase === undefined &&
      isPrettierSupportedPath($activeEditorFile.path)
  );
  let wordWrapOn = $derived($settings.editor.wordWrap);

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
      ollamaApiKey: $settings.ollamaApiKey,
      llamacppEndpoint: $settings.llamacppEndpoint,
      llamacppApiKey: $settings.llamacppApiKey,
      anthropicApiKey: $settings.apiKeys.anthropic,
      deepseekApiKey: $settings.apiKeys.deepseek,
    });
    backendStatus.set(line);
  }

  async function refreshPrettierStatus() {
    const file = $activeEditorFile;
    if (!showPrettier || !file) {
      prettierState = "idle";
      return;
    }
    prettierState = "checking";
    const result = await isContentPrettierFormatted(file.content, file.path);
    prettierState = result === "formatted" ? "formatted" : "unformatted";
  }

  function schedulePrettierCheck() {
    if (prettierTimer) clearTimeout(prettierTimer);
    prettierTimer = setTimeout(() => void refreshPrettierStatus(), PRETTIER_CHECK_MS);
  }

  function formatDocument() {
    window.dispatchEvent(new CustomEvent("tinyllama:format-document"));
  }

  function toggleWordWrap() {
    const current = get(settings).editor.wordWrap;
    settings.setEditorSettings({ wordWrap: !current });
  }

  onMount(() => {
    void tick();
    timer = setInterval(() => void tick(), POLL_MS);
    window.addEventListener("tinyllama:editor-saved", schedulePrettierCheck);
    window.addEventListener("tinyllama:format-document-done", schedulePrettierCheck);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
    if (prettierTimer) clearTimeout(prettierTimer);
    window.removeEventListener("tinyllama:editor-saved", schedulePrettierCheck);
    window.removeEventListener("tinyllama:format-document-done", schedulePrettierCheck);
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
      $files.workspacePath,
    ];
    void tick();
    void refreshGit();
  });

  $effect(() => {
    void showPrettier;
    const file = $activeEditorFile;
    void file?.path;
    void file?.content;
    schedulePrettierCheck();
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
    {#if editorTabActive}
      <div class="status-bar__group" role="toolbar" aria-label="Editor">
          <button
            type="button"
            class="status-editor-btn"
            aria-pressed={wordWrapOn}
            title={wordWrapOn ? "Disable line wrap" : "Enable line wrap"}
            aria-label="Toggle line wrap"
            onclick={() => toggleWordWrap()}
          >
            <AppIcon name="wrap-text" size={15} dimmed={!wordWrapOn} />
          </button>
        {#if showPrettier}
          <button
            type="button"
            class="status-editor-btn"
            title={prettierState === "formatted"
              ? "Formatted with Prettier (click to re-format)"
              : prettierState === "checking"
                ? "Checking Prettier…"
                : "Not Prettier-formatted (click to format)"}
            aria-label="Format with Prettier"
            onclick={formatDocument}
          >
            <PrettierIcon size={15} dimmed={prettierState !== "formatted"} />
          </button>
        {/if}
      </div>
      <span class="status-sep" aria-hidden="true"></span>
    {/if}

    <div class="status-bar__group" role="toolbar" aria-label="Explorer panels">
      {#each EXPLORER_PANEL_TABS as tab (tab.id)}
        <button
          type="button"
          class="status-toggle workbench-icon-btn"
          class:active={explorerTabPressed(tab.id)}
          aria-pressed={explorerTabPressed(tab.id)}
          title={tab.title}
          aria-label={tab.title}
          onclick={() => onExplorerTab?.(tab.id)}
        >
          <AppIcon name={EXPLORER_TAB_ICONS[tab.id]} size={16} />
        </button>
      {/each}
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

  .status-editor-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: 0;
    background: transparent;
    cursor: pointer;
    pointer-events: auto;
  }

  .status-editor-btn:hover,
  .status-editor-btn:focus-visible,
  .status-editor-btn[aria-pressed="true"] {
    background: transparent;
  }

  .status-editor-btn:focus-visible {
    outline: 1px solid var(--ring);
    outline-offset: 1px;
  }
</style>
