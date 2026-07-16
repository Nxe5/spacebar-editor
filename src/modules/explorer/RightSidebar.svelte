<script lang="ts">
  import FileTree from "./FileTree.svelte";
  import SearchPanel from "./SearchPanel.svelte";
  import GitPanel from "./GitPanel.svelte";
  import AppIcon from "$lib/components/AppIcon.svelte";
  import { EXPLORER_PANEL_TABS, type ExplorerPanelTab } from "$lib/explorerPanel";

  let {
    activeTab = $bindable("files" satisfies ExplorerPanelTab),
    onTabSelect,
  } = $props<{
    activeTab?: ExplorerPanelTab;
    onTabSelect?: (tab: ExplorerPanelTab) => void;
  }>();
</script>

<div class="right-sidebar">
  <div class="right-sidebar-tabs" role="toolbar" aria-label="Explorer panels">
    {#each EXPLORER_PANEL_TABS as tab (tab.id)}
      <button
        type="button"
        class="status-toggle workbench-icon-btn"
        class:active={activeTab === tab.id}
        aria-pressed={activeTab === tab.id}
        title={tab.title}
        aria-label={tab.title}
        onclick={() => onTabSelect?.(tab.id)}
      >
        <AppIcon name={tab.icon} size={16} />
      </button>
    {/each}
  </div>
  <div class="sidebar-secondary">
    <div class="explorer-panel">
      <div class="content-body">
        {#if activeTab === "files"}
          <FileTree />
        {:else if activeTab === "search"}
          <SearchPanel />
        {:else if activeTab === "git"}
          <GitPanel />
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .right-sidebar {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    min-width: 0;
    width: 100%;
    height: 100%;
    background: var(--workbench-shell-bg, var(--background));
  }

  .right-sidebar-tabs {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    flex-shrink: 0;
    padding: 6px var(--workbench-edge-inset) 0;
    border-left: 1px solid var(--explorer-panel-border);
  }

  .sidebar-secondary {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-sizing: border-box;
    padding: var(--explorer-panel-inset-block-top) var(--workbench-edge-inset)
      var(--explorer-panel-inset-block-bottom);
    background: transparent;
    border: none;
    border-left: 1px solid var(--explorer-panel-border);
    border-radius: 0;
  }

  .explorer-panel {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    background: var(--explorer-panel-bg);
  }

  .content-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: inherit;
  }

  .explorer-panel :global(.file-tree),
  .explorer-panel :global(.search-panel),
  .explorer-panel :global(.git-panel) {
    border-radius: inherit;
    background: var(--explorer-panel-bg);
  }
</style>
