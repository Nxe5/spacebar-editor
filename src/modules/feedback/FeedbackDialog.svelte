<script lang="ts">
  import { toast } from "svelte-sonner";
  import {
    FEEDBACK_CONTACT_EMAIL,
    FEEDBACK_KIND_OPTIONS,
    buildFeedbackMailto,
    type FeedbackKind,
  } from "$lib/feedback";
  import { openExternalUrl } from "$lib/ipc";
  import { updateStatus } from "$lib/stores/updateStatus";

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  let kind = $state<FeedbackKind>("suggestion");
  let message = $state("");
  let sending = $state(false);

  function resetForm() {
    kind = "suggestion";
    message = "";
    sending = false;
  }

  function handleBackdropMouseDown(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (!open || e.key !== "Escape") return;
    onClose();
  }

  async function submitFeedback() {
    const body = message.trim();
    if (!body) {
      toast.error("Please describe your feedback before sending.");
      return;
    }
    sending = true;
    try {
      const url = buildFeedbackMailto({ kind, body, appVersion: $updateStatus.currentVersion });
      await openExternalUrl(url);
      toast.success("Opening your email app…");
      resetForm();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      sending = false;
    }
  }

  function cancel() {
    resetForm();
    onClose();
  }

</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={handleBackdropMouseDown} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-title"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
    >
      <header class="modal-header">
        <h2 id="feedback-title" class="title">Send feedback</h2>
        <button type="button" class="close-btn" onclick={cancel} aria-label="Close">×</button>
      </header>

      <div class="modal-body">
        <p class="lead">
          Bugs, ideas, and questions are welcome. Your message opens in your default mail app.
        </p>

        <label class="field">
          <span class="field-label">To</span>
          <a class="field-email" href="mailto:{FEEDBACK_CONTACT_EMAIL}">{FEEDBACK_CONTACT_EMAIL}</a>
        </label>

        <label class="field">
          <span class="field-label">Type</span>
          <select class="select" bind:value={kind} disabled={sending}>
            {#each FEEDBACK_KIND_OPTIONS as opt (opt.id)}
              <option value={opt.id}>{opt.label}</option>
            {/each}
          </select>
        </label>

        <label class="field field--grow">
          <span class="field-label">Message</span>
          <textarea
            class="textarea"
            bind:value={message}
            rows={8}
            placeholder="What happened, what you expected, or what you'd like to see…"
            disabled={sending}
          ></textarea>
        </label>
      </div>

      <footer class="modal-footer">
        <button type="button" class="btn secondary" onclick={cancel} disabled={sending}>
          Cancel
        </button>
        <button type="button" class="btn primary" onclick={() => void submitFeedback()} disabled={sending}>
          Send
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 210;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(0, 0, 0, 0.72);
  }

  .modal {
    box-sizing: border-box;
    width: min(480px, calc(100vw - 48px));
    max-height: min(640px, calc(100vh - 48px));
    display: flex;
    flex-direction: column;
    background: #262626;
    border: 1px solid #3f3f3f;
    border-radius: 10px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px 10px;
    border-bottom: 1px solid #333;
  }

  .title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: #e8e8e8;
  }

  .close-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #a0a0a0;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #e8e8e8;
  }

  .modal-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 16px;
    overflow-y: auto;
    min-height: 0;
  }

  .lead {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: #a0a0a0;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-label {
    font-size: 11px;
    font-weight: 600;
    color: #9cdcfe;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .field-email {
    font-size: 13px;
    color: #4ec9b0;
    text-decoration: none;
    word-break: break-all;
  }

  .field-email:hover {
    text-decoration: underline;
  }

  .select,
  .textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    border: 1px solid #3c3c3c;
    border-radius: 6px;
    background: #1e1e1e;
    color: #e8e8e8;
    font: inherit;
    font-size: 13px;
  }

  .textarea {
    resize: vertical;
    min-height: 140px;
    line-height: 1.45;
  }

  .select:focus-visible,
  .textarea:focus-visible {
    outline: 1px solid #007acc;
    outline-offset: 1px;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px 14px;
    border-top: 1px solid #333;
  }

  .btn {
    padding: 7px 14px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn.primary {
    background: #007acc;
    color: #fff;
    border-color: #007acc;
  }

  .btn.primary:hover:not(:disabled) {
    background: #0098ff;
  }

  .btn.secondary {
    background: transparent;
    color: #ccc;
    border-color: #4a4a4a;
  }

  .btn.secondary:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.06);
    color: #e8e8e8;
  }
</style>
