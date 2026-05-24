<script lang="ts">
  import FileTree from "./FileTree.svelte";
  import GitPanel from "./GitPanel.svelte";
  import PromptPanel from "./PromptPanel.svelte";
  import Files from "@lucide/svelte/icons/files";
  import GitBranch from "@lucide/svelte/icons/git-branch";
  import ScrollText from "@lucide/svelte/icons/scroll-text";
  import FolderOpen from "@lucide/svelte/icons/folder-open";
  import Settings from "@lucide/svelte/icons/settings";

  type Tab = "files" | "git" | "prompt";
  let activeTab = $state<Tab>("files");

  let {
    dockedOnly = false,
    onRequestExpand,
    onOpenWorkspace,
    onOpenSettings,
    /** Synced to shell so the aside width matches the activity strip when the tree/search pane is closed. */
    secondaryOpen = $bindable(true),
  } = $props<{
    dockedOnly?: boolean;
    onRequestExpand?: () => void;
    onOpenWorkspace?: () => void;
    onOpenSettings?: () => void;
    secondaryOpen?: boolean;
  }>();

  const tabs: { id: Tab; title: string }[] = [
    { id: "files", title: "Explorer" },
    { id: "git", title: "Git" },
    { id: "prompt", title: "System Prompt" },
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
        {:else if activeTab === "git"}
          <GitPanel />
        {:else if activeTab === "prompt"}
          <PromptPanel />
        {/if}
      </div>
    </div>
  {/if}

  <!-- Activity strip: always rendered; stays visible when the secondary pane is collapsed. -->
  <div class="sidebar-icons" role="toolbar" aria-label="Right activity bar">
    <div class="sidebar-icons__main">
      {#each tabs as tab}
        <button
          type="button"
          class="icon-btn workbench-icon-btn"
          class:active={dockedOnly ? activeTab === tab.id : secondaryOpen && activeTab === tab.id}
          aria-pressed={dockedOnly ? activeTab === tab.id : secondaryOpen && activeTab === tab.id}
          onclick={() => onIconClick(tab.id)}
          title={tab.title}
        >
          {#if tab.id === "files"}
            <Files size={18} strokeWidth={1.75} aria-hidden="true" />
          {:else if tab.id === "git"}
            <GitBranch size={18} strokeWidth={1.75} aria-hidden="true" />
          {:else if tab.id === "prompt"}
            <ScrollText size={18} strokeWidth={1.75} aria-hidden="true" />
          {/if}
        </button>
      {/each}
    </div>
    <div class="sidebar-icons__footer" role="group" aria-label="Workspace and settings">
      <button
        type="button"
        class="icon-btn workbench-icon-btn"
        title="Open workspace folder (explorer + new terminals)"
        onclick={() => onOpenWorkspace?.()}
      >
        <FolderOpen size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <button type="button" class="icon-btn workbench-icon-btn" title="Settings" onclick={() => onOpenSettings?.()}>
        <Settings size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
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
    min-height: 0;
    height: 100%;
    box-sizing: border-box;
    background: var(--activity-bar-bg);
    border-left: 1px solid var(--activity-bar-border);
  }

  .sidebar-icons__main {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .sidebar-icons__footer {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    margin-top: auto;
    border-top: 1px solid var(--activity-bar-border);
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 36px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
  }

  .icon-btn.workbench-icon-btn {
    width: var(--workbench-icon-btn-size);
    height: var(--workbench-icon-btn-size);
    margin-inline: auto;
  }

  .content-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

</style>
