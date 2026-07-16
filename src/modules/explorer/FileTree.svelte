<script lang="ts">
  import { get } from "svelte/store";
  import { onMount, onDestroy } from "svelte";
  import { files, type FileEntry } from "$lib/stores/files";
  import { workbench, activeWorkbenchTab } from "$lib/stores/workbench";
  import {
    getLaunchArgs,
    listDir,
    readFile,
    getLanguageFromPath,
    isTauriAvailable,
    deleteEntry,
    renameEntry,
    pickWorkspaceFolder,
    listenFsChanged,
    writeFile,
    createDir,
  } from "$lib/ipc";
  import { refreshDirectoryInTree } from "$lib/filesystemSync";
  import { layoutOverride } from "$lib/stores/layoutOverride";
  import {
    anySubfolderExpanded,
    applyWorkspaceFolder,
    normalizeFileEntry,
    refreshWorkspaceTree,
    workspaceFolderName,
  } from "$lib/workspace";
  import AppIcon from "$lib/components/AppIcon.svelte";
  import { openGitDiffFile } from "$lib/git/openChangedFile";
  import { relPathFromWorkspace } from "$lib/explorer/treeGitDecorations";
  import { normalizeFilePath } from "$lib/fsPath";
  import { gitStatus } from "$lib/ipc";
  import { bumpGitRefresh } from "$lib/stores/gitRefresh";
  import type { GitPathStatus } from "$lib/gitTypes";
  import { gitRefresh } from "$lib/stores/gitRefresh";
  import { editorErrorCountsByRel } from "$lib/stores/editorDiagnostics";
  import { buildGitStatusByRelPath } from "$lib/explorer/treeGitDecorations";
  import FileTreeRow from "./FileTreeRow.svelte";
  import FilePlus from "@lucide/svelte/icons/file-plus";
  import FolderPlus from "@lucide/svelte/icons/folder-plus";
  import ExplorerNamePrompt, { type ExplorerNamePromptKind } from "./ExplorerNamePrompt.svelte";

  let loading = $state(true);
  let error = $state<string | null>(null);
  let desktopAvailable = $state(isTauriAvailable());
  let highlightPath = $state<string | null>(null);
  let selectedPath = $state<string | null>(null);
  /** Skip redundant reveal work when the active editor path did not change.
   * Plain variable (not $state) so writing it in handleActivate does not
   * re-trigger the $effect that reads it — avoiding a race where the effect
   * fires with the stale $activeWorkbenchTab before openEditorFile updates it. */
  let lastRevealedPath: string | null = null;
  let gitRows = $state<GitPathStatus[]>([]);
  let ctxMenu = $state<{ x: number; y: number; entry: FileEntry } | null>(null);
  let namePrompt = $state<{ kind: ExplorerNamePromptKind; parent: string } | null>(null);
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
        const raw = await listDir(null, prefix);
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
      await deleteEntry(null, e.path);
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
      await renameEntry(null, e.path, dest);
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
      // CLI launch: `sidebar <file>` or `sidebar <dir>` takes priority over
      // the persisted workspace override.
      const launch = await getLaunchArgs();

      if (launch.path && launch.is_file) {
        // File mode: open the file's parent directory as workspace, then open
        // the file in the editor, and collapse all panels (focus-on-file mode).
        const filePath = launch.path;
        const parentDir = filePath.split("/").slice(0, -1).join("/") || "/";
        await applyWorkspaceFolder(parentDir);
        const content = await readFile(null, filePath);
        workbench.openEditorFile({
          path: filePath,
          name: filePath.split("/").pop() ?? filePath,
          content,
          isDirty: false,
          language: getLanguageFromPath(filePath),
        });
        // Signal WorkbenchShell to collapse all surrounding panes.
        layoutOverride.set({ showLeftPanel: false, showRightPanel: false, showBottomPanel: false, showTabStrip: false });
      } else if (launch.path && !launch.is_file) {
        // Directory mode: open the given folder directly.
        await applyWorkspaceFolder(launch.path);
      }
      // No CLI argument → stay at welcome screen; user picks a folder manually.
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
        const raw = await listDir(null, entry.path);
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

    // If the file has tracked modifications, open with the green/red diff overlay.
    const ws = get(files).workspacePath;
    const rel = ws ? relPathFromWorkspace(ws, entry.path) : null;
    const row = rel ? gitByRel.get(rel) : undefined;
    const tracked = row && row.worktree !== "??" && row.index !== "??";
    const hasChanges = tracked && (row.worktree.includes("M") || row.index.includes("M"));

    try {
      if (ws && rel && hasChanges) {
        await openGitDiffFile(ws, rel);
      } else {
        const content = await readFile(null, entry.path);
        workbench.openEditorFile({
          path: entry.path,
          name: entry.name,
          content,
          isDirty: false,
          language: getLanguageFromPath(entry.path),
        });
      }
    } catch (e) {
      console.error("Failed to read file:", e);
    }
  }

  function parentDir(filePath: string): string {
    const p = normalizeFilePath(filePath);
    const idx = p.lastIndexOf("/");
    if (idx <= 0) return p;
    return p.slice(0, idx) || "/";
  }

  /** Parent directory for new file/folder: selected folder, or parent of selected file, else workspace root. */
  function targetDirectory(): string | null {
    const ws = get(files).workspacePath;
    if (!ws) return null;
    if (!selectedPath) return normalizeFilePath(ws);
    const entry = findEntry(get(files).tree, selectedPath);
    if (!entry) return normalizeFilePath(ws);
    if (entry.is_dir) return normalizeFilePath(entry.path);
    return parentDir(entry.path);
  }

  function collapseAllSubfolders() {
    const ws = get(files).workspacePath;
    if (!ws) return;
    files.collapseAllSubfolders(ws);
  }

  async function expandAllSubfolders() {
    const ws = get(files).workspacePath;
    if (!ws) return;
    const rootPath = normalizeFilePath(ws);

    async function expandDir(dirPath: string): Promise<void> {
      const entry = findEntry(get(files).tree, dirPath);
      if (!entry?.is_dir) return;
      if (!entry.expanded || !entry.children?.length) {
        try {
          const raw = await listDir(null, dirPath);
          const children = raw.map((c) => normalizeFileEntry(c as FileEntry & { isDir?: boolean }));
          files.setChildren(dirPath, children);
        } catch (e) {
          console.error("Failed to expand directory:", e);
          return;
        }
      }
      const updated = findEntry(get(files).tree, dirPath);
      if (!updated?.children) return;
      for (const child of updated.children) {
        if (child.is_dir) await expandDir(child.path);
      }
    }

    const root = findEntry(get(files).tree, rootPath);
    if (!root) {
      for (const entry of get(files).tree) {
        if (entry.is_dir) await expandDir(entry.path);
      }
      return;
    }

    if (!root.expanded || !root.children?.length) {
      try {
        const raw = await listDir(null, rootPath);
        const children = raw.map((c) => normalizeFileEntry(c as FileEntry & { isDir?: boolean }));
        files.setChildren(rootPath, children);
      } catch (e) {
        console.error("Failed to list workspace root:", e);
        return;
      }
    }

    const freshRoot = findEntry(get(files).tree, rootPath);
    for (const child of freshRoot?.children ?? []) {
      if (child.is_dir) await expandDir(child.path);
    }
  }

  function toggleAllSubfolders() {
    if (subfoldersExpanded) collapseAllSubfolders();
    else void expandAllSubfolders();
  }

  function openNamePrompt(kind: ExplorerNamePromptKind) {
    const parent = targetDirectory();
    if (!parent || !desktopAvailable) return;
    namePrompt = { kind, parent };
  }

  function closeNamePrompt() {
    namePrompt = null;
  }

  async function confirmNamePrompt(name: string) {
    const prompt = namePrompt;
    closeNamePrompt();
    if (!prompt) return;
    const path = `${prompt.parent}/${name}`;
    try {
      if (prompt.kind === "file") {
        await writeFile(null, path, "");
        await refreshDirectoryInTree(prompt.parent);
        bumpGitRefresh();
        selectedPath = normalizeFilePath(path);
        highlightPath = selectedPath;
        workbench.openEditorFile({
          path,
          name,
          content: "",
          isDirty: false,
          language: getLanguageFromPath(path),
        });
      } else {
        await createDir(null, path);
        await refreshDirectoryInTree(prompt.parent);
        bumpGitRefresh();
        selectedPath = normalizeFilePath(path);
        highlightPath = selectedPath;
        await revealPathInTree(path);
      }
    } catch (e) {
      console.error(e);
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function createNewFile() {
    openNamePrompt("file");
  }

  function createNewFolder() {
    openNamePrompt("folder");
  }

  let workspaceLabel = $derived(
    $files.workspacePath ? workspaceFolderName($files.workspacePath) : null
  );

  let subfoldersExpanded = $derived(
    $files.workspacePath != null &&
      anySubfolderExpanded($files.tree, $files.workspacePath)
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
      <div class="workspace-actions" role="toolbar" aria-label="Explorer actions">
        <button
          type="button"
          class="header-action"
          title={subfoldersExpanded ? "Collapse all folders" : "Expand all folders"}
          aria-label={subfoldersExpanded ? "Collapse all folders" : "Expand all folders"}
          onclick={() => toggleAllSubfolders()}
        >
          <AppIcon name={subfoldersExpanded ? "minus-square" : "plus-square"} size={14} />
        </button>
        <button
          type="button"
          class="header-action"
          title="New file"
          aria-label="New file"
          onclick={() => createNewFile()}
        >
          <FilePlus size={14} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button
          type="button"
          class="header-action"
          title="New folder"
          aria-label="New folder"
          onclick={() => createNewFolder()}
        >
          <FolderPlus size={14} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
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

<ExplorerNamePrompt
  open={namePrompt != null}
  kind={namePrompt?.kind ?? "file"}
  parentPath={namePrompt?.parent ?? ""}
  workspacePath={$files.workspacePath}
  onConfirm={(name) => void confirmNamePrompt(name)}
  onCancel={closeNamePrompt}
/>

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
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 6px 4px 12px;
    font-size: calc(var(--explorer-font-size, 12px) - 1px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted-foreground);
    min-width: 0;
  }

  .workspace-label {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--foreground);
  }

  .workspace-actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 1px;
  }

  .header-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
  }

  .header-action:hover {
    background: var(--sidebar-accent);
    color: var(--foreground);
  }

  .header-action:focus-visible {
    outline: 2px solid var(--ring, var(--primary));
    outline-offset: 1px;
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
