<script lang="ts">
  import { pendingTrustDecision, resolveTrustDecision } from "$lib/workspaceTrust";
  import { workspaceFolderName } from "$lib/workspace";

  const pending = $derived($pendingTrustDecision);

  function folderLabel(path: string): string {
    return workspaceFolderName(path);
  }
</script>

{#if pending}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="backdrop" role="presentation">
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trust-dialog-title"
      tabindex="-1"
    >
      <h2 id="trust-dialog-title" class="title">Trust this workspace?</h2>
      <p class="body">
        <strong>{folderLabel(pending.workspacePath)}</strong> contains agent configuration
        that will be injected into the system prompt and may change tool permissions.
      </p>
      <ul class="summary">
        {#if pending.summary.skillCount > 0}
          <li>{pending.summary.skillCount} skill{pending.summary.skillCount === 1 ? "" : "s"}</li>
        {/if}
        {#if pending.summary.promptFileCount > 0}
          <li>{pending.summary.promptFileCount} system prompt file{pending.summary.promptFileCount === 1 ? "" : "s"}</li>
        {/if}
        {#if pending.summary.toolRuleCount > 0}
          <li>{pending.summary.toolRuleCount} tool policy override{pending.summary.toolRuleCount === 1 ? "" : "s"}</li>
        {/if}
        {#if pending.summary.customToolCount > 0}
          <li>{pending.summary.customToolCount} custom tool{pending.summary.customToolCount === 1 ? "" : "s"}</li>
        {/if}
      </ul>
      <p class="body muted">
        Only trust folders you opened intentionally. Cloned or downloaded repositories can
        include instructions that affect agent behavior.
      </p>
      <div class="actions">
        <button type="button" class="btn primary" onclick={() => resolveTrustDecision("trusted")}>
          Trust &amp; open
        </button>
        <button type="button" class="btn secondary" onclick={() => resolveTrustDecision("restricted")}>
          Open in restricted mode
        </button>
        <button type="button" class="btn ghost" onclick={() => resolveTrustDecision("cancel")}>
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
    width: min(480px, calc(100vw - 48px));
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

  .summary {
    margin: 0;
    padding-left: 1.2rem;
    font-size: 13px;
    color: #d4d4d4;
    line-height: 1.6;
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

  .btn.primary {
    background: #2563eb;
    color: #fff;
    border-color: #1d4ed8;
  }

  .btn.secondary {
    background: #333;
    color: #e8e8e8;
    border-color: #525252;
  }

  .btn.ghost {
    background: transparent;
    color: #a3a3a3;
    border-color: transparent;
  }
</style>
