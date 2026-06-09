<script lang="ts">
  import { workbench } from "$lib/stores/workbench";
  import { settings } from "$lib/stores/settings";
  import { files } from "$lib/stores/files";
  import { normalizeFilePath } from "$lib/fsPath";
  import { isTauriAvailable, ptyCreate } from "$lib/ipc";
  import { tabStripScroll } from "$lib/actions/scrollOverflow";
  import { toast } from "svelte-sonner";
  import ShellTabBubble from "./ShellTabBubble.svelte";
  import FileTextIcon from "phosphor-svelte/lib/FileTextIcon";
  import TerminalIcon from "phosphor-svelte/lib/TerminalIcon";
  import MonitorIcon from "phosphor-svelte/lib/MonitorIcon";
  import DotsThreeIcon from "phosphor-svelte/lib/DotsThreeIcon";
  import FilePlusIcon from "phosphor-svelte/lib/FilePlusIcon";
  import GlobeSimpleIcon from "phosphor-svelte/lib/GlobeSimpleIcon";

  let uniformTabWidth = $derived($settings.editor.uniformTabWidth);
  let uniformTabWidthPx = $derived($settings.editor.uniformTabWidthPx);

  let menuOpen = $state(false);
  let menuBtnEl = $state<HTMLButtonElement | undefined>(undefined);
  let menuEl = $state<HTMLDivElement | undefined>(undefined);
  let menuPos = $state({ top: 0, left: 0 });
  let untitledCounter = 0;

  function toggleMenu(e: MouseEvent) {
    e.stopPropagation();
    if (!menuOpen && menuBtnEl) {
      const r = menuBtnEl.getBoundingClientRect();
      menuPos = { top: r.bottom + 4, left: r.left };
    }
    menuOpen = !menuOpen;
  }

  function closeMenu() {
    menuOpen = false;
  }

  function onDocPointerDown(e: PointerEvent) {
    if (!menuOpen) return;
    const target = e.target as Node;
    if (!menuBtnEl?.contains(target) && !menuEl?.contains(target)) {
      closeMenu();
    }
  }

  async function newFile() {
    closeMenu();
    const workspacePath = $files.workspacePath;
    if (!workspacePath) {
      toast.error("Open a project folder first.");
      return;
    }
    untitledCounter++;
    const name = `untitled-${untitledCounter}`;
    const path = `${workspacePath}/${name}`;
    workbench.openEditorFile({ path, name, content: "", isDirty: true, language: "plaintext" });
  }

  async function openTerminal() {
    closeMenu();
    if (!isTauriAvailable()) {
      toast.error("Terminal requires the desktop app.");
      return;
    }
    try {
      const cwd = $files.workspacePath ?? null;
      const id = await ptyCreate(cwd);
      workbench.addTerminalTab(id);
    } catch (e) {
      toast.error(String(e));
    }
  }

  function openBrowser() {
    closeMenu();
    workbench.addPreviewTab("", "Browser");
  }
</script>

<svelte:window onpointerdown={onDocPointerDown} />

<div class="workbench-tab-bar-root">
  <div class="editor-actions-wrap">
    <button
      bind:this={menuBtnEl}
      type="button"
      class="hdr-tab-aux-btn"
      class:active={menuOpen}
      onclick={toggleMenu}
      title="Editor actions"
      aria-label="Editor actions"
      aria-haspopup="menu"
      aria-expanded={menuOpen}
    >
      <DotsThreeIcon size={16} weight="bold" />
    </button>
  </div>

  <div class="tab-strip-scroll-wrap">
    <div class="workbench-tablist-scroll" use:tabStripScroll>
      <div class="workbench-tablist-inner" role="tablist" aria-label="Workbench tabs">
        {#each $workbench.tabs as tab (tab.id)}
          {@const active = $workbench.activeTabId === tab.id}
          {@const dirty =
            tab.kind === "editor"
              ? ($files.openFiles.find((f) => normalizeFilePath(f.path) === normalizeFilePath(tab.path))
                  ?.isDirty ?? false)
              : false}
          <div class="hdr-tab-slot">
            <ShellTabBubble
              title={tab.title}
              {active}
              {dirty}
              uniformWidth={uniformTabWidth}
              uniformWidthPx={uniformTabWidthPx}
              allowMiddleClose
              onActivate={() => workbench.setActiveTab(tab.id)}
              onClose={() => workbench.closeTab(tab.id)}
            >
              {#snippet icon()}
                {#if tab.kind === "editor"}
                  <FileTextIcon size={14} />
                {:else if tab.kind === "terminal"}
                  <TerminalIcon size={14} />
                {:else}
                  <MonitorIcon size={14} />
                {/if}
              {/snippet}
            </ShellTabBubble>
          </div>
        {/each}
        {#if $workbench.tabs.length === 0}
          <span class="empty-hint">Open a file from the explorer or start a terminal.</span>
        {/if}
      </div>
    </div>
  </div>
</div>

{#if menuOpen}
  <div
    bind:this={menuEl}
    class="editor-actions-menu"
    role="menu"
    style="top:{menuPos.top}px;left:{menuPos.left}px"
  >
    <button type="button" class="editor-actions-item" role="menuitem" onclick={newFile}>
      <FilePlusIcon size={14} />
      <span>New file</span>
    </button>
    <button type="button" class="editor-actions-item" role="menuitem" onclick={openTerminal}>
      <TerminalIcon size={14} />
      <span>Open terminal</span>
    </button>
    <button type="button" class="editor-actions-item" role="menuitem" onclick={openBrowser}>
      <GlobeSimpleIcon size={14} />
      <span>Open browser</span>
    </button>
  </div>
{/if}

<style>
  .workbench-tab-bar-root {
    display: flex;
    flex: 1 1 0;
    min-width: 0;
    max-width: 100%;
    height: 100%;
    min-height: 0;
    align-items: center;
    box-sizing: border-box;
  }

  .editor-actions-wrap {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    padding: 0 4px;
    height: 100%;
  }

  .tab-strip-scroll-wrap {
    flex: 1 1 0;
    min-width: 0;
    height: 100%;
    display: flex;
    align-items: stretch;
  }

  .workbench-tablist-scroll {
    flex: 1 1 0;
    min-width: 0;
    height: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    box-sizing: border-box;
    display: flex;
    align-items: center;
  }

  .workbench-tablist-inner {
    display: flex;
    align-items: center;
    gap: 4px;
    box-sizing: border-box;
    width: max-content;
    min-width: 0;
    height: 100%;
    padding: 0 0 0 2px;
    border: none;
    outline: none;
    box-shadow: none;
  }

  .hdr-tab-slot {
    flex: 0 0 auto;
  }

  .empty-hint {
    flex: 0 0 auto;
    padding: 0 6px;
    font-size: 10px;
    color: var(--muted-foreground);
    white-space: nowrap;
    user-select: none;
  }

  .hdr-tab-aux-btn {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: 9999px;
    background: var(--workbench-control-bg, var(--secondary));
    color: var(--muted-foreground);
    cursor: pointer;
  }

  .hdr-tab-aux-btn:hover,
  .hdr-tab-aux-btn.active {
    background: var(--workbench-control-active-bg, var(--muted));
    color: var(--foreground);
  }

  .hdr-tab-aux-btn:focus-visible {
    outline: 1px solid var(--ring);
    outline-offset: 2px;
  }

  .editor-actions-menu {
    position: fixed;
    z-index: 9999;
    min-width: 160px;
    background: var(--popover, #1e1e1e);
    border: 1px solid var(--border, #3a3a3a);
    border-radius: 7px;
    padding: 4px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .editor-actions-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--foreground, #d4d4d4);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .editor-actions-item:hover {
    background: var(--accent, #2a2a2a);
  }

  .editor-actions-item :global(svg) {
    flex-shrink: 0;
    color: var(--muted-foreground);
  }
</style>
