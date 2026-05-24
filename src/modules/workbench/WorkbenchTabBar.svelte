<script lang="ts">
  import { workbench } from "$lib/stores/workbench";
  import { files } from "$lib/stores/files";
  import { normalizeFilePath } from "$lib/fsPath";
  import { tabStripScroll } from "$lib/actions/scrollOverflow";
  import ShellTabBubble from "./ShellTabBubble.svelte";
  import FileTextIcon from "phosphor-svelte/lib/FileTextIcon";
  import TerminalIcon from "phosphor-svelte/lib/TerminalIcon";
  import MonitorIcon from "phosphor-svelte/lib/MonitorIcon";
</script>

<div class="workbench-tab-bar-root">
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

<style>
  .workbench-tab-bar-root {
    display: flex;
    flex: 1 1 0;
    min-width: 0;
    max-width: calc(100% - var(--workbench-window-drag-pad, 96px));
    height: 100%;
    min-height: 0;
    align-items: stretch;
    box-sizing: border-box;
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

</style>
