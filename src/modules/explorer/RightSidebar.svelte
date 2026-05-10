<script lang="ts">
  import FileTree from "./FileTree.svelte";
  import SourceControl from "./SourceControl.svelte";
  import FolderTree from "@lucide/svelte/icons/folder-tree";
  import GitBranch from "@lucide/svelte/icons/git-branch";

  type Tab = "files" | "source-control";
  let activeTab = $state<Tab>("files");

  let {
    dockedOnly = false,
    onRequestExpand,
    /** Synced to shell so the aside width matches the activity strip when the tree/search pane is closed. */
    secondaryOpen = $bindable(true),
  } = $props<{
    dockedOnly?: boolean;
    onRequestExpand?: () => void;
    secondaryOpen?: boolean;
  }>();

  const tabs: { id: Tab; title: string }[] = [
    { id: "files", title: "Explorer" },
    { id: "source-control", title: "Source Control" },
  ];

  function onIconClick(tab: Tab) {
    if (dockedOnly) {
      activeTab = tab;
      secondaryOpen = true;
      onRequestExpand?.();
      return;
    }
    if (activeTab === tab && secondaryOpen) {
      secondaryOpen = false;
      return;
    }
    activeTab = tab;
    secondaryOpen = true;
  }
</script>

<div class="right-sidebar" class:right-sidebar--dock={dockedOnly}>
  {#if secondaryOpen && !dockedOnly}
    <div class="sidebar-secondary">
      <div class="content-body">
        {#if activeTab === "files"}
          <FileTree />
        {:else if activeTab === "source-control"}
          <SourceControl />
        {/if}
      </div>
    </div>
  {/if}

  <!-- Activity strip: always rendered; stays visible when the secondary pane is collapsed. -->
  <div class="sidebar-icons" role="toolbar" aria-label="Right activity bar">
    {#each tabs as tab}
      <button
        type="button"
        class="icon-btn"
        class:active={dockedOnly ? activeTab === tab.id : secondaryOpen && activeTab === tab.id}
        aria-pressed={dockedOnly ? activeTab === tab.id : secondaryOpen && activeTab === tab.id}
        onclick={() => onIconClick(tab.id)}
        title={tab.title}
      >
        {#if tab.id === "files"}
          <FolderTree class="acc-icon" aria-hidden="true" />
        {:else}
          <GitBranch class="acc-icon" aria-hidden="true" />
        {/if}
      </button>
    {/each}
  </div>
</div>

<style>
  .right-sidebar {
    display: flex;
    flex-direction: row;
    flex: 1;
    min-height: 0;
    min-width: 0;
    width: 100%;
    max-width: 100%;
    height: 100%;
    align-self: stretch;
    align-items: stretch;
  }

  .right-sidebar--dock {
    flex: 1 1 auto;
    min-height: 0;
  }

  .right-sidebar:not(:has(.sidebar-secondary)) .sidebar-icons {
    margin-left: auto;
  }

  .sidebar-secondary {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--sidebar);
    border-left: 1px solid transparent;
  }

  .sidebar-icons {
    display: flex;
    flex-direction: column;
    flex: 0 0 auto;
    flex-shrink: 0;
    align-self: stretch;
    width: 34px;
    min-width: 34px;
    max-width: 34px;
    box-sizing: border-box;
    background: var(--activity-bar-bg);
    padding: 4px 0;
    gap: 2px;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    margin: 0 auto;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
    flex-shrink: 0;
  }

  .icon-btn :global(.acc-icon) {
    display: flex;
    color: var(--activity-bar-fg);
  }

  .icon-btn :global(svg) {
    width: 15px;
    height: 15px;
  }

  .icon-btn:hover :global(.acc-icon) {
    color: var(--activity-bar-active);
  }

  .icon-btn.active :global(.acc-icon) {
    color: #ffffff;
  }

  .icon-btn:focus-visible {
    outline: 1px solid var(--ring);
    outline-offset: -2px;
  }

  .content-body {
    flex: 1;
    overflow: auto;
    min-height: 0;
    border: none;
    outline: none;
    box-shadow: none;
  }

  .content-body :global(.file-tree) {
    width: 100%;
    border-right: none;
  }
</style>
