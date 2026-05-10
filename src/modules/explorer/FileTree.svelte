<script lang="ts">
  import { onMount } from "svelte";
  import { files, type FileEntry } from "$lib/stores/files";
  import { workbench } from "$lib/stores/workbench";
  import { listDir, readFile, getWorkspacePath, getLanguageFromPath, isTauriAvailable } from "$lib/ipc";
  import { applyWorkspaceFolder, normalizeFileEntry } from "$lib/workspace";
  import FileTreeRow from "./FileTreeRow.svelte";

  let loading = $state(true);
  let error = $state<string | null>(null);
  let browserMode = $state(false);

  onMount(async () => {
    if (!isTauriAvailable()) {
      browserMode = true;
      loading = false;
      return;
    }

    try {
      const workspace = await getWorkspacePath();
      await applyWorkspaceFolder(workspace);
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
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
    if (entry.is_dir) {
      await handleToggle(entry);
      return;
    }

    try {
      const content = await readFile(entry.path);
      files.openFile({
        path: entry.path,
        name: entry.name,
        content,
        isDirty: false,
        language: getLanguageFromPath(entry.path),
      });
      workbench.ensureEditorTab(entry.path, entry.name);
      workbench.syncFromOpenFiles();
    } catch (e) {
      console.error("Failed to read file:", e);
    }
  }

  /** VS Code / Cursor codicon names for the explorer tree. */
  function getCodicon(entry: FileEntry): string {
    if (entry.is_dir) {
      return entry.expanded ? "codicon-folder-opened" : "codicon-folder";
    }
    const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
    if (["ts", "tsx", "js", "jsx", "mjs", "cjs", "vue", "svelte", "html", "htm"].includes(ext)) {
      return "codicon-file-code";
    }
    if (ext === "json" || ext === "jsonc") return "codicon-json";
    if (ext === "md" || ext === "mdx") return "codicon-markdown";
    if (ext === "py") return "codicon-python";
    if (["css", "scss", "less"].includes(ext)) return "codicon-symbol-color";
    return "codicon-file";
  }
</script>

<div class="file-tree">
  {#if loading}
    <div class="loading">Loading files...</div>
  {:else if browserMode}
    <div class="browser-mode">
      <p>Browser Mode</p>
      <p class="hint">Run with <code>npm run tauri dev</code> to access files</p>
    </div>
  {:else if error}
    <div class="error">{error}</div>
  {:else}
    <div class="tree-content">
      {#if $files.tree.length === 0}
        <p class="tree-empty">This folder is empty (hidden names like <code>.git</code> are filtered).</p>
      {:else}
        {#each $files.tree as entry (entry.path)}
          <FileTreeRow {entry} depth={0} onActivate={handleActivate} {getCodicon} />
        {/each}
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
    background: var(--sidebar);
    color: var(--sidebar-foreground);
    overflow: hidden;
  }

  .loading,
  .error {
    padding: 16px;
    color: var(--muted-foreground);
    font-size: 13px;
  }

  .error {
    color: var(--destructive);
  }

  .browser-mode {
    padding: 16px;
    text-align: center;
  }

  .browser-mode p {
    color: var(--muted-foreground);
    font-size: 13px;
    margin: 0;
  }

  .browser-mode .hint {
    margin-top: 8px;
    font-size: 11px;
  }

  .browser-mode code {
    background: var(--muted);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: monospace;
  }

  .tree-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 8px 0;
  }

  .tree-empty {
    margin: 12px 16px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--muted-foreground);
  }

  .tree-empty code {
    font-size: 11px;
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--muted);
    color: var(--foreground);
  }
</style>
