<script lang="ts">
  import { get } from "svelte/store";
  import { onMount, onDestroy } from "svelte";
  import { files, type FileEntry } from "$lib/stores/files";
  import { workbench, activeWorkbenchTab } from "$lib/stores/workbench";
  import {
    listDir,
    readFile,
    getWorkspacePath,
    getLanguageFromPath,
    isTauriAvailable,
    deleteEntry,
    renameEntry,
    pickWorkspaceFolder,
    listenFsChanged,
  } from "$lib/ipc";
  import {
    applyWorkspaceFolder,
    normalizeFileEntry,
    refreshWorkspaceTree,
    workspaceFolderName,
  } from "$lib/workspace";
  import { normalizeFilePath } from "$lib/fsPath";
  import { gitStatus } from "$lib/ipc";
  import { bumpGitRefresh } from "$lib/stores/gitRefresh";
  import type { GitPathStatus } from "$lib/gitTypes";
  import { gitRefresh } from "$lib/stores/gitRefresh";
  import { editorErrorCountsByRel } from "$lib/stores/editorDiagnostics";
  import { buildGitStatusByRelPath } from "$lib/explorer/treeGitDecorations";
  import FileTreeRow from "./FileTreeRow.svelte";

  let loading = $state(true);
  let error = $state<string | null>(null);
  let desktopAvailable = $state(isTauriAvailable());
  let highlightPath = $state<string | null>(null);
  let selectedPath = $state<string | null>(null);
  /** Skip redundant reveal work when the active editor path did not change. */
  let lastRevealedPath = $state<string | null>(null);
  let gitRows = $state<GitPathStatus[]>([]);
  let ctxMenu = $state<{ x: number; y: number; entry: FileEntry } | null>(null);
  let unlistenFsChanged: (() => void) | null = null;

  const gitByRel = $derived(buildGitStatusByRelPath(gitRows));

  const openFilePaths = $derived(
    $workbench.tabs
      .filter((t) => t.kind === "editor")
      .map((t) => normalizeFilePath(t.path))
  );

  async function refreshGitStatus() {
    const ws = get(files).workspacePath;
    if (!ws || !desktopAvailable) {
      gitRows = [];
      return;
    }
    try {
      gitRows = await gitStatus(ws);
    } catch {
      gitRows = [];
    }
  }

  $effect(() => {
    void $files.workspacePath;
    void $gitRefresh;
    void refreshGitStatus();
  });

  async function reloadWorkspaceTree() {
    const ws = get(files).workspacePath;
    if (!ws || !desktopAvailable) return;
    try {
      await refreshWorkspaceTree(ws);
    } catch (e) {
      console.error(e);
    }
  }

  async function openWorkspaceFolder() {
    if (!desktopAvailable) return;
    try {
      const path = await pickWorkspaceFolder();
      if (!path) return;
      await applyWorkspaceFolder(path);
      error = null;
    } catch (e) {
      error = String(e);
    }
  }

  function findEntry(entries: FileEntry[], path: string): FileEntry | null {
    const key = normalizeFilePath(path);
    for (const entry of entries) {
      if (normalizeFilePath(entry.path) === key) return entry;
      if (entry.children) {
        const found = findEntry(entry.children, path);
        if (found) return found;
      }
    }
    return null;
  }

  async function revealPathInTree(absPath: string) {
    const ws = get(files).workspacePath?.replace(/\/$/, "") ?? "";
    if (!ws || !absPath.startsWith(ws)) return;
    highlightPath = normalizeFilePath(absPath);
    const rel = normalizeFilePath(absPath).slice(ws.length).replace(/^\//, "");
    const parts = rel.split("/").filter(Boolean);
    let prefix = ws;
    for (let i = 0; i < parts.length - 1; i++) {
      prefix = `${prefix}/${parts[i]}`;
      const existing = findEntry(get(files).tree, prefix);
      if (existing?.expanded && existing.children) continue;
      try {
        const raw = await listDir(prefix);
        const children = raw.map((c) => normalizeFileEntry(c as FileEntry & { isDir?: boolean }));
        files.setChildren(prefix, children);
      } catch {
        return;
      }
    }
  }

  $effect(() => {
    const tab = $activeWorkbenchTab;
    if (tab?.kind !== "editor") return;
    const path = normalizeFilePath(tab.path);
    if (path === lastRevealedPath) return;
    lastRevealedPath = path;
    void revealPathInTree(path);
  });

  function onRowContext(entry: FileEntry, x: number, y: number) {
    ctxMenu = { x, y, entry };
  }

  function closeCtx() {
    ctxMenu = null;
  }

  async function ctxDelete() {
    const e = ctxMenu?.entry;
    closeCtx();
    if (!e || e.is_dir || !desktopAvailable) return;
    if (!confirm(`Delete “${e.name}”? This cannot be undone.`)) return;
    try {
      await deleteEntry(e.path);
      await reloadWorkspaceTree();
      bumpGitRefresh();
    } catch (err) {
      console.error(err);
    }
  }

  async function ctxRename() {
    const e = ctxMenu?.entry;
    closeCtx();
    if (!e || e.is_dir || !desktopAvailable) return;
    const next = window.prompt("New file name", e.name);
    if (!next || next === e.name) return;
    const parent = e.path.slice(0, -e.name.length).replace(/\/$/, "");
    const dest = parent ? `${parent}/${next}` : next;
    try {
      await renameEntry(e.path, dest);
      await reloadWorkspaceTree();
      bumpGitRefresh();
    } catch (err) {
      console.error(err);
    }
  }

  onMount(async () => {
    desktopAvailable = isTauriAvailable();
    if (!desktopAvailable) {
      loading = false;
      return;
    }

    try {
      const workspace = await getWorkspacePath();
      if (workspace) {
        await applyWorkspaceFolder(workspace);
      }
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }

    try {
      unlistenFsChanged = await listenFsChanged(() => {
        void reloadWorkspaceTree();
        bumpGitRefresh();
      });
    } catch (e) {
      console.error("Failed to subscribe to fs:changed:", e);
    }
  });

  onDestroy(() => {
    unlistenFsChanged?.();
    unlistenFsChanged = null;
  });

  async function handleToggle(entry: FileEntry) {
    if (!entry.is_dir) return;

    if (entry.expanded && entry.children) {
      files.toggleExpanded(entry.path);
    } else {
      try {
        const raw = await listDir(entry.path);
        const children = raw.map((c) => normalizeFileEntry(c as FileEntry & { isDir?: boolean }));
        files.setChildren(entry.path, children);
      } catch (e) {
        console.error("Failed to list directory:", e);
      }
    }
  }

  async function handleActivate(entry: FileEntry) {
    selectedPath = normalizeFilePath(entry.path);
    if (entry.is_dir) {
      await handleToggle(entry);
      return;
    }

    const path = normalizeFilePath(entry.path);
    highlightPath = path;
    lastRevealedPath = path;

    try {
      const content = await readFile(entry.path);
      workbench.openEditorFile({
        path: entry.path,
        name: entry.name,
        content,
        isDirty: false,
        language: getLanguageFromPath(entry.path),
      });
    } catch (e) {
      console.error("Failed to read file:", e);
    }
  }

  let workspaceLabel = $derived(
    $files.workspacePath ? workspaceFolderName($files.workspacePath) : null
  );
</script>

<svelte:window onpointerdown={closeCtx} />

<div class="file-tree">
  {#if loading}
    <div class="loading">Loading files...</div>
  {:else if !desktopAvailable}
    <div class="tree-prompt">
      <p class="prompt-title">Desktop app required</p>
      <p class="hint">
        File access, the explorer, tools, and the editor need the Tauri shell. Run:
      </p>
      <code class="cmd">pnpm tauri dev</code>
      <p class="hint">Opening <code>http://127.0.0.1:14200</code> in a browser alone will not load your project files.</p>
    </div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if !$files.workspacePath}
    <div class="tree-prompt">
      <p class="prompt-title">No folder open</p>
      <p class="hint">Open your project root — tools and the agent use this path as cwd.</p>
      <button type="button" class="open-folder-btn" onclick={() => void openWorkspaceFolder()}>
        Open folder…
      </button>
    </div>
  {:else}
    <div class="workspace-header" title={$files.workspacePath}>
      <span class="workspace-label">{workspaceLabel}</span>
    </div>
    <div class="tree-content">
      {#if $files.tree.length === 0}
        <p class="tree-empty">Workspace has no visible files.</p>
      {:else}
        {#each $files.tree as entry (entry.path)}
          <FileTreeRow
            {entry}
            depth={0}
            workspacePath={$files.workspacePath}
            onActivate={handleActivate}
            highlightPath={highlightPath}
            {selectedPath}
            {gitByRel}
            {openFilePaths}
            errorCountByRel={$editorErrorCountsByRel}
            onContextMenu={onRowContext}
          />
        {/each}
      {/if}
    </div>
  {/if}
  {#if ctxMenu}
    <div
      class="ctx-menu"
      style="left: {ctxMenu.x}px; top: {ctxMenu.y}px;"
      role="menu"
      tabindex="0"
      onpointerdown={(e) => e.stopPropagation()}
    >
      {#if !ctxMenu.entry.is_dir}
        <button type="button" class="ctx-item" onclick={() => void ctxRename()}>Rename…</button>
        <button type="button" class="ctx-item danger" onclick={() => void ctxDelete()}>Delete</button>
      {:else}
        <span class="ctx-muted">Folder actions — soon</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .file-tree {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    width: 100%;
    background-color: var(--explorer-panel-bg, var(--workbench-panel-bg, var(--sidebar)));
    color: var(--sidebar-foreground);
    overflow: hidden;
  }

  .workspace-header {
    flex-shrink: 0;
    padding: 6px 12px 4px;
    border-bottom: 1px solid color-mix(in srgb, var(--sidebar-border, var(--border)) 55%, transparent);
    font-size: calc(var(--explorer-font-size, 12px) - 1px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .workspace-label {
    color: var(--foreground);
  }

  .loading,
  .error,
  .tree-prompt {
    flex: 1;
    min-height: 0;
    padding: 16px;
    color: var(--muted-foreground);
    font-size: 13px;
    background-color: inherit;
  }

  .error {
    color: var(--destructive);
  }

  .tree-prompt {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .prompt-title {
    margin: 0;
    font-weight: 600;
    color: var(--foreground);
  }

  .hint {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
  }

  .cmd {
    display: block;
    padding: 8px 10px;
    border-radius: 6px;
    background: var(--muted);
    font-family: ui-monospace, monospace;
    font-size: 12px;
    color: var(--foreground);
  }

  .tree-prompt code {
    font-size: 11px;
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--muted);
  }

  .open-folder-btn {
    margin-top: 4px;
    padding: 6px 12px;
    border: 1px solid var(--sidebar-border, var(--border));
    border-radius: 6px;
    background: var(--secondary);
    color: var(--foreground);
    font-size: 12px;
    cursor: pointer;
    align-self: flex-start;
  }

  .open-folder-btn:hover {
    background: var(--muted);
  }

  .tree-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 4px 0 8px;
  }

  .tree-empty {
    margin: 12px 16px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--muted-foreground);
  }

  .ctx-menu {
    position: fixed;
    z-index: 50;
    min-width: 140px;
    background: var(--popover, var(--sidebar));
    border: 1px solid var(--sidebar-border);
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
    padding: 4px;
    font-size: 12px;
  }

  .ctx-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 6px 10px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .ctx-item:hover {
    background: var(--sidebar-accent);
  }

  .ctx-item.danger {
    color: var(--destructive, #f87171);
  }

  .ctx-muted {
    display: block;
    padding: 6px 10px;
    color: var(--muted-foreground);
  }
</style>
