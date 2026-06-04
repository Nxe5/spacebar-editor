<script lang="ts">
  import { get } from "svelte/store";
  import { files } from "$lib/stores/files";
  import { settings } from "$lib/stores/settings";
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
    runShell,
  } from "$lib/ipc";
  import { invokeSafe } from "$lib/invokeSafe";
  import { cloudApiKeysForStream } from "$lib/apiSecrets";
  import { streamOneTurn, resolveStreamCredentials } from "$lib/agent/streamTurn";
  import type { GitLogEntry, GitPathStatus } from "$lib/gitTypes";
  import {
    openGitDiffFile,
    openGitFileNormal,
    gitPathToAbsolute,
  } from "$lib/git/openChangedFile";
  import FileIcon from "$lib/components/FileIcon.svelte";
  import AppIcon from "$lib/components/AppIcon.svelte";
  import CaretDownIcon from "phosphor-svelte/lib/CaretDownIcon";
  import CaretRightIcon from "phosphor-svelte/lib/CaretRightIcon";
  import Plus from "@lucide/svelte/icons/plus";
  import Minus from "@lucide/svelte/icons/minus";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";

  const STAGED_OPEN_KEY = "sidebar.git.stagedOpen";
  const CHANGES_OPEN_KEY = "sidebar.git.changesOpen";
  const LOG_OPEN_KEY = "sidebar.git.logOpen";

  let rows = $state<GitPathStatus[]>([]);
  let log = $state<GitLogEntry[]>([]);
  let branch = $state<string | null>(null);
  let err = $state<string | null>(null);
  let pushMsg = $state<string | null>(null);
  /** Paths of untracked directories that are currently expanded. */
  let expandedDirs = $state<string[]>([]);
  /** Files inside expanded untracked directories, keyed by dir path. */
  let dirFilesMap = $state<Record<string, string[]>>({});
  let loadingDir = $state<string | null>(null);
  let commitMsg = $state("");
  let busy = $state(false);
  let pushBusy = $state(false);
  let aiCommitBusy = $state(false);
  let aiAbort = $state<AbortController | null>(null);
  let stagedOpen = $state(
    typeof localStorage !== "undefined" ? localStorage.getItem(STAGED_OPEN_KEY) !== "0" : true
  );
  let changesOpen = $state(
    typeof localStorage !== "undefined" ? localStorage.getItem(CHANGES_OPEN_KEY) !== "0" : true
  );
  let logOpen = $state(
    typeof localStorage !== "undefined" ? localStorage.getItem(LOG_OPEN_KEY) !== "0" : false
  );

  const root = $derived($files.workspacePath);
  const staged = $derived(rows.filter((r) => r.index !== "-" && r.index !== "??"));
  const unstaged = $derived(rows.filter((r) => r.worktree !== "-"));

  function persist(key: string, val: boolean) {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, val ? "1" : "0");
  }

  function toggleStaged() { stagedOpen = !stagedOpen; persist(STAGED_OPEN_KEY, stagedOpen); }
  function toggleChanges() { changesOpen = !changesOpen; persist(CHANGES_OPEN_KEY, changesOpen); }
  function toggleLog() { logOpen = !logOpen; persist(LOG_OPEN_KEY, logOpen); }

  async function loadDirFiles(repo: string, dirPath: string): Promise<string[]> {
    const q = dirPath.replace(/"/g, '\\"');
    const r = await runShell(repo, `git ls-files --others --exclude-standard -- "${q}"`, 10_000);
    return r.stdout.trim().split("\n").filter(Boolean);
  }

  async function toggleDir(dirPath: string) {
    const repo = root;
    if (!repo) return;
    if (expandedDirs.includes(dirPath)) {
      expandedDirs = expandedDirs.filter((d) => d !== dirPath);
    } else {
      if (!dirFilesMap[dirPath]) {
        loadingDir = dirPath;
        try {
          const files = await loadDirFiles(repo, dirPath);
          dirFilesMap = { ...dirFilesMap, [dirPath]: files };
        } finally {
          loadingDir = null;
        }
      }
      expandedDirs = [...expandedDirs, dirPath];
    }
  }

  async function refresh() {
    err = null;
    pushMsg = null;
    const repo = root;
    if (!isTauriAvailable() || !repo) { rows = []; log = []; branch = null; expandedDirs = []; dirFilesMap = {}; return; }
    busy = true;
    try {
      [branch, rows, log] = await Promise.all([
        gitCurrentBranch(repo),
        gitStatus(repo),
        gitLog(repo, 24),
      ]);
      // Reload file lists for expanded directories so they stay fresh after staging
      if (expandedDirs.length > 0) {
        const reloaded: Record<string, string[]> = {};
        await Promise.all(expandedDirs.map(async (dir) => {
          reloaded[dir] = await loadDirFiles(repo, dir);
        }));
        dirFilesMap = reloaded;
      }
    } catch (e) {
      err = String(e);
      rows = [];
      log = [];
    } finally {
      busy = false;
    }
  }

  $effect(() => { void root; void $gitRefresh; void refresh(); });

  function fileName(path: string): string { return path.split("/").pop() ?? path; }

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

  const isDir = (path: string) => path.endsWith("/");

  async function stage(p: string) {
    if (!root) return;
    try {
      if (isDir(p)) {
        // git2's index.add_path can't recurse into dirs — use git add via shell
        const r = await runShell(root, `git add "${p.replace(/"/g, '\\"')}"`, 10_000);
        if (r.exit_code !== 0) { err = (r.stderr || "Stage failed").trim(); return; }
      } else {
        await gitStage(root, p);
      }
      await refresh();
    } catch (e) {
      err = String(e);
    }
  }

  async function unstage(p: string) {
    if (!root) return;
    await gitUnstage(root, p);
    await refresh();
  }

  async function discard(relPath: string) {
    if (!root) return;
    busy = true;
    try {
      const abs = gitPathToAbsolute(root, relPath);
      await gitDiscard(root, relPath);
      files.closeFile(abs);
      workbench.closeTab(workbenchEditorTabId(abs));
      await refresh();
    } catch (e) {
      err = String(e);
    } finally {
      busy = false;
    }
  }

  async function openFile(relPath: string, untracked = false) {
    if (!root || isDir(relPath)) return;
    try {
      // Tracked changes get the green/red diff overlay; untracked files have no
      // HEAD version, so open them plainly.
      if (untracked) await openGitFileNormal(root, relPath);
      else await openGitDiffFile(root, relPath);
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
      if (!r.ok) { err = r.error.message; return; }
      commitMsg = "";
      await refresh();
    } catch (e) {
      err = String(e);
    } finally {
      busy = false;
    }
  }

  async function push() {
    const repo = root;
    if (!repo) return;
    pushBusy = true;
    pushMsg = null;
    err = null;
    try {
      const r = await runShell(repo, "git push", 30_000);
      if (r.exit_code !== 0) {
        err = (r.stderr || r.stdout || "Push failed").trim();
      } else {
        pushMsg = (r.stdout || r.stderr || "Pushed.").trim();
        await refresh();
      }
    } catch (e) {
      err = String(e);
    } finally {
      pushBusy = false;
    }
  }

  async function aiCommit() {
    const repo = root;
    if (!repo || staged.length === 0 || aiCommitBusy) return;
    aiCommitBusy = true;
    commitMsg = "";
    err = null;
    const abort = new AbortController();
    aiAbort = abort;
    try {
      const diffResult = await runShell(
        repo,
        "git diff --cached --stat && printf '\\n---\\n' && git diff --cached",
        15_000
      );
      const diff = diffResult.stdout.slice(0, 12_000);
      const st = get(settings);
      const creds = resolveStreamCredentials({
        backend: st.chatBackend,
        apiKeys: await cloudApiKeysForStream(),
        ollamaEndpoint: st.ollamaEndpoint,
        ollamaApiKey: st.ollamaApiKey,
        llamacppEndpoint: st.llamacppEndpoint,
        llamacppApiKey: st.llamacppApiKey,
      });
      await streamOneTurn({
        backend: st.chatBackend,
        apiKey: creds.apiKey,
        baseUrl: creds.baseUrl,
        model: st.selectedModel,
        systemPrompt:
          "You write concise, conventional git commit messages. Output ONLY the commit message — no explanation, no markdown, no quotes.",
        messages: [
          {
            role: "user",
            content: `Write a git commit message for these staged changes:\n\n${diff}`,
          },
        ],
        signal: abort.signal,
        onDelta: (content) => { commitMsg = content; },
      });
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError")) err = String(e);
    } finally {
      aiCommitBusy = false;
      aiAbort = null;
    }
  }

  function cancelAi() {
    aiAbort?.abort();
  }
</script>

<div class="git-panel">
  {#if !root}
    <p class="muted">Open a workspace folder to use Git.</p>
  {:else}
    <!-- Commit message box -->
    <div class="commit-area">
      <textarea
        bind:value={commitMsg}
        rows={3}
        class="ta"
        placeholder="Commit message…"
      ></textarea>

      <!-- Stats row -->
      <div class="stats-row">
        <span class="branch-chip">
          <AppIcon name="git" size={11} />
          {branch ?? "detached"}
        </span>
        <span class="staged-count">{staged.length} staged</span>
        <button
          type="button"
          class="ai-icon-btn"
          class:ai-icon-btn--spinning={aiCommitBusy}
          onclick={aiCommitBusy ? cancelAi : () => void aiCommit()}
          disabled={!aiCommitBusy && staged.length === 0}
          title={aiCommitBusy ? "Cancel AI generation" : "Generate commit message with AI"}
        >
          <AppIcon name="circle-spark" size={14} />
        </button>
      </div>

      <!-- Commit + Push row -->
      <div class="action-row">
        <button
          type="button"
          class="action-btn action-btn--primary"
          onclick={() => void commit()}
          disabled={busy || !commitMsg.trim()}
        >
          Commit
        </button>
        <button
          type="button"
          class="action-btn action-btn--secondary"
          onclick={() => void push()}
          disabled={pushBusy}
        >
          {pushBusy ? "Pushing…" : "Push"}
        </button>
      </div>

      {#if err}
        <p class="err">{err} <button type="button" class="dismiss" onclick={() => (err = null)}>✕</button></p>
      {/if}
      {#if pushMsg}
        <p class="push-ok">{pushMsg}</p>
      {/if}
    </div>

    <!-- Staged Changes -->
    <section class="section">
      <button type="button" class="section-head" onclick={toggleStaged}>
        {#if stagedOpen}<CaretDownIcon size={13} aria-hidden="true" />{:else}<CaretRightIcon size={13} aria-hidden="true" />{/if}
        <span>Staged Changes</span>
        <span class="count">{staged.length}</span>
      </button>
      {#if stagedOpen}
        <ul class="file-list">
          {#each staged as r (r.path)}
            {@const label = statusLabel(r, "staged")}
            <li class="file-row">
              <button
                type="button"
                class="file-main"
                onclick={() => void openFile(r.path)}
                title={r.path}
              >
                <FileIcon name={fileName(r.path)} />
                <span class="file-path">{r.path}</span>
                <span class="status-badge {statusClass(label)}">{label}</span>
              </button>
              <div class="row-actions">
                <button
                  type="button"
                  class="icon-action"
                  onclick={(e) => { e.stopPropagation(); void unstage(r.path); }}
                  title="Unstage"
                >
                  <Minus size={13} />
                </button>
              </div>
            </li>
          {:else}
            <li class="empty">Nothing staged</li>
          {/each}
        </ul>
      {/if}
    </section>

    <!-- Unstaged Changes -->
    <section class="section">
      <button type="button" class="section-head" onclick={toggleChanges}>
        {#if changesOpen}<CaretDownIcon size={13} aria-hidden="true" />{:else}<CaretRightIcon size={13} aria-hidden="true" />{/if}
        <span>Changes</span>
        <span class="count">{unstaged.length}</span>
      </button>
      {#if changesOpen}
        <ul class="file-list">
          {#each unstaged as r (r.path)}
            {@const label = statusLabel(r, "changes")}
            {@const dir = isDir(r.path)}
            {@const expanded = dir && expandedDirs.includes(r.path)}
            <li class="file-row">
              {#if dir}
                <button
                  type="button"
                  class="file-main"
                  onclick={() => void toggleDir(r.path)}
                  title={r.path}
                >
                  <span class="caret">
                    {#if expanded}<CaretDownIcon size={12} aria-hidden="true" />{:else}<CaretRightIcon size={12} aria-hidden="true" />{/if}
                  </span>
                  <FileIcon name={fileName(r.path)} isDir={true} expanded={expanded} />
                  <span class="file-path">{r.path}</span>
                  <span class="status-badge {statusClass(label)}">{label}</span>
                </button>
              {:else}
                <button
                  type="button"
                  class="file-main"
                  onclick={() => void openFile(r.path, r.worktree === "??")}
                  title={r.path}
                >
                  <FileIcon name={fileName(r.path)} />
                  <span class="file-path">{r.path}</span>
                  <span class="status-badge {statusClass(label)}">{label}</span>
                </button>
              {/if}
              <div class="row-actions">
                {#if r.worktree !== "??" && !dir}
                  <button
                    type="button"
                    class="icon-action icon-action--danger"
                    onclick={(e) => { e.stopPropagation(); void discard(r.path); }}
                    title="Discard changes"
                  >
                    <RotateCcw size={12} />
                  </button>
                {/if}
                <button
                  type="button"
                  class="icon-action icon-action--accent"
                  onclick={(e) => { e.stopPropagation(); void stage(r.path); }}
                  title={dir ? "Stage all in folder" : "Stage"}
                >
                  <Plus size={13} />
                </button>
              </div>
            </li>
            {#if dir && expanded}
              {#if loadingDir === r.path}
                <li class="file-row--child file-row--loading">Loading…</li>
              {:else}
                {#each (dirFilesMap[r.path] ?? []) as childPath (childPath)}
                  <li class="file-row file-row--child">
                    <button
                      type="button"
                      class="file-main"
                      onclick={() => void openFile(childPath, true)}
                      title={childPath}
                    >
                      <FileIcon name={fileName(childPath)} />
                      <span class="file-path">{childPath.slice(r.path.length)}</span>
                    </button>
                    <div class="row-actions">
                      <button
                        type="button"
                        class="icon-action icon-action--accent"
                        onclick={(e) => { e.stopPropagation(); void stage(childPath); }}
                        title="Stage"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  </li>
                {:else}
                  <li class="file-row--child file-row--empty-dir">Empty</li>
                {/each}
              {/if}
            {/if}
          {:else}
            <li class="empty">Working tree clean</li>
          {/each}
        </ul>
      {/if}
    </section>

    <!-- Recent Commits -->
    <section class="section">
      <button type="button" class="section-head" onclick={toggleLog}>
        {#if logOpen}<CaretDownIcon size={13} aria-hidden="true" />{:else}<CaretRightIcon size={13} aria-hidden="true" />{/if}
        <span>Recent Commits</span>
        <span class="count">{log.length}</span>
      </button>
      {#if logOpen}
        <ul class="log">
          {#each log as e (e.oid)}
            <li title={e.oid}>
              <span class="log-dot"></span>
              <span class="log-body">
                <span class="log-subj">{e.summary}</span>
                <span class="log-meta">{e.author}</span>
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</div>

<style>
  .git-panel {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    padding: 8px 8px 16px;
    font-size: 12px;
    color: var(--sidebar-foreground);
    background-color: var(--explorer-panel-bg, var(--sidebar));
    overflow-y: auto;
    overflow-x: hidden;
    height: 100%;
    gap: 0;
  }

  /* ── Commit area ─────────────────────────────────── */
  .commit-area {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-bottom: 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--sidebar-border) 50%, transparent);
    margin-bottom: 4px;
  }

  .ta {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    min-height: 60px;
    background: color-mix(in srgb, var(--sidebar-accent) 60%, transparent);
    border: 1px solid color-mix(in srgb, var(--sidebar-border) 70%, transparent);
    border-radius: 6px;
    color: inherit;
    padding: 7px 8px;
    font-size: 12px;
    font-family: inherit;
    line-height: 1.45;
    outline: none;
    transition: border-color 120ms;
  }

  .ta:focus {
    border-color: var(--sidebar-primary);
  }

  .stats-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 2px;
  }

  .branch-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: ui-monospace, monospace;
    font-size: 11px;
    color: var(--sidebar-foreground);
    font-weight: 500;
  }

  .staged-count {
    font-size: 11px;
    color: var(--muted-foreground);
    flex: 1;
    text-align: right;
  }

  .ai-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--sidebar-primary);
    cursor: pointer;
    transition: background 120ms;
    flex-shrink: 0;
  }

  .ai-icon-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--sidebar-primary) 15%, transparent);
  }

  .ai-icon-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .ai-icon-btn--spinning {
    animation: spin 1.2s linear infinite;
    opacity: 0.7;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  .action-row {
    display: flex;
    gap: 6px;
  }

  .action-btn {
    flex: 1;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
    transition: background 120ms;
  }

  .action-btn--primary {
    background: var(--sidebar-primary);
    color: var(--sidebar-primary-foreground);
    border-color: var(--sidebar-primary);
  }

  .action-btn--primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--sidebar-primary) 85%, white);
  }

  .action-btn--primary:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .action-btn--secondary {
    background: color-mix(in srgb, var(--sidebar-accent) 80%, transparent);
    color: var(--sidebar-foreground);
    border-color: color-mix(in srgb, var(--sidebar-border) 60%, transparent);
  }

  .action-btn--secondary:hover:not(:disabled) {
    background: var(--sidebar-accent);
  }

  .action-btn--secondary:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .err {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    color: var(--destructive, #f87171);
    font-size: 11px;
    line-height: 1.4;
    padding: 4px 6px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--destructive, #f87171) 10%, transparent);
    margin: 0;
  }

  .dismiss {
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    padding: 0;
    margin-left: auto;
    flex-shrink: 0;
    font-size: 10px;
    opacity: 0.7;
  }

  .push-ok {
    color: var(--success, #89d185);
    font-size: 11px;
    padding: 4px 6px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--success, #89d185) 10%, transparent);
    margin: 0;
  }

  /* ── Sections ────────────────────────────────────── */
  .section {
    margin-bottom: 2px;
  }

  .section-head {
    display: flex;
    align-items: center;
    gap: 5px;
    width: 100%;
    padding: 5px 4px;
    border: none;
    background: transparent;
    color: var(--muted-foreground);
    font-size: 10.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    cursor: pointer;
    border-radius: 4px;
  }

  .section-head:hover {
    background: color-mix(in srgb, var(--sidebar-accent) 50%, transparent);
    color: var(--sidebar-foreground);
  }

  .count {
    margin-left: auto;
    font-size: 10px;
    color: var(--muted-foreground);
    font-weight: 400;
  }

  /* ── File rows ───────────────────────────────────── */
  .file-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .file-row {
    position: relative;
    display: flex;
    align-items: center;
    min-height: 24px;
    border-radius: 4px;
  }

  .file-row:hover {
    background: color-mix(in srgb, var(--sidebar-accent) 45%, transparent);
  }

  .file-row--child {
    padding-left: 16px;
  }

  .file-row--child .file-main {
    padding-left: 10px;
  }

  .file-row--loading,
  .file-row--empty-dir {
    padding: 3px 8px 3px 24px;
    color: var(--muted-foreground);
    font-size: 11px;
    font-style: italic;
  }

  .caret {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    color: var(--muted-foreground);
  }

  .file-main {
    display: flex;
    align-items: center;
    gap: 5px;
    flex: 1;
    min-width: 0;
    padding: 3px 4px 3px 6px;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    text-align: left;
    font-size: 12px;
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
    min-width: 14px;
    text-align: center;
  }

  .status-mod  { color: #e2b340; }
  .status-add  { color: #73c991; }
  .status-del  { color: #f14c4c; }
  .status-untracked { color: #73c991; }
  .status-other { color: var(--muted-foreground); }

  .row-actions {
    display: flex;
    align-items: center;
    gap: 1px;
    padding-right: 4px;
    flex-shrink: 0;
  }

  .icon-action {
    display: flex;
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
    transition: background 100ms, color 100ms;
  }

  .icon-action:hover {
    background: color-mix(in srgb, var(--sidebar-accent) 80%, transparent);
    color: var(--sidebar-foreground);
  }

  .icon-action--accent { color: var(--sidebar-primary); }
  .icon-action--accent:hover {
    background: color-mix(in srgb, var(--sidebar-primary) 15%, transparent);
    color: var(--sidebar-primary);
  }

  .icon-action--danger { color: color-mix(in srgb, var(--destructive, #f87171) 70%, var(--muted-foreground)); }
  .icon-action--danger:hover {
    background: color-mix(in srgb, var(--destructive, #f87171) 12%, transparent);
    color: var(--destructive, #f87171);
  }

  .empty {
    padding: 4px 8px;
    color: var(--muted-foreground);
    font-size: 11px;
  }

  .muted { color: var(--muted-foreground); padding: 12px 8px; }

  /* ── Log ─────────────────────────────────────────── */
  .log {
    list-style: none;
    padding: 0 0 0 6px;
    margin: 0;
    border-left: 1px solid color-mix(in srgb, var(--sidebar-border) 40%, transparent);
  }

  .log li {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 4px 6px;
    position: relative;
  }

  .log-dot {
    flex-shrink: 0;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--sidebar-primary) 60%, transparent);
    margin-top: 4px;
    position: relative;
    left: -9px;
  }

  .log-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-left: -8px;
  }

  .log-subj {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11.5px;
  }

  .log-meta {
    font-size: 10px;
    color: var(--muted-foreground);
  }
</style>
