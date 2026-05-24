<script lang="ts">
  import { files } from "$lib/stores/files";
  import { gitRefresh } from "$lib/stores/gitRefresh";
  import { workbench, workbenchEditorTabId } from "$lib/stores/workbench";
  import {
    gitStatus,
    gitStage,
    gitUnstage,
    gitDiscard,
    gitLog,
    gitCurrentBranch,
    isTauriAvailable,
  } from "$lib/ipc";
  import { invokeSafe } from "$lib/invokeSafe";
  import type { GitLogEntry, GitPathStatus } from "$lib/gitTypes";
  import {
    openGitDiffFile,
    openGitFileNormal,
    gitPathToAbsolute,
  } from "$lib/git/openChangedFile";
  import FileIcon from "$lib/components/FileIcon.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import CaretDownIcon from "phosphor-svelte/lib/CaretDownIcon";
  import CaretRightIcon from "phosphor-svelte/lib/CaretRightIcon";

  const STAGED_OPEN_KEY = "tinyllama.git.stagedOpen";
  const CHANGES_OPEN_KEY = "tinyllama.git.changesOpen";

  let rows = $state<GitPathStatus[]>([]);
  let log = $state<GitLogEntry[]>([]);
  let branch = $state<string | null>(null);
  let err = $state<string | null>(null);
  let commitMsg = $state("");
  let busy = $state(false);
  let hoverPath = $state<string | null>(null);
  let stagedOpen = $state(
    typeof localStorage !== "undefined" ? localStorage.getItem(STAGED_OPEN_KEY) !== "0" : true
  );
  let changesOpen = $state(
    typeof localStorage !== "undefined" ? localStorage.getItem(CHANGES_OPEN_KEY) !== "0" : true
  );

  const root = $derived($files.workspacePath);

  function toggleStaged() {
    stagedOpen = !stagedOpen;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STAGED_OPEN_KEY, stagedOpen ? "1" : "0");
    }
  }

  function toggleChanges() {
    changesOpen = !changesOpen;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(CHANGES_OPEN_KEY, changesOpen ? "1" : "0");
    }
  }

  async function refresh() {
    err = null;
    const repo = root;
    if (!isTauriAvailable() || !repo) {
      rows = [];
      log = [];
      branch = null;
      return;
    }
    busy = true;
    try {
      branch = await gitCurrentBranch(repo);
      rows = await gitStatus(repo);
      log = await gitLog(repo, 24);
    } catch (e) {
      err = String(e);
      rows = [];
      log = [];
    } finally {
      busy = false;
    }
  }

  $effect(() => {
    void root;
    void $gitRefresh;
    void refresh();
  });

  let staged = $derived(rows.filter((r) => r.index !== "-" && r.index !== "??"));
  let unstaged = $derived(rows.filter((r) => r.worktree !== "-"));

  function fileName(path: string): string {
    return path.split("/").pop() ?? path;
  }

  function statusLabel(row: GitPathStatus, section: "staged" | "changes"): string {
    const tag = section === "staged" ? row.index : row.worktree;
    if (tag === "??") return "U";
    if (tag.includes("M")) return "M";
    if (tag.includes("A")) return "A";
    if (tag.includes("D")) return "D";
    if (tag.includes("R")) return "R";
    return tag;
  }

  function statusClass(label: string): string {
    if (label === "M") return "status-mod";
    if (label === "A") return "status-add";
    if (label === "D") return "status-del";
    if (label === "U") return "status-untracked";
    return "status-other";
  }

  async function stage(p: string) {
    const repo = root;
    if (!repo) return;
    await gitStage(repo, p);
    await refresh();
  }

  async function unstage(p: string) {
    const repo = root;
    if (!repo) return;
    await gitUnstage(repo, p);
    await refresh();
  }

  async function discard(relPath: string) {
    const repo = root;
    if (!repo) return;
    busy = true;
    try {
      const abs = gitPathToAbsolute(repo, relPath);
      await gitDiscard(repo, relPath);
      files.closeFile(abs);
      workbench.closeTab(workbenchEditorTabId(abs));
      await refresh();
    } catch (e) {
      err = String(e);
    } finally {
      busy = false;
    }
  }

  async function openDiff(relPath: string) {
    const repo = root;
    if (!repo) return;
    try {
      await openGitDiffFile(repo, relPath);
    } catch (e) {
      err = String(e);
    }
  }

  async function openNormal(relPath: string) {
    const repo = root;
    if (!repo) return;
    try {
      await openGitFileNormal(repo, relPath);
    } catch (e) {
      err = String(e);
    }
  }

  async function commit() {
    const repo = root;
    const msg = commitMsg.trim();
    if (!repo || !msg) return;
    busy = true;
    try {
      const r = await invokeSafe<string>("git_commit", { repoPath: repo, message: msg });
      if (!r.ok) {
        err = r.error.message;
        return;
      }
      commitMsg = "";
      await refresh();
    } catch (e) {
      err = String(e);
    } finally {
      busy = false;
    }
  }
</script>

<div class="git-panel">
  {#if !root}
    <p class="muted">Open a workspace folder to use Git.</p>
  {:else if err}
    <p class="err">{err}</p>
    <Button variant="outline" size="sm" onclick={() => void refresh()}>Retry</Button>
  {:else}
    <div class="head">
      <span class="branch">{branch ?? "detached"}</span>
      <Button variant="ghost" size="sm" onclick={() => void refresh()} disabled={busy}>Refresh</Button>
    </div>

    <section class="section">
      <button type="button" class="section-head" onclick={toggleStaged}>
        {#if stagedOpen}
          <CaretDownIcon size={14} aria-hidden="true" />
        {:else}
          <CaretRightIcon size={14} aria-hidden="true" />
        {/if}
        <span>Staged Changes</span>
        <span class="count">{staged.length}</span>
      </button>
      {#if stagedOpen}
        <ul class="file-list">
          {#each staged as r (r.path)}
            {@const label = statusLabel(r, "staged")}
            <li
              class="file-row"
              onmouseenter={() => (hoverPath = r.path)}
              onmouseleave={() => (hoverPath = null)}
            >
              <button type="button" class="file-main" onclick={() => void openDiff(r.path)}>
                <FileIcon name={fileName(r.path)} size={16} />
                <span class="file-path">{r.path}</span>
                <span class="status-badge {statusClass(label)}" title={label}>{label}</span>
              </button>
              {#if hoverPath === r.path}
                <div class="row-actions">
                  <button type="button" class="action" onclick={() => void openNormal(r.path)}>Open</button>
                  <button type="button" class="action" onclick={() => void unstage(r.path)}>Unstage</button>
                </div>
              {/if}
            </li>
          {:else}
            <li class="empty">Nothing staged</li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="section">
      <button type="button" class="section-head" onclick={toggleChanges}>
        {#if changesOpen}
          <CaretDownIcon size={14} aria-hidden="true" />
        {:else}
          <CaretRightIcon size={14} aria-hidden="true" />
        {/if}
        <span>Changes</span>
        <span class="count">{unstaged.length}</span>
      </button>
      {#if changesOpen}
        <ul class="file-list">
          {#each unstaged as r (r.path)}
            {@const label = statusLabel(r, "changes")}
            <li
              class="file-row"
              onmouseenter={() => (hoverPath = r.path)}
              onmouseleave={() => (hoverPath = null)}
            >
              <button type="button" class="file-main" onclick={() => void openDiff(r.path)}>
                <FileIcon name={fileName(r.path)} size={16} />
                <span class="file-path">{r.path}</span>
                <span class="status-badge {statusClass(label)}" title={label}>{label}</span>
              </button>
              {#if hoverPath === r.path}
                <div class="row-actions">
                  <button type="button" class="action" onclick={() => void openNormal(r.path)}>Open</button>
                  <button type="button" class="action" onclick={() => void discard(r.path)}>Discard</button>
                  {#if r.worktree !== "??"}
                    <button type="button" class="action" onclick={() => void stage(r.path)}>Stage</button>
                  {/if}
                </div>
              {/if}
            </li>
          {:else}
            <li class="empty">Working tree clean</li>
          {/each}
        </ul>
      {/if}
    </section>

    <label class="commit">
      <span class="label">Commit message</span>
      <textarea bind:value={commitMsg} rows="2" class="ta" placeholder="Describe your change"></textarea>
      <Button size="sm" onclick={() => void commit()} disabled={busy || !commitMsg.trim()}>Commit</Button>
    </label>

    <p class="label">Recent commits</p>
    <ul class="log">
      {#each log as e (e.oid)}
        <li title={e.oid}>
          <span class="subj">{e.summary}</span>
          <span class="meta">{e.author}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .git-panel {
    padding: 10px 8px;
    font-size: 12px;
    color: var(--sidebar-foreground);
    overflow: auto;
    height: 100%;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    padding: 0 4px;
  }
  .branch {
    font-weight: 600;
    font-family: ui-monospace, monospace;
  }
  .section {
    margin-bottom: 8px;
  }
  .section-head {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 4px 6px;
    border: none;
    background: transparent;
    color: var(--sidebar-foreground);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    cursor: pointer;
    border-radius: 4px;
  }
  .section-head:hover {
    background: color-mix(in srgb, var(--sidebar-accent) 60%, transparent);
  }
  .count {
    margin-left: auto;
    font-size: 10px;
    color: var(--muted-foreground);
    font-weight: 500;
  }
  .file-list,
  .log {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .file-row {
    position: relative;
    display: flex;
    align-items: center;
    min-height: 26px;
    border-radius: 4px;
  }
  .file-row:hover {
    background: color-mix(in srgb, var(--sidebar-accent) 50%, transparent);
  }
  .file-main {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
    padding: 4px 6px;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    text-align: left;
  }
  .file-path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .status-badge {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 700;
    font-family: ui-monospace, monospace;
    padding: 0 4px;
    border-radius: 3px;
  }
  .status-mod {
    color: #e2b340;
  }
  .status-add {
    color: #73c991;
  }
  .status-del {
    color: #f14c4c;
  }
  .status-untracked {
    color: #73c991;
  }
  .status-other {
    color: var(--muted-foreground);
  }
  .row-actions {
    display: flex;
    gap: 2px;
    padding-right: 4px;
    flex-shrink: 0;
  }
  .action {
    border: none;
    background: var(--sidebar-accent);
    color: var(--sidebar-primary);
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 3px;
    cursor: pointer;
  }
  .action:hover {
    background: color-mix(in srgb, var(--sidebar-primary) 20%, var(--sidebar-accent));
  }
  .empty {
    padding: 4px 8px;
    color: var(--muted-foreground);
  }
  .label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted-foreground);
    margin: 10px 4px 4px;
  }
  .muted {
    color: var(--muted-foreground);
  }
  .err {
    color: var(--destructive, #f87171);
    margin-bottom: 8px;
  }
  .commit {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 12px 4px;
  }
  .ta {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    background: var(--sidebar-accent);
    border: 1px solid var(--sidebar-border);
    border-radius: 4px;
    color: inherit;
    padding: 6px;
  }
  .log li {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 6px;
    border-bottom: 1px solid color-mix(in srgb, var(--sidebar-border) 50%, transparent);
  }
  .subj {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    font-size: 10px;
    color: var(--muted-foreground);
    flex-shrink: 0;
  }
</style>
