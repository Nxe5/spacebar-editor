<script lang="ts">
  import FileTree from "./FileTree.svelte";
  import SearchPanel from "./SearchPanel.svelte";
  import GitPanel from "./GitPanel.svelte";
  import type { ExplorerPanelTab } from "$lib/explorerPanel";

  let { activeTab = $bindable("files" satisfies ExplorerPanelTab) } = $props<{
    activeTab?: ExplorerPanelTab;
  }>();
</script>

<div class="right-sidebar">
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
    background: var(--background);
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
  }

  .explorer-panel {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    border-radius: var(--explorer-panel-radius);
    border: 1px solid var(--explorer-panel-border);
    background: var(--explorer-panel-bg);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
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
