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
  import BottomDock from "./BottomDock.svelte";
  import { workbench } from "$lib/stores/workbench";
  import { files } from "$lib/stores/files";
  import { settings } from "$lib/stores/settings";
  import { applyWorkbenchTheme } from "$lib/workbench-theme";
  import { iconTheme } from "$lib/stores/iconTheme";
  import {
    isTauriAvailable,
    openSettingsWindow,
    closeAuxiliaryWebviewWindows,
    ptyCreate,
    pickWorkspaceFolder,
  } from "$lib/ipc";
  import { applyWorkspaceFolder } from "$lib/workspace";
  import { initProjectStateAutosave, persistCurrentProjectState } from "$lib/projectState";
  import { syntaxTheme } from "$lib/stores/syntaxTheme";
  import { dispatchWorkbenchShortcut } from "../shortcuts/dispatcher";
  import { explorerAppearance } from "$lib/stores/explorerAppearance";
  import { toggleMaximizeAppWindow } from "$lib/windowControls";

  const PANE_WIDTH_KEY = "tinyllama.paneWidths.v1";
  const LEFT_MIN = 200;
  const LEFT_MAX = 560;
  const RIGHT_MIN = 200;
  const BOTTOM_MIN = 120;
  const BOTTOM_DEFAULT = 220;
  /** Width of the right activity strip when the explorer pane is collapsed (must match RightSidebar). */
  const RIGHT_ACTIVITY_STRIP_PX = 34;

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
  let showLeftPanel = $state(true);
  let showRightPanel = $state(true);
  /** Right explorer tree/search pane open (activity strip stays; shell width follows this). */
  let rightExplorerSecondaryOpen = $state(true);
  let showBottomPanel = $state(false);

  const initialPanes = loadPaneWidths();
  let leftPaneWidth = $state(initialPanes.left);
  let rightPaneWidth = $state(initialPanes.right);
  let bottomPaneHeight = $state(initialPanes.bottom);

  let resizeDrag: { edge: "left" | "right"; startX: number; startW: number } | null = null;
  let resizeBottomDrag: { startY: number; startH: number } | null = null;

  let rightAsideLayoutStyle = $derived(
    showRightPanel && rightExplorerSecondaryOpen
      ? `width:${rightPaneWidth}px;min-width:${RIGHT_MIN}px;max-width:${rightPaneMax()}px;`
      : `width:${RIGHT_ACTIVITY_STRIP_PX}px;min-width:${RIGHT_ACTIVITY_STRIP_PX}px;max-width:${RIGHT_ACTIVITY_STRIP_PX}px;`
  );

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

  $effect(() => {
    applyWorkbenchTheme($settings.workbenchTheme);
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

    syntaxTheme.init();
    explorerAppearance.init();
    initProjectStateAutosave();
    const onBeforeUnload = () => {
      void persistCurrentProjectState();
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    if (!isTauriAvailable()) {
      return () => {
        window.removeEventListener("resize", clampPanesToWindow);
        window.removeEventListener("beforeunload", onBeforeUnload);
      };
    }
    return () => {
      window.removeEventListener("resize", clampPanesToWindow);
      window.removeEventListener("beforeunload", onBeforeUnload);
      void persistCurrentProjectState();
    };
  });

  async function newTerminalTab() {
    if (!isTauriAvailable()) {
      toast.error("Terminal requires Tauri.");
      return;
    }
    try {
      const cwd = get(files).workspacePath ?? undefined;
      const id = await ptyCreate(cwd ?? null);
      workbench.addTerminalTab(id);
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
      await applyWorkspaceFolder(path);
      const name = path.split(/[/\\]/).pop() ?? path;
      toast.success(`Workspace: ${name}`);
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
    settingsOpen = true;
  }

  async function openSettingsPopout() {
    try {
      if (!isTauriAvailable()) {
        settingsOpen = true;
        return;
      }
      await openSettingsWindow();
    } catch (e) {
      toast.error(String(e));
      settingsOpen = true;
    }
  }

  function onGlobalKeydown(ev: KeyboardEvent) {
    dispatchWorkbenchShortcut(ev, {
      toggleChat: () => (showLeftPanel = !showLeftPanel),
      toggleExplorer: () => (showRightPanel = !showRightPanel),
      toggleBottom: () => (showBottomPanel = !showBottomPanel),
      openSettings: () => void openSettingsPopout(),
      newTerminal: () => void newTerminalTab(),
      newPreview: newPreviewTab,
      closeAllWorkbench: () => void closeAllWindowsAndTabs(),
    });
  }
</script>

<svelte:window onkeydown={onGlobalKeydown} />

<ModeWatcher />
<Toaster richColors position="bottom-right" />

<div class="flex h-screen flex-col overflow-hidden bg-background text-foreground">
  <header
    class="workbench-header flex shrink-0 items-stretch border-b pl-0.5 pr-0 text-[10px] leading-tight"
    style="height: var(--workbench-shell-header-height); min-height: var(--workbench-shell-header-height);"
  >
    <div class="flex min-h-0 min-w-0 flex-1 items-stretch gap-0">
      <div class="flex min-h-0 min-w-0 max-w-[min(28rem,48vw)] shrink overflow-hidden">
        <ChatTabBar />
      </div>
      <div class="workbench-header-divider my-1 w-px shrink-0 self-stretch" aria-hidden="true"></div>
      <div class="workbench-header-track">
        <WorkbenchTabBar />
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="workbench-window-drag-pad"
          data-tauri-drag-region
          aria-hidden="true"
          ondblclick={() => void toggleMaximizeAppWindow()}
        ></div>
        <WindowControls />
      </div>
    </div>
  </header>

  <div class="flex min-h-0 flex-1 overflow-hidden">
    {#if showLeftPanel}
      <aside
        class="flex min-h-0 min-w-0 shrink-0 flex-col border-r border-transparent bg-sidebar"
        style="width:{leftPaneWidth}px;min-width:{LEFT_MIN}px;max-width:{LEFT_MAX}px;"
      >
        <ChatPane onOpenSettings={openSettingsModal} />
      </aside>
    {/if}

    <div class="relative flex min-w-0 flex-1 flex-col overflow-hidden">
      <div
        class="center-workbench-stack relative z-0 flex min-h-0 flex-1 flex-col overflow-hidden border-0 outline-none"
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
      {#if showRightPanel && rightExplorerSecondaryOpen}
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

    <aside
      class="flex min-h-0 min-w-0 shrink-0 flex-col border-l border-transparent bg-sidebar"
      style={rightAsideLayoutStyle}
    >
      <RightSidebar
        bind:secondaryOpen={rightExplorerSecondaryOpen}
        dockedOnly={!showRightPanel}
        onRequestExpand={() => (showRightPanel = true)}
        onOpenWorkspace={() => void chooseWorkspaceFolder()}
        onOpenSettings={openSettingsModal}
      />
    </aside>
  </div>

  <StatusBar
    {showLeftPanel}
    {showRightPanel}
    {showBottomPanel}
    onToggleLeft={() => (showLeftPanel = !showLeftPanel)}
    onToggleRight={() => (showRightPanel = !showRightPanel)}
    onToggleBottom={() => (showBottomPanel = !showBottomPanel)}
  />
</div>

<SettingsPane open={settingsOpen} onClose={() => (settingsOpen = false)} />

<style>
  /**
   * Keep the in-app top bar aligned with the selected workbench palette.
   * This avoids a light-looking chrome strip on Linux when the rest is dark.
   */
  .workbench-header {
    background: color-mix(in srgb, var(--surface, var(--card)) 88%, var(--background) 12%);
    border-color: color-mix(in srgb, var(--border) 70%, transparent);
  }

  .workbench-header-divider {
    background: color-mix(in srgb, var(--border) 55%, transparent);
  }

  .workbench-header-track {
    display: flex;
    flex: 1 1 0;
    min-width: 0;
    min-height: 0;
    align-items: stretch;
    --workbench-window-drag-pad: 96px;
  }

  .workbench-window-drag-pad {
    flex: 0 0 var(--workbench-window-drag-pad);
    width: var(--workbench-window-drag-pad);
    min-width: var(--workbench-window-drag-pad);
    height: 100%;
    user-select: none;
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
