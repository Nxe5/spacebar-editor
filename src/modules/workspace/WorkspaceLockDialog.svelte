<script lang="ts">
  import { pendingLockConflict, resolveLockConflict } from "$lib/workspace";

  const info = $derived($pendingLockConflict);

  function minutesAgo(iso: string): string {
    try {
      const diff = Date.now() - new Date(iso).getTime();
      const mins = Math.round(diff / 60_000);
      if (mins < 1) return "just now";
      if (mins === 1) return "1 minute ago";
      return `${mins} minutes ago`;
    } catch {
      return iso;
    }
  }
</script>

{#if info}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="backdrop" role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="lock-dialog-title" tabindex="-1">
      <h2 id="lock-dialog-title" class="title">Folder already open</h2>
      <p class="body">
        This folder is already open in another Spacebar Editor window
        (PID {info.pid}, opened {minutesAgo(info.timestamp)}).
      </p>
      <p class="body warn">
        Opening the same folder in two windows can corrupt your saved state.
      </p>
      <div class="actions">
        <button type="button" class="btn secondary" onclick={() => resolveLockConflict(true)}>
          Open read-only
        </button>
        <button type="button" class="btn ghost" onclick={() => resolveLockConflict(false)}>
          Cancel
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
    width: min(440px, calc(100vw - 48px));
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

  .body.warn {
    color: #d4a017;
  }

  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 4px;
  }

  .btn {
    padding: 7px 14px;
    font-size: 12px;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid transparent;
  }

  .btn.secondary {
    background: #333;
    color: #e5e5e5;
    border-color: #404040;
  }

  .btn.secondary:hover {
    background: #404040;
  }

  .btn.ghost {
    background: transparent;
    color: #a3a3a3;
    border-color: #404040;
  }

  .btn.ghost:hover {
    background: #333;
    color: #e5e5e5;
  }
</style>
