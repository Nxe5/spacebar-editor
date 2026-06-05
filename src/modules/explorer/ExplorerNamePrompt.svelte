<script lang="ts">
  import { normalizeFilePath } from "$lib/fsPath";

  export type ExplorerNamePromptKind = "file" | "folder";

  interface Props {
    open: boolean;
    kind: ExplorerNamePromptKind;
    parentPath: string;
    workspacePath: string | null;
    onConfirm: (name: string) => void;
    onCancel: () => void;
  }

  let {
    open = false,
    kind,
    parentPath,
    workspacePath,
    onConfirm,
    onCancel,
  }: Props = $props();

  let name = $state("");
  let inputEl = $state<HTMLInputElement | null>(null);

  const title = $derived(kind === "file" ? "New file" : "New folder");
  const label = $derived(kind === "file" ? "File name" : "Folder name");
  const placeholder = $derived(kind === "file" ? "example.ts" : "components");
  const confirmLabel = $derived(kind === "file" ? "Create file" : "Create folder");

  const locationHint = $derived.by(() => {
    if (!workspacePath) return parentPath;
    const ws = normalizeFilePath(workspacePath);
    const parent = normalizeFilePath(parentPath);
    if (parent === ws) return "Workspace root";
    if (parent.startsWith(`${ws}/`)) return parent.slice(ws.length + 1);
    return parent;
  });

  $effect(() => {
    if (open) {
      name = "";
      queueMicrotask(() => inputEl?.focus());
    }
  });

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    } else if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="backdrop" role="presentation" onclick={onCancel}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="explorer-name-prompt-title"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={onKeydown}
    >
      <header class="dialog-header">
        <h2 id="explorer-name-prompt-title" class="title">{title}</h2>
        <button type="button" class="close-btn" aria-label="Close" onclick={onCancel}>×</button>
      </header>

      <div class="dialog-body">
        <p class="lead">Create in <code class="location">{locationHint}</code></p>
        <label class="field">
          <span class="field-label">{label}</span>
          <input
            bind:this={inputEl}
            type="text"
            class="input"
            bind:value={name}
            {placeholder}
            autocomplete="off"
            spellcheck="false"
          />
        </label>
      </div>

      <footer class="dialog-footer">
        <button type="button" class="btn secondary" onclick={onCancel}>Cancel</button>
        <button type="button" class="btn primary" disabled={!name.trim()} onclick={submit}>
          {confirmLabel}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 300;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(0, 0, 0, 0.72);
  }

  .dialog {
    box-sizing: border-box;
    width: min(420px, calc(100vw - 48px));
    display: flex;
    flex-direction: column;
    background: #262626;
    border: 1px solid #3f3f3f;
    border-radius: 10px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
    overflow: hidden;
  }

  .dialog-header {
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
    letter-spacing: -0.01em;
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
    color: #888;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
  }

  .close-btn:hover {
    background: #363636;
    color: #ccc;
  }

  .dialog-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 16px;
  }

  .lead {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: #a3a3a3;
  }

  .location {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    padding: 1px 5px;
    border-radius: 4px;
    background: #1c1c1c;
    border: 1px solid #404040;
    color: #4ec9b0;
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

  .input {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    font-size: 13px;
    color: #e5e5e5;
    background: #1c1c1c;
    border: 1px solid #404040;
    border-radius: 6px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }

  .input:focus {
    outline: none;
    border-color: #007acc;
    box-shadow: 0 0 0 1px #007acc;
  }

  .dialog-footer {
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
