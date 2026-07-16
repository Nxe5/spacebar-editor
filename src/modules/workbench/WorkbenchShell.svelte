<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { ModeWatcher } from "mode-watcher";
  import { Toaster } from "$lib/components/ui/sonner";
  import { toast } from "svelte-sonner";
  import ChatPane from "../agent/ChatPane.svelte";
  import ChatTabBar from "../agent/ChatTabBar.svelte";
  import RightSidebar from "../explorer/RightSidebar.svelte";
  import CenterWorkbench from "./CenterWorkbench.svelte";
  import WorkbenchTabBar from "./WorkbenchTabBar.svelte";
  import StatusBar from "./StatusBar.svelte";
  import WindowControls from "./WindowControls.svelte";
  import SettingsPane from "../settings/SettingsPane.svelte";
  import FeedbackDialog from "../feedback/FeedbackDialog.svelte";
  import WorkspaceTrustDialog from "../workspace/WorkspaceTrustDialog.svelte";
  import WorkspaceLockDialog from "../workspace/WorkspaceLockDialog.svelte";
  import { chat } from "$lib/stores/chat";
  import WorkspaceReadOnlyBanner from "../workspace/WorkspaceReadOnlyBanner.svelte";
  import WelcomeScreen from "../workspace/WelcomeScreen.svelte";
  import BottomDock from "./BottomDock.svelte";
  import { bottomPanelOpenRequest } from "$lib/stores/bottomPanel";
  import { bottomTerminals } from "$lib/stores/bottomTerminals";
  import { workbench } from "$lib/stores/workbench";
  import { layoutOverride } from "$lib/stores/layoutOverride";
  import { files } from "$lib/stores/files";
  import { settings } from "$lib/stores/settings";
  import { applyWorkbenchTheme, normalizeWorkbenchTheme, type WorkbenchThemeId } from "$lib/workbench-theme";
  import { iconTheme } from "$lib/stores/iconTheme";
  import {
    isTauriAvailable,
    closeAuxiliaryWebviewWindows,
    pickWorkspaceFolder,
  } from "$lib/ipc";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { applyWorkspaceFolder } from "$lib/workspace";
  import { initProjectStateAutosave, persistCurrentProjectState } from "$lib/projectState";
  import { markCleanExit, takeCrashRestoreWorkspace } from "$lib/crashRestore";
  import { syntaxTheme } from "$lib/stores/syntaxTheme";
  import { editorChrome } from "$lib/stores/editorChrome";
  import { dispatchWithOverrides } from "../shortcuts/dispatcher";
  import { shortcutOverrides } from "../shortcuts/registry";
  import { explorerAppearance } from "$lib/stores/explorerAppearance";
  import { chatAppearance } from "$lib/stores/chatAppearance";
  import { contextAppearance } from "$lib/stores/contextAppearance";
  import { workbenchChrome } from "$lib/stores/workbenchChrome";
  import { setWorkbenchModalScrollLock } from "$lib/workbenchScrollLock";
  import { syncAuxiliaryScrollLockWithSettingsWindow } from "$lib/settingsPopoutScrollLock";
  import type { ExplorerPanelTab } from "$lib/explorerPanel";

  const PANE_WIDTH_KEY = "sidebar.paneWidths.v1";
  const LEFT_MIN = 200;
  const LEFT_MAX = 560;
  const RIGHT_MIN = 200;
  const BOTTOM_MIN = 120;
  const BOTTOM_DEFAULT = 220;
  function clamp(n: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, n));
  }

  function rightPaneMax(): number {
    if (typeof window === "undefined") return 420;
    return Math.min(560, Math.floor(window.innerWidth * 0.45));
  }

  function bottomPaneMax(): number {
    if (typeof window === "undefined") return 560;
    return Math.min(560, Math.floor(window.innerHeight * 0.55));
  }

  function loadPaneWidths(): { left: number; right: number; bottom: number } {
    if (typeof localStorage === "undefined") {
      return { left: 320, right: 280, bottom: BOTTOM_DEFAULT };
    }
    try {
      const raw = localStorage.getItem(PANE_WIDTH_KEY);
      if (!raw) return { left: 320, right: 280, bottom: BOTTOM_DEFAULT };
      const v = JSON.parse(raw) as { left?: number; right?: number; bottom?: number };
      const left = typeof v.left === "number" ? clamp(v.left, LEFT_MIN, LEFT_MAX) : 320;
      const right = typeof v.right === "number" ? clamp(v.right, RIGHT_MIN, rightPaneMax()) : 280;
      const bottom =
        typeof v.bottom === "number"
          ? clamp(v.bottom, BOTTOM_MIN, bottomPaneMax())
          : BOTTOM_DEFAULT;
      return { left, right, bottom };
    } catch {
      return { left: 320, right: 280, bottom: BOTTOM_DEFAULT };
    }
  }

  let settingsOpen = $state(false);
  let feedbackOpen = $state(false);
  let showLeftPanel = $state(true);
  let showRightPanel = $state(true);
  /** Explorer / git / prompt panel visible (toggled from status bar). */
  let rightExplorerOpen = $state(true);
  let explorerActiveTab = $state<ExplorerPanelTab>("files");
  let showBottomPanel = $state(false);
  let showTabStrip = $state(true);

  const initialPanes = loadPaneWidths();
  let leftPaneWidth = $state(initialPanes.left);
  let rightPaneWidth = $state(initialPanes.right);
  let bottomPaneHeight = $state(initialPanes.bottom);

  let resizeDrag: { edge: "left" | "right"; startX: number; startW: number } | null = null;
  let resizeBottomDrag: { startY: number; startH: number } | null = null;

  let rightAsideLayoutStyle = $derived(
    showRightPanel && rightExplorerOpen
      ? `width:${rightPaneWidth}px;min-width:${RIGHT_MIN}px;max-width:${rightPaneMax()}px;`
      : `width:0;min-width:0;max-width:0;overflow:hidden;`
  );

  function toggleRightPanel() {
    showRightPanel = !showRightPanel;
    if (showRightPanel) rightExplorerOpen = true;
  }

  function onExplorerTabClick(tab: ExplorerPanelTab) {
    if (!showRightPanel) showRightPanel = true;
    if (explorerActiveTab === tab && rightExplorerOpen) {
      rightExplorerOpen = false;
      return;
    }
    explorerActiveTab = tab;
    rightExplorerOpen = true;
  }

  function onResizeMove(e: MouseEvent) {
    const d = resizeDrag;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (d.edge === "left") {
      leftPaneWidth = Math.round(clamp(d.startW + dx, LEFT_MIN, LEFT_MAX));
    } else {
      rightPaneWidth = Math.round(clamp(d.startW - dx, RIGHT_MIN, rightPaneMax()));
    }
  }

  function persistPaneLayout() {
    try {
      localStorage.setItem(
        PANE_WIDTH_KEY,
        JSON.stringify({
          left: leftPaneWidth,
          right: rightPaneWidth,
          bottom: bottomPaneHeight,
        })
      );
    } catch {
      /* ignore */
    }
  }

  function onResizeUp() {
    if (resizeDrag) persistPaneLayout();
    resizeDrag = null;
    window.removeEventListener("mousemove", onResizeMove);
    window.removeEventListener("mouseup", onResizeUp);
  }

  function onBottomResizeMove(e: MouseEvent) {
    const d = resizeBottomDrag;
    if (!d) return;
    const dy = d.startY - e.clientY;
    bottomPaneHeight = Math.round(clamp(d.startH + dy, BOTTOM_MIN, bottomPaneMax()));
  }

  function onBottomResizeUp() {
    if (resizeBottomDrag) persistPaneLayout();
    resizeBottomDrag = null;
    window.removeEventListener("mousemove", onBottomResizeMove);
    window.removeEventListener("mouseup", onBottomResizeUp);
  }

  function onBottomResizePointerDown(e: MouseEvent) {
    e.preventDefault();
    resizeBottomDrag = {
      startY: e.clientY,
      startH: bottomPaneHeight,
    };
    window.addEventListener("mousemove", onBottomResizeMove);
    window.addEventListener("mouseup", onBottomResizeUp);
  }

  function onResizePointerDown(e: MouseEvent, edge: "left" | "right") {
    e.preventDefault();
    resizeDrag = {
      edge,
      startX: e.clientX,
      startW: edge === "left" ? leftPaneWidth : rightPaneWidth,
    };
    window.addEventListener("mousemove", onResizeMove);
    window.addEventListener("mouseup", onResizeUp);
  }

  let lastSyncedWorkbenchTheme: WorkbenchThemeId | null = null;

  function syncAppearanceFromWorkbenchTheme(themeId: WorkbenchThemeId): void {
    if (lastSyncedWorkbenchTheme !== null && lastSyncedWorkbenchTheme !== themeId) {
      editorChrome.syncFromActiveTheme();
      syntaxTheme.syncFromActiveTheme();
      contextAppearance.syncFromActiveTheme();
      chatAppearance.syncFromActiveTheme();
      workbenchChrome.syncFromActiveTheme();
    }
    lastSyncedWorkbenchTheme = themeId;
  }

  $effect(() => {
    const theme = normalizeWorkbenchTheme($settings.workbenchTheme);
    try {
      applyWorkbenchTheme(theme);
      syncAppearanceFromWorkbenchTheme(theme);
    } catch (e) {
      console.error("[workbench-theme] failed to apply theme:", e);
    }
  });

  $effect(() => {
    setWorkbenchModalScrollLock(settingsOpen || feedbackOpen);
  });

  // Consume one-shot layout override (e.g. from CLI file-open mode).
  $effect(() => {
    const override = $layoutOverride;
    if (!override) return;
    showLeftPanel = override.showLeftPanel;
    showRightPanel = override.showRightPanel;
    showBottomPanel = override.showBottomPanel;
    showTabStrip = override.showTabStrip;
    layoutOverride.set(null);
  });

  onMount(() => {
    void iconTheme.init();
    const clampPanesToWindow = () => {
      leftPaneWidth = clamp(leftPaneWidth, LEFT_MIN, LEFT_MAX);
      rightPaneWidth = clamp(rightPaneWidth, RIGHT_MIN, rightPaneMax());
      bottomPaneHeight = clamp(bottomPaneHeight, BOTTOM_MIN, bottomPaneMax());
    };
    window.addEventListener("resize", clampPanesToWindow);
    clampPanesToWindow();

    try {
      syntaxTheme.init();
      editorChrome.init();
      explorerAppearance.init();
      chatAppearance.init();
      contextAppearance.init();
      workbenchChrome.init();
    } catch (e) {
      console.error("[workbench] appearance init failed:", e);
    }
    initProjectStateAutosave();
    const onBeforeUnload = () => {
      markCleanExit();
      void persistCurrentProjectState();
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    // A webview reload without a clean shutdown means the content process
    // crashed (seen on long agent runs) — reopen the workspace the user was in
    // instead of landing on the welcome screen.
    if (isTauriAvailable() && !get(files).workspacePath) {
      const restorePath = takeCrashRestoreWorkspace();
      if (restorePath) {
        void applyWorkspaceFolder(restorePath).catch((e) =>
          console.warn("[crash-restore] failed to reopen workspace:", e)
        );
      }
    }

    if (!isTauriAvailable()) {
      return () => {
        window.removeEventListener("resize", clampPanesToWindow);
        window.removeEventListener("beforeunload", onBeforeUnload);
      };
    }

    let unlistenFocus: (() => void) | undefined;
    void syncAuxiliaryScrollLockWithSettingsWindow();

    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused && !document.querySelector(".backdrop")) {
          void syncAuxiliaryScrollLockWithSettingsWindow();
        }
      })
      .then((fn) => {
        unlistenFocus = fn;
      });

    return () => {
      window.removeEventListener("resize", clampPanesToWindow);
      window.removeEventListener("beforeunload", onBeforeUnload);
      unlistenFocus?.();
      void persistCurrentProjectState();
    };
  });

  $effect(() => {
    const _req = $bottomPanelOpenRequest;
    if (_req > 0) showBottomPanel = true;
  });

  async function newTerminalTab() {
    if (!isTauriAvailable()) {
      toast.error("Terminal requires Tauri.");
      return;
    }
    showBottomPanel = true;
    try {
      await bottomTerminals.createTab({ source: "user" });
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function chooseWorkspaceFolder() {
    if (!isTauriAvailable()) {
      toast.error("Open folder requires the desktop app.");
      return;
    }
    try {
      const path = await pickWorkspaceFolder();
      if (!path) return;
      const opened = await applyWorkspaceFolder(path);
      if (opened) {
        const name = path.split(/[/\\]/).pop() ?? path;
        toast.success(`Workspace: ${name}`);
      }
    } catch (e) {
      toast.error(String(e));
    }
  }

  function newPreviewTab() {
    workbench.addPreviewTab("http://127.0.0.1:5173", "Preview");
  }

  async function closeAllWindowsAndTabs() {
    try {
      if (isTauriAvailable()) {
        await closeAuxiliaryWebviewWindows();
      }
    } catch (e) {
      toast.error(String(e));
    }
    workbench.closeAllTabs();
  }

  function openSettingsModal() {
    setWorkbenchModalScrollLock(true);
    settingsOpen = true;
  }

  function openFeedbackModal() {
    setWorkbenchModalScrollLock(true);
    feedbackOpen = true;
  }

  function onGlobalKeydown(ev: KeyboardEvent) {
    dispatchWithOverrides(ev, {
      toggleChat: () => (showLeftPanel = !showLeftPanel),
      toggleExplorer: () => (showRightPanel = !showRightPanel),
      toggleBottom: () => (showBottomPanel = !showBottomPanel),
      openSettings: () => openSettingsModal(),
      newTerminal: () => void newTerminalTab(),
      newPreview: newPreviewTab,
      closeAllWorkbench: () => void closeAllWindowsAndTabs(),
      focusSearch: () => {
        if (!showRightPanel) showRightPanel = true;
        rightExplorerOpen = true;
        explorerActiveTab = "search";
        window.dispatchEvent(new CustomEvent("sidebar:focus-search"));
      },
    }, $shortcutOverrides);
  }
</script>

<svelte:window onkeydown={onGlobalKeydown} />

<ModeWatcher defaultMode="dark" darkClassNames={[]} lightClassNames={[]} />
<Toaster richColors position="bottom-right" />

<!-- overflow-clip (not hidden): forbids WebKit focus-reveal from silently
     scrolling these fixed panes (e.g. clicking a file-tree row nudging the
     editor). `hidden` still allows programmatic scroll; `clip` does not. -->
<div class="workbench-root flex h-screen flex-col overflow-clip bg-background text-foreground">
  <header class="workbench-titlebar">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="workbench-titlebar__drag"
      data-tauri-drag-region
    >
      <span class="workbench-titlebar__title" data-tauri-drag-region>Spacebar Editor</span>
    </div>
    <WindowControls />
  </header>

  {#if $files.workspacePath && showTabStrip}
    <div class="workbench-tab-strip-host">
      <div class="workbench-tab-strip" role="toolbar" aria-label="Chat and editor tabs">
        <div class="workbench-tab-strip__chat flex min-h-0 min-w-0 max-w-[min(28rem,48vw)] shrink overflow-hidden">
          <ChatTabBar />
        </div>
        <div class="workbench-tab-strip__divider" aria-hidden="true"></div>
        <div class="workbench-tab-strip__editor workbench-tab-row-track">
          <WorkbenchTabBar />
        </div>
      </div>
    </div>
  {/if}

  {#if !$files.workspacePath}
    <WelcomeScreen />
  {:else}
  <WorkspaceReadOnlyBanner />
  <div class="workbench-body flex min-h-0 flex-1 overflow-clip">
    {#if showLeftPanel}
      <aside
        class="chat-column flex min-h-0 min-w-0 shrink-0 flex-col"
        style="width:{leftPaneWidth}px;min-width:{LEFT_MIN}px;max-width:{LEFT_MAX}px;"
      >
        <div class="chat-column__panel">
          <ChatPane onOpenSettings={openSettingsModal} />
        </div>
      </aside>
    {/if}

    <div class="center-column relative flex min-w-0 flex-1 flex-col overflow-clip">
      <div
        class="center-workbench-stack relative z-0 flex min-h-0 flex-1 flex-col overflow-clip border-0 outline-none"
      >
        <CenterWorkbench />
      </div>

      {#if showBottomPanel}
        <aside
          class="dock-aside relative z-10 flex shrink-0 flex-col bg-background"
          style="height:{bottomPaneHeight}px;min-height:{BOTTOM_MIN}px;max-height:{bottomPaneMax()}px;"
        >
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions bottom dock height -->
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize bottom panel"
            title="Drag to resize"
            class="dock-resize-top"
            onmousedown={onBottomResizePointerDown}
          ></div>
          <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
            <BottomDock open={showBottomPanel} />
          </div>
        </aside>
      {/if}

      {#if showLeftPanel}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions resize handle -->
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat"
          title="Drag to resize"
          class="pane-resize-inner pane-resize-inner--left"
          onmousedown={(e) => onResizePointerDown(e, "left")}
        ></div>
      {/if}
      {#if showRightPanel && rightExplorerOpen}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions resize handle -->
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize explorer"
          title="Drag to resize"
          class="pane-resize-inner pane-resize-inner--right"
          onmousedown={(e) => onResizePointerDown(e, "right")}
        ></div>
      {/if}
    </div>

    {#if showRightPanel && rightExplorerOpen}
      <aside class="explorer-column flex min-h-0 min-w-0 shrink-0 flex-col" style={rightAsideLayoutStyle}>
        <RightSidebar bind:activeTab={explorerActiveTab} />
      </aside>
    {/if}
  </div>

  <StatusBar
    {showLeftPanel}
    {showRightPanel}
    {showBottomPanel}
    {showTabStrip}
    {rightExplorerOpen}
    explorerActiveTab={explorerActiveTab}
    onToggleLeft={() => (showLeftPanel = !showLeftPanel)}
    onToggleTabStrip={() => (showTabStrip = !showTabStrip)}
    onToggleRight={toggleRightPanel}
    onToggleBottom={() => (showBottomPanel = !showBottomPanel)}
    onExplorerTab={onExplorerTabClick}
    onOpenWorkspace={() => void chooseWorkspaceFolder()}
    onOpenSettings={openSettingsModal}
    onOpenFeedback={openFeedbackModal}
    onToggleWebAccess={() => chat.toggleWebAccessForActiveSession()}
  />
  {/if}
</div>

<SettingsPane open={settingsOpen} onClose={() => (settingsOpen = false)} />
<FeedbackDialog open={feedbackOpen} onClose={() => (feedbackOpen = false)} />
<WorkspaceLockDialog />
<WorkspaceTrustDialog />

<style>
  .workbench-root {
    background: var(--workbench-shell-bg, var(--background));
  }

  .workbench-titlebar {
    display: flex;
    align-items: stretch;
    flex-shrink: 0;
    height: var(--workbench-titlebar-height);
    min-height: var(--workbench-titlebar-height);
    border-bottom: none;
    background: var(--workbench-shell-bg, var(--background));
  }

  .workbench-titlebar__drag {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    padding: 0 12px;
    user-select: none;
  }

  .workbench-titlebar__title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--muted-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .workbench-tab-strip-host {
    flex-shrink: 0;
    box-sizing: border-box;
    padding: 0 var(--workbench-edge-inset) var(--workbench-tab-strip-inset-bottom)
      var(--workbench-edge-inset);
    background: var(--workbench-shell-bg, var(--background));
    border-top: 1px solid var(--chat-panel-border);
    border-bottom: 1px solid var(--chat-panel-border);
  }

  .workbench-tab-strip {
    display: flex;
    align-items: stretch;
    min-width: 0;
    height: var(--workbench-tab-row-height);
    min-height: var(--workbench-tab-row-height);
    border-radius: 0;
    border: none;
    background: var(--workbench-tab-strip-bg);
    box-shadow: none;
    overflow: hidden;
  }

  .workbench-tab-strip__chat {
    flex: 0 1 auto;
  }

  .workbench-tab-strip__divider {
    flex-shrink: 0;
    width: 1px;
    margin: 6px 0;
    background: color-mix(in srgb, var(--border) 35%, transparent);
  }

  .workbench-tab-strip__editor {
    flex: 1 1 0;
    min-width: 0;
  }

  .workbench-body {
    background: var(--workbench-shell-bg, var(--background));
  }

  .chat-column {
    box-sizing: border-box;
    padding: var(--chat-panel-inset-block-top) var(--workbench-edge-inset)
      var(--chat-panel-inset-block-bottom) var(--workbench-edge-inset);
    background: var(--workbench-shell-bg, var(--background));
    border: none;
    border-right: 1px solid var(--chat-panel-border);
    border-radius: 0;
    overflow: hidden;
  }

  .center-column {
    box-sizing: border-box;
    padding: 0;
    background: var(--workbench-shell-bg, var(--background));
  }

  .chat-column__panel {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    background: var(--chat-panel-bg);
  }

  .explorer-column {
    background: var(--workbench-shell-bg, var(--background));
  }

  .workbench-tab-row-track {
    display: flex;
    flex: 1 1 0;
    min-width: 0;
    min-height: 0;
    height: 100%;
    align-items: stretch;
  }

  .workbench-tab-strip :global(.chat-tab-bar-root),
  .workbench-tab-strip :global(.workbench-tab-bar-root) {
    height: 100%;
  }

  /**
   * Resize targets live inside the center column (overlap inward) so side panes
   * keep a full-width border and no extra flex gutter when a pane cannot be hidden.
   */
  .pane-resize-inner {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 25;
    width: 6px;
    cursor: col-resize;
    touch-action: none;
    user-select: none;
    background: transparent;
    box-sizing: border-box;
    border: none;
    outline: none;
    box-shadow: none;
  }

  .pane-resize-inner:focus-visible {
    outline: none;
  }

  .pane-resize-inner--left {
    left: 0;
  }

  .pane-resize-inner--right {
    right: 0;
  }

  /** Top edge of bottom dock — drag up/down to change height. */
  .dock-resize-top {
    flex-shrink: 0;
    height: 6px;
    cursor: row-resize;
    touch-action: none;
    user-select: none;
    background: transparent;
    box-sizing: border-box;
    border: none;
    outline: none;
    z-index: 15;
  }

  .dock-resize-top:focus-visible {
    outline: none;
  }

  .center-workbench-stack {
    border: none;
    box-shadow: none;
    min-height: 0;
  }

  .center-workbench-stack :global(> *) {
    flex: 1 1 0;
    min-height: 0;
    min-width: 0;
  }
</style>
