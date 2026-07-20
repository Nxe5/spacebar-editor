<script lang="ts">
  import { updateStatus } from "$lib/stores/updateStatus";
  import type { DownloadEvent } from "@tauri-apps/plugin-updater";

  const DISMISSED_KEY = "sidebar.updateDismissedVersion";

  let dismissedVersion = $state(
    typeof localStorage !== "undefined" ? localStorage.getItem(DISMISSED_KEY) : null,
  );
  let installing = $state(false);
  let downloadedBytes = $state(0);
  let totalBytes = $state<number | null>(null);
  let error = $state<string | null>(null);

  const status = $derived($updateStatus);

  // Gated by `dismissedVersion` rather than "did we already show this session" —
  // clicking Later for v2 suppresses v2 for good, but if a newer v3 shows up
  // later in the same session (24h re-check), it's worth surfacing once.
  const visible = $derived(
    status.dot === "yellow" &&
      status.pendingUpdate !== null &&
      status.latestVersion !== null &&
      status.latestVersion !== dismissedVersion,
  );

  const progressPct = $derived(
    totalBytes ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : null,
  );

  function dismiss() {
    if (status.latestVersion) {
      localStorage.setItem(DISMISSED_KEY, status.latestVersion);
      dismissedVersion = status.latestVersion;
    }
  }

  async function updateNow() {
    const update = status.pendingUpdate;
    if (!update || installing) return;
    installing = true;
    error = null;
    downloadedBytes = 0;
    totalBytes = null;
    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") totalBytes = event.data.contentLength ?? null;
        if (event.event === "Progress") downloadedBytes += event.data.chunkLength;
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      installing = false;
      error = e instanceof Error ? e.message : String(e);
    }
  }
</script>

{#if visible}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="backdrop" role="presentation">
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-dialog-title"
      tabindex="-1"
    >
      <h2 id="update-dialog-title" class="title">Update available</h2>
      <p class="body">
        Spacebar Editor <strong>v{status.latestVersion}</strong> is ready — you're on
        v{status.currentVersion}.
      </p>

      {#if error}
        <p class="body error">Update failed: {error}</p>
      {/if}

      {#if installing}
        <div class="progress-track">
          <div class="progress-fill" style={`width: ${progressPct ?? 15}%`}></div>
        </div>
        <p class="body muted">{progressPct !== null ? `${progressPct}%` : "Downloading…"}</p>
      {/if}

      <div class="actions">
        <button type="button" class="btn primary" onclick={updateNow} disabled={installing}>
          {installing ? "Updating…" : "Update Now"}
        </button>
        <button type="button" class="btn ghost" onclick={dismiss} disabled={installing}>
          Later
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.65);
    padding: 24px;
  }

  .dialog {
    box-sizing: border-box;
    width: min(420px, calc(100vw - 48px));
    background: #262626;
    border: 1px solid #3f3f3f;
    border-radius: 10px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
    padding: 20px 22px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: #e8e8e8;
  }

  .body {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: #a3a3a3;
  }

  .body.muted {
    font-size: 12px;
    color: #737373;
  }

  .body.error {
    color: #f85149;
  }

  .progress-track {
    height: 4px;
    border-radius: 2px;
    background: #3a3a3a;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: #d29922;
    transition: width 0.2s ease;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 4px;
  }

  .btn {
    font-size: 13px;
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid transparent;
    cursor: pointer;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .btn.primary {
    background: #d29922;
    color: #1a1a1a;
    border-color: #b8830f;
    font-weight: 600;
  }

  .btn.ghost {
    background: transparent;
    color: #a3a3a3;
    border-color: transparent;
  }
</style>
