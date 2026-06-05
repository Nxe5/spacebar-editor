<script lang="ts">
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import {
    pickWorkspaceFolder,
    getRecentProjects,
    isTauriAvailable,
  } from "$lib/ipc";
  import { applyWorkspaceFolder } from "$lib/workspace";
  import { files } from "$lib/stores/files";
  import { normalizeFilePath } from "$lib/fsPath";

  let recentProjects = $state<string[]>([]);
  let opening = $state(false);
  const desktop = isTauriAvailable();

  onMount(async () => {
    if (desktop) {
      recentProjects = await getRecentProjects().catch(() => []);
    }
  });

  function folderName(path: string): string {
    const parts = normalizeFilePath(path).split("/").filter(Boolean);
    return parts[parts.length - 1] ?? path;
  }

  function parentPath(path: string): string {
    const parts = normalizeFilePath(path).split("/").filter(Boolean);
    return parts.length > 1 ? parts.slice(0, -1).join("/") : path;
  }

  async function openFolder() {
    if (opening) return;
    opening = true;
    try {
      const path = await pickWorkspaceFolder();
      if (path) await applyWorkspaceFolder(path);
    } catch (e) {
      console.error("[workspace] open folder failed:", e);
      toast.error(String(e));
    } finally {
      opening = false;
    }
  }

  async function openRecent(path: string) {
    if (opening) return;
    opening = true;
    try {
      await applyWorkspaceFolder(path);
    } catch (e) {
      console.error("[workspace] open recent failed:", e);
      toast.error(String(e));
    } finally {
      opening = false;
    }
  }

  /** Web/dev-only: sets a synthetic workspace path so the full UI is accessible. */
  function previewUi() {
    files.setWorkspacePath("/dev/preview");
  }
</script>

<div class="welcome">
  <div class="welcome-card">
    <h1 class="welcome-title">Sidebar Editor</h1>
    <p class="welcome-subtitle">Local-first AI coding assistant</p>

    <div class="action-row">
      <button
        type="button"
        class="btn primary"
        onclick={openFolder}
        disabled={opening || !desktop}
      >
        {opening ? "Opening…" : "Open project folder"}
      </button>

      <button
        type="button"
        class="btn ghost"
        disabled
        title="Coming in v0.1.1"
      >
        Tutorial
      </button>
    </div>

    {#if recentProjects.length > 0}
      <div class="recents">
        <h2 class="recents-heading">Recent projects</h2>
        <ul class="recents-list">
          {#each recentProjects as path (path)}
            <li>
              <button
                type="button"
                class="recent-item"
                onclick={() => void openRecent(path)}
                disabled={opening}
                title={path}
              >
                <span class="recent-name">{folderName(path)}</span>
                <span class="recent-path">/{parentPath(path)}</span>
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if !desktop}
      <button type="button" class="preview-link" onclick={previewUi}>
        Preview UI without a folder
      </button>
    {/if}
  </div>
</div>

<style>
  .welcome {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    background: var(--background, #1e1e1e);
    padding: 24px;
  }

  .welcome-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    max-width: 400px;
    width: 100%;
  }

  .welcome-title {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    color: var(--foreground, #d4d4d4);
    letter-spacing: -0.02em;
  }

  .welcome-subtitle {
    margin: 0;
    font-size: 13px;
    color: var(--muted-foreground, #808080);
  }

  .action-row {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 12px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .btn {
    padding: 9px 20px;
    font-size: 13px;
    font-weight: 500;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid transparent;
    transition: background 0.1s, border-color 0.1s;
  }

  .btn.primary {
    background: #333;
    border-color: #404040;
    color: #e5e5e5;
  }

  .btn.primary:hover:not(:disabled) {
    background: #444;
    border-color: #555;
  }

  .btn.ghost {
    background: transparent;
    border-color: #404040;
    color: #737373;
  }

  .btn.ghost:hover:not(:disabled) {
    background: #2a2a2a;
    color: #a3a3a3;
  }

  .btn:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .recents {
    width: 100%;
    margin-top: 8px;
  }

  .recents-heading {
    margin: 0 0 6px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted-foreground, #808080);
  }

  .recents-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .recent-item {
    display: flex;
    flex-direction: column;
    gap: 1px;
    width: 100%;
    padding: 7px 10px;
    border: none;
    border-radius: 6px;
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s;
  }

  .recent-item:hover:not(:disabled) {
    background: var(--accent, #2d2d30);
  }

  .recent-item:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .recent-name {
    font-size: 13px;
    color: var(--foreground, #d4d4d4);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .recent-path {
    font-size: 11px;
    color: var(--muted-foreground, #808080);
    font-family: ui-monospace, monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .preview-link {
    margin-top: 8px;
    padding: 0;
    border: none;
    background: none;
    font-size: 11px;
    color: var(--muted-foreground, #606060);
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: #404040;
  }

  .preview-link:hover {
    color: var(--foreground, #a3a3a3);
  }
</style>
