<script lang="ts">
  import type { FileEntry } from "$lib/stores/files";
  import type { GitPathStatus } from "$lib/gitTypes";
  import { normalizeFilePath } from "$lib/fsPath";
  import {
    fileGitBadge,
    fileGitTone,
    folderTreeTone,
    relPathFromWorkspace,
    type FolderTreeTone,
  } from "$lib/explorer/treeGitDecorations";
  import FileTreeRow from "./FileTreeRow.svelte";
  import FileIcon from "$lib/components/FileIcon.svelte";

  interface Props {
    entry: FileEntry;
    depth: number;
    workspacePath: string | null;
    onActivate: (entry: FileEntry) => void | Promise<void>;
    highlightPath?: string | null;
    selectedPath?: string | null;
    gitByRel?: Map<string, GitPathStatus>;
    openFilePaths?: string[];
    errorCountByRel?: Map<string, number>;
    onContextMenu?: (entry: FileEntry, clientX: number, clientY: number) => void;
  }

  let {
    entry,
    depth,
    workspacePath,
    onActivate,
    highlightPath = null,
    selectedPath = null,
    gitByRel = new Map(),
    openFilePaths = [],
    errorCountByRel = new Map(),
    onContextMenu,
  }: Props = $props();

  const normPath = $derived(normalizeFilePath(entry.path));
  const isHighlighted = $derived(
    highlightPath != null && normPath === normalizeFilePath(highlightPath)
  );
  const isSelected = $derived(
    selectedPath != null && normPath === normalizeFilePath(selectedPath)
  );
  const isActive = $derived(isHighlighted || isSelected);

  const relPath = $derived(
    workspacePath ? relPathFromWorkspace(workspacePath, entry.path) : null
  );
  const gitRow = $derived(relPath ? gitByRel.get(relPath) : undefined);
  const gitBadge = $derived(entry.is_dir ? null : fileGitBadge(gitRow));
  const gitTone = $derived(entry.is_dir ? null : fileGitTone(gitRow));

  const folderDeco = $derived(
    entry.is_dir && workspacePath
      ? folderTreeTone(entry.path, gitByRel, workspacePath, openFilePaths, errorCountByRel)
      : { tone: null as FolderTreeTone, errorCount: 0 }
  );
</script>

<div class="tree-row">
  <button
    type="button"
    class="tree-button"
    class:is-dir={entry.is_dir}
    class:active={isActive}
    class:tone-open={folderDeco.tone === "open"}
    class:tone-untracked={folderDeco.tone === "untracked"}
    class:tone-modified={folderDeco.tone === "modified"}
    class:tone-error={folderDeco.tone === "error"}
    class:file-modified={gitTone === "modified"}
    class:file-untracked={gitTone === "untracked"}
    onclick={() => void onActivate(entry)}
    oncontextmenu={(e) => {
      e.preventDefault();
      onContextMenu?.(entry, e.clientX, e.clientY);
    }}
  >
    <span class="tree-button-inner" style="padding-left: {depth * 16 + 8}px">
      <FileIcon name={entry.name} isDir={entry.is_dir} expanded={entry.expanded ?? false} />
      <span class="name">{entry.name}</span>
      {#if gitBadge}
        <span class="git-badge" title="Git {gitBadge}">{gitBadge}</span>
      {/if}
      {#if entry.is_dir && folderDeco.errorCount > 0}
        <span class="error-count" title="{folderDeco.errorCount} error(s)">{folderDeco.errorCount}</span>
      {/if}
    </span>
  </button>
</div>
{#if entry.is_dir && entry.expanded && entry.children}
  {#each entry.children as child (child.path)}
    <FileTreeRow
      entry={child}
      depth={depth + 1}
      {workspacePath}
      {onActivate}
      {highlightPath}
      {selectedPath}
      {gitByRel}
      {openFilePaths}
      {errorCountByRel}
      {onContextMenu}
    />
  {/each}
{/if}

<style>
  .tree-row {
    display: block;
    width: 100%;
  }

  .tree-button {
    display: block;
    width: 100%;
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--sidebar-foreground);
    font-size: var(--explorer-font-size, 12px);
    line-height: calc(var(--explorer-font-size, 12px) + 10px);
    cursor: pointer;
    text-align: left;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .tree-button-inner {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    min-width: 0;
    padding-top: 1px;
    padding-bottom: 1px;
    padding-right: 8px;
    box-sizing: border-box;
  }

  .tree-button:hover {
    background: var(--sidebar-accent);
  }

  .tree-button.active {
    background: var(--explorer-selection-bg, #2a2a2a);
  }

  .tree-button.is-dir {
    color: var(--muted-foreground);
  }

  .tree-button.tone-open.is-dir {
    color: var(--explorer-folder-open, #d4a656);
  }

  .tree-button.tone-untracked.is-dir {
    color: var(--explorer-folder-untracked, #6b9bd1);
  }

  .tree-button.tone-modified.is-dir {
    color: var(--explorer-folder-modified, #c9a227);
  }

  .tree-button.tone-error.is-dir {
    color: var(--explorer-folder-error, #e34671);
  }

  .tree-button.file-modified:not(.is-dir) {
    color: var(--explorer-file-modified, #d4a656);
  }

  .tree-button.file-untracked:not(.is-dir) {
    color: var(--explorer-file-untracked, #6b9bd1);
  }

  .tree-button :global(.codicon),
  .tree-button :global(.file-icon-img) {
    font-size: var(--explorer-icon-size, 15px);
    width: calc(var(--explorer-icon-size, 15px) + 2px);
    height: calc(var(--explorer-icon-size, 15px) + 2px);
    flex-shrink: 0;
    color: inherit;
  }

  .tree-button:not(.is-dir) :global(.codicon) {
    opacity: 0.9;
  }

  .name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .git-badge {
    flex: 0 0 auto;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.02em;
    opacity: 0.85;
    margin-left: 4px;
  }

  .error-count {
    flex: 0 0 auto;
    min-width: 1.1rem;
    padding: 0 4px;
    border-radius: 8px;
    font-size: 10px;
    font-weight: 600;
    line-height: 1.35;
    text-align: center;
    color: var(--explorer-folder-error, #e34671);
    background: color-mix(in srgb, var(--explorer-folder-error, #e34671) 18%, transparent);
  }
</style>
