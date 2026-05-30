<script lang="ts">
  import { get } from "svelte/store";
  import { files } from "$lib/stores/files";
  import { workbench } from "$lib/stores/workbench";
  import {
    grepWorkspace,
    readFile,
    getLanguageFromPath,
    isTauriAvailable,
    type GrepMatch,
  } from "$lib/ipc";
  import { normalizeFilePath } from "$lib/fsPath";

  type FileGroup = {
    path: string;
    rel: string;
    name: string;
    matches: { line: number; text: string }[];
  };

  let searchQuery = $state("");
  let fileGlob = $state("");
  let groups = $state<FileGroup[]>([]);
  let totalMatches = $state(0);
  let searching = $state(false);
  let error = $state<string | null>(null);
  let searched = $state(false);
  let desktopAvailable = $state(isTauriAvailable());
  let searchToken = 0;

  function relativePath(absPath: string, workspacePath: string): string {
    const ws = normalizeFilePath(workspacePath).replace(/\/$/, "");
    const norm = normalizeFilePath(absPath);
    return norm.startsWith(`${ws}/`) ? norm.slice(ws.length + 1) : norm;
  }

  function fileNameOf(rel: string): string {
    const parts = rel.split("/");
    return parts[parts.length - 1] || rel;
  }

  function groupMatches(matches: GrepMatch[], workspacePath: string): FileGroup[] {
    const byPath = new Map<string, FileGroup>();
    for (const m of matches) {
      let group = byPath.get(m.path);
      if (!group) {
        const rel = relativePath(m.path, workspacePath);
        group = { path: m.path, rel, name: fileNameOf(rel), matches: [] };
        byPath.set(m.path, group);
      }
      group.matches.push({ line: m.line_number, text: m.line_content });
    }
    return [...byPath.values()].sort((a, b) => a.rel.localeCompare(b.rel));
  }

  async function handleSearch() {
    const query = searchQuery.trim();
    const ws = get(files).workspacePath;
    if (!query || !ws || !desktopAvailable) {
      groups = [];
      totalMatches = 0;
      searched = Boolean(query);
      return;
    }
    const token = ++searchToken;
    searching = true;
    error = null;
    try {
      const matches = await grepWorkspace(ws, query, fileGlob.trim() || undefined);
      if (token !== searchToken) return;
      groups = groupMatches(matches, ws);
      totalMatches = matches.length;
      searched = true;
    } catch (e) {
      if (token !== searchToken) return;
      error = String(e);
      groups = [];
      totalMatches = 0;
    } finally {
      if (token === searchToken) searching = false;
    }
  }

  async function openResult(absPath: string, line: number) {
    try {
      const content = await readFile(absPath);
      const name = fileNameOf(normalizeFilePath(absPath));
      workbench.openEditorFile({
        path: absPath,
        name,
        content,
        isDirty: false,
        language: getLanguageFromPath(absPath),
      });
      window.dispatchEvent(
        new CustomEvent("tinyllama:goto-line", { detail: { path: absPath, line } })
      );
    } catch (e) {
      console.error("Failed to open search result:", e);
    }
  }
</script>

<div class="search-panel">
  <div class="search-inputs">
    <div class="input-row">
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search"
        class="search-input"
        onkeydown={(e) => e.key === "Enter" && handleSearch()}
      />
    </div>
    <div class="input-row">
      <input
        type="text"
        bind:value={fileGlob}
        placeholder="Files to include (e.g. *.ts)"
        class="search-input"
        onkeydown={(e) => e.key === "Enter" && handleSearch()}
      />
    </div>
  </div>

  <div class="search-summary">
    {#if searching}
      <span>Searching…</span>
    {:else if searched && totalMatches > 0}
      <span>{totalMatches} {totalMatches === 1 ? "result" : "results"} in {groups.length} {groups.length === 1 ? "file" : "files"}</span>
    {/if}
  </div>

  <div class="search-results">
    {#if !desktopAvailable}
      <div class="no-results">Search needs the desktop app (ripgrep).</div>
    {:else if error}
      <div class="no-results error">{error}</div>
    {:else if searching}
      <div class="no-results">Searching…</div>
    {:else if groups.length === 0}
      <div class="no-results">
        {#if searched}
          No results found
        {:else}
          Enter a search term
        {/if}
      </div>
    {:else}
      {#each groups as group (group.path)}
        <div class="result-group">
          <div class="result-file-header" title={group.rel}>
            <span class="result-file">{group.name}</span>
            <span class="result-dir">{group.rel}</span>
            <span class="result-count">{group.matches.length}</span>
          </div>
          {#each group.matches as match (match.line)}
            <button
              type="button"
              class="result-item"
              onclick={() => void openResult(group.path, match.line)}
            >
              <span class="result-line">{match.line}</span>
              <span class="result-text">{match.text.trim()}</span>
            </button>
          {/each}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .search-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 8px;
  }

  .search-inputs {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 8px;
  }

  .input-row {
    display: flex;
    gap: 4px;
  }

  .search-input {
    flex: 1;
    padding: 6px 8px;
    background: var(--input, #3c3c3c);
    border: 1px solid var(--border, #4c4c4c);
    border-radius: 4px;
    color: var(--foreground, #d4d4d4);
    font-size: 13px;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--ring, #007acc);
  }

  .search-summary {
    min-height: 16px;
    margin-bottom: 6px;
    padding-bottom: 6px;
    font-size: 11px;
    color: var(--muted-foreground, #808080);
    border-bottom: 1px solid var(--border, #3c3c3c);
  }

  .search-results {
    flex: 1;
    overflow-y: auto;
  }

  .no-results {
    color: var(--muted-foreground, #808080);
    font-size: 13px;
    padding: 16px;
    text-align: center;
  }

  .no-results.error {
    color: var(--destructive, #f87171);
    text-align: left;
  }

  .result-group {
    margin-bottom: 4px;
  }

  .result-file-header {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 4px 8px;
    font-size: 12px;
    position: sticky;
    top: 0;
    background: var(--explorer-panel-bg, var(--sidebar, #252526));
  }

  .result-file {
    color: var(--foreground, #d4d4d4);
    font-weight: 600;
  }

  .result-dir {
    flex: 1;
    color: var(--muted-foreground, #808080);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-count {
    color: var(--muted-foreground, #808080);
    font-size: 11px;
  }

  .result-item {
    display: flex;
    gap: 8px;
    width: 100%;
    text-align: left;
    padding: 3px 8px 3px 20px;
    font-size: 12px;
    cursor: pointer;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font-family: inherit;
  }

  .result-item:hover {
    background: var(--sidebar-accent, #2a2d2e);
  }

  .result-line {
    flex-shrink: 0;
    min-width: 28px;
    color: var(--muted-foreground, #808080);
    text-align: right;
  }

  .result-text {
    color: var(--foreground, #d4d4d4);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: ui-monospace, monospace;
  }
</style>
