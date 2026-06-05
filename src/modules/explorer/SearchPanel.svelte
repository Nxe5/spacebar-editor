<script lang="ts">
  import { get } from "svelte/store";
  import { onMount, onDestroy } from "svelte";
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

  const MAX_RESULTS = 500;

  type FileGroup = {
    path: string;
    rel: string;
    name: string;
    matches: { line: number; text: string }[];
    collapsed: boolean;
  };

  let queryEl: HTMLInputElement | undefined = $state();
  let searchQuery = $state("");
  let fileGlob = $state("");
  let caseSensitive = $state(false);
  let useRegex = $state(false);
  let wholeWord = $state(false);
  let groups = $state<FileGroup[]>([]);
  let totalMatches = $state(0);
  let truncated = $state(false);
  let searching = $state(false);
  let regexError = $state<string | null>(null);
  let searchError = $state<string | null>(null);
  let searched = $state(false);
  let desktopAvailable = $state(isTauriAvailable());
  let searchToken = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

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
        group = { path: m.path, rel, name: fileNameOf(rel), matches: [], collapsed: false };
        byPath.set(m.path, group);
      }
      group.matches.push({ line: m.line_number, text: m.line_content });
    }
    return [...byPath.values()].sort((a, b) => a.rel.localeCompare(b.rel));
  }

  function validateRegex(pattern: string): string | null {
    if (!useRegex) return null;
    try {
      new RegExp(pattern);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Invalid regex";
    }
  }

  async function runSearch() {
    const query = searchQuery.trim();
    const ws = get(files).workspacePath;
    if (!query || !ws || !desktopAvailable) {
      groups = [];
      totalMatches = 0;
      truncated = false;
      searched = Boolean(query);
      return;
    }

    const rxErr = validateRegex(query);
    if (rxErr) {
      regexError = rxErr;
      groups = [];
      totalMatches = 0;
      searched = true;
      return;
    }
    regexError = null;

    const token = ++searchToken;
    searching = true;
    searchError = null;
    try {
      const matches = await grepWorkspace(ws, query, {
        fileGlob: fileGlob.trim() || undefined,
        caseSensitive: caseSensitive || undefined,
        isRegex: useRegex || undefined,
        wholeWord: wholeWord || undefined,
      });
      if (token !== searchToken) return;
      groups = groupMatches(matches, ws);
      totalMatches = matches.length;
      truncated = matches.length >= MAX_RESULTS;
      searched = true;
    } catch (e) {
      if (token !== searchToken) return;
      searchError = String(e);
      groups = [];
      totalMatches = 0;
      truncated = false;
    } finally {
      if (token === searchToken) searching = false;
    }
  }

  function scheduleSearch() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSearch, 250);
  }

  $effect(() => {
    void searchQuery;
    void fileGlob;
    void caseSensitive;
    void useRegex;
    void wholeWord;
    scheduleSearch();
  });

  async function openResult(absPath: string, line: number) {
    try {
      const content = await readFile(null, absPath);
      const name = fileNameOf(normalizeFilePath(absPath));
      workbench.openEditorFile({
        path: absPath,
        name,
        content,
        isDirty: false,
        language: getLanguageFromPath(absPath),
      });
      window.dispatchEvent(
        new CustomEvent("sidebar:goto-line", { detail: { path: absPath, line } })
      );
    } catch {
      // File may have been deleted; silently ignore open failures.
    }
  }

  function onFocusSearch() {
    queryEl?.focus();
    queryEl?.select();
  }

  onMount(() => {
    window.addEventListener("sidebar:focus-search", onFocusSearch);
  });

  onDestroy(() => {
    window.removeEventListener("sidebar:focus-search", onFocusSearch);
    if (debounceTimer) clearTimeout(debounceTimer);
  });
</script>

<div class="search-panel">
  <div class="search-inputs">
    <div class="query-row">
      <input
        bind:this={queryEl}
        type="text"
        bind:value={searchQuery}
        placeholder="Search"
        class="search-input"
        class:regex-invalid={regexError !== null}
        aria-label="Search query"
        spellcheck={false}
      />
      <div class="toggle-group" role="group" aria-label="Search options">
        <button
          type="button"
          class="toggle-btn"
          class:active={caseSensitive}
          title="Match case (Alt+C)"
          aria-pressed={caseSensitive}
          onclick={() => (caseSensitive = !caseSensitive)}
        >Aa</button>
        <button
          type="button"
          class="toggle-btn"
          class:active={useRegex}
          title="Use regex (Alt+R)"
          aria-pressed={useRegex}
          onclick={() => (useRegex = !useRegex)}
        >.*</button>
        <button
          type="button"
          class="toggle-btn"
          class:active={wholeWord}
          title="Match whole word (Alt+W)"
          aria-pressed={wholeWord}
          onclick={() => (wholeWord = !wholeWord)}
        >⌷W</button>
      </div>
    </div>
    {#if regexError}
      <p class="regex-error">{regexError}</p>
    {/if}
    <input
      type="text"
      bind:value={fileGlob}
      placeholder="Files to include (e.g. **/*.ts)"
      class="search-input glob-input"
      aria-label="File glob filter"
      spellcheck={false}
    />
  </div>

  <div class="search-summary">
    {#if !get(files).workspacePath && desktopAvailable}
      <span class="muted">Open a folder to search</span>
    {:else if searching}
      <span class="muted">Searching…</span>
    {:else if searched && totalMatches > 0}
      <span>
        {totalMatches}{truncated ? "+" : ""} {totalMatches === 1 ? "result" : "results"} in {groups.length} {groups.length === 1 ? "file" : "files"}
        {#if truncated}<span class="truncated-note"> — truncated at {MAX_RESULTS}</span>{/if}
      </span>
    {:else if searched && !regexError}
      <span class="muted">No results</span>
    {/if}
  </div>

  <div class="search-results">
    {#if !desktopAvailable}
      <div class="no-results">Search needs the desktop app (ripgrep).</div>
    {:else if searchError}
      <div class="no-results error">{searchError}</div>
    {:else if groups.length > 0}
      {#each groups as group (group.path)}
        <div class="result-group">
          <button
            type="button"
            class="result-file-header"
            title={group.rel}
            onclick={() => (group.collapsed = !group.collapsed)}
            aria-expanded={!group.collapsed}
          >
            <span class="collapse-arrow" aria-hidden="true">{group.collapsed ? "›" : "⌄"}</span>
            <span class="result-file">{group.name}</span>
            <span class="result-dir">{group.rel}</span>
            <span class="result-count">{group.matches.length}</span>
          </button>
          {#if !group.collapsed}
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
          {/if}
        </div>
      {/each}
    {:else if !searched}
      <div class="no-results muted">Enter a search term</div>
    {/if}
  </div>
</div>

<style>
  .search-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 8px;
    gap: 6px;
  }

  .search-inputs {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .query-row {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .search-input {
    flex: 1;
    padding: 5px 8px;
    background: var(--input, #3c3c3c);
    border: 1px solid var(--border, #4c4c4c);
    border-radius: 4px;
    color: var(--foreground, #d4d4d4);
    font-size: 13px;
    min-width: 0;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--ring, #007acc);
  }

  .search-input.regex-invalid {
    border-color: var(--destructive, #f87171);
  }

  .glob-input {
    font-size: 12px;
    font-family: ui-monospace, monospace;
  }

  .toggle-group {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
  }

  .toggle-btn {
    padding: 3px 6px;
    font-size: 11px;
    font-weight: 600;
    border: 1px solid var(--border, #4c4c4c);
    border-radius: 3px;
    background: transparent;
    color: var(--muted-foreground, #808080);
    cursor: pointer;
    line-height: 1.3;
    font-family: ui-monospace, monospace;
    user-select: none;
  }

  .toggle-btn:hover {
    color: var(--foreground, #d4d4d4);
    background: var(--accent, #323235);
  }

  .toggle-btn.active {
    background: rgba(0, 122, 204, 0.25);
    border-color: #007acc;
    color: #569cd6;
  }

  .regex-error {
    margin: 0;
    font-size: 11px;
    color: var(--destructive, #f87171);
    padding: 0 2px;
  }

  .search-summary {
    min-height: 16px;
    padding-bottom: 6px;
    font-size: 11px;
    color: var(--foreground, #d4d4d4);
    border-bottom: 1px solid var(--border, #3c3c3c);
  }

  .search-summary .muted {
    color: var(--muted-foreground, #808080);
  }

  .truncated-note {
    color: var(--muted-foreground, #808080);
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
    margin-bottom: 2px;
  }

  .result-file-header {
    display: flex;
    align-items: baseline;
    gap: 6px;
    width: 100%;
    padding: 4px 8px;
    font-size: 12px;
    position: sticky;
    top: 0;
    background: var(--explorer-panel-bg, var(--sidebar, #252526));
    border: none;
    cursor: pointer;
    text-align: left;
    color: inherit;
    font-family: inherit;
  }

  .result-file-header:hover {
    background: var(--accent, #323235);
  }

  .collapse-arrow {
    color: var(--muted-foreground, #808080);
    font-size: 11px;
    flex-shrink: 0;
    width: 10px;
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
    flex-shrink: 0;
  }

  .result-item {
    display: flex;
    gap: 8px;
    width: 100%;
    text-align: left;
    padding: 3px 8px 3px 24px;
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
