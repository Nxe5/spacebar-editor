<script lang="ts">
  import { SHORTCUT_DEFAULTS, type ShortcutId } from "../shortcuts/defaults";
  import { shortcutOverrides, rebind, resetBinding, resetShortcutOverrides } from "../shortcuts/registry";
  import { normalizeKeyEvent, findConflict } from "../shortcuts/keybindingHelpers";

  let filterQuery = $state("");
  let capturingId = $state<ShortcutId | null>(null);
  let captureConflict = $state<ShortcutId | null>(null);
  let captureEl = $state<HTMLElement | undefined>();

  $effect(() => {
    if (capturingId && captureEl) captureEl.focus();
  });

  let filtered = $derived(
    SHORTCUT_DEFAULTS.filter((row) =>
      filterQuery.trim() === "" ||
      row.description.toLowerCase().includes(filterQuery.toLowerCase()) ||
      row.category.toLowerCase().includes(filterQuery.toLowerCase())
    )
  );

  function activeKey(id: ShortcutId): string {
    return $shortcutOverrides[id] ?? SHORTCUT_DEFAULTS.find((r) => r.id === id)!.keys;
  }

  function isModified(id: ShortcutId): boolean {
    return id in $shortcutOverrides;
  }

  function conflictFor(id: ShortcutId): string | null {
    const conflict = findConflict(activeKey(id), id, $shortcutOverrides);
    if (!conflict) return null;
    return SHORTCUT_DEFAULTS.find((r) => r.id === conflict)?.description ?? conflict;
  }

  function startCapture(id: ShortcutId) {
    capturingId = id;
    captureConflict = null;
  }

  function cancelCapture() {
    capturingId = null;
    captureConflict = null;
  }

  function onCaptureKeydown(e: KeyboardEvent) {
    if (!capturingId) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
      cancelCapture();
      return;
    }

    const keyStr = normalizeKeyEvent(e);
    if (!keyStr) return; // pure modifier — wait for the actual key

    const conflict = findConflict(keyStr, capturingId, $shortcutOverrides);
    rebind(capturingId, keyStr);
    capturingId = null;
    captureConflict = conflict;
  }

  function handleResetAll() {
    if (confirm("Reset all shortcuts to their defaults?")) {
      resetShortcutOverrides();
    }
  }

  function formatKey(k: string): string {
    return k.replace("Mod", "Ctrl/⌘");
  }
</script>

<div class="stack">
  <div class="header-row">
    <div>
      <h3 class="title">Keybindings</h3>
      <p class="note">Customize keyboard shortcuts. Changes take effect immediately.</p>
    </div>
    <button type="button" class="btn ghost" onclick={handleResetAll}>Reset all</button>
  </div>

  <input
    type="text"
    bind:value={filterQuery}
    placeholder="Filter shortcuts…"
    class="filter-input"
    aria-label="Filter shortcuts"
  />

  <p class="hint">Press <kbd class="kbd">Esc</kbd> while editing to cancel.</p>

  <table class="kbd-table">
    <thead>
      <tr>
        <th>Action</th>
        <th>Binding</th>
        <th>Category</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#each filtered as row (row.id)}
        {@const conflict = conflictFor(row.id)}
        <tr class:conflict={!!conflict} class:modified={isModified(row.id)}>
          <td class="action-cell">
            {row.description}
            {#if conflict}
              <span class="conflict-warn" title="Conflicting shortcut">⚠ Conflicts with "{conflict}"</span>
            {/if}
          </td>
          <td class="binding-cell">
            {#if capturingId === row.id}
              <span
                bind:this={captureEl}
                class="capture-input"
                role="textbox"
                tabindex="0"
                aria-label="Press a key combination"
                onkeydown={onCaptureKeydown}
              >Press a key…</span>
            {:else}
              <code class="kbd">{formatKey(activeKey(row.id))}</code>
            {/if}
          </td>
          <td class="category-cell">{row.category}</td>
          <td class="actions-cell">
            {#if capturingId === row.id}
              <button type="button" class="action-btn" onclick={cancelCapture} title="Cancel">✕</button>
            {:else}
              <button
                type="button"
                class="action-btn edit-btn"
                onclick={() => startCapture(row.id)}
                title="Edit shortcut"
              >Edit</button>
              {#if isModified(row.id)}
                <button
                  type="button"
                  class="action-btn reset-btn"
                  onclick={() => resetBinding(row.id)}
                  title="Reset to default"
                >↺</button>
              {/if}
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  {#if filtered.length === 0}
    <p class="empty-note">No shortcuts match "{filterQuery}"</p>
  {/if}

  <p class="hint">Single-key combinations only — chord shortcuts are not supported.</p>
</div>

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .header-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .title {
    margin: 0 0 4px;
    font-size: 16px;
    font-weight: 600;
    color: #e8e8e8;
  }

  .note {
    margin: 0;
    font-size: 12px;
    color: #737373;
  }

  .hint {
    margin: 0;
    font-size: 11px;
    color: #5c5c5c;
  }

  .filter-input {
    width: 100%;
    padding: 7px 10px;
    font-size: 13px;
    color: #e5e5e5;
    background: #1c1c1c;
    border: 1px solid #404040;
    border-radius: 6px;
    box-sizing: border-box;
  }

  .filter-input:focus {
    outline: none;
    border-color: #525252;
  }

  .kbd-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .kbd-table th {
    padding: 6px 8px;
    border-bottom: 1px solid #333;
    text-align: left;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #666;
  }

  .kbd-table td {
    padding: 7px 8px;
    border-bottom: 1px solid #2a2a2a;
    vertical-align: middle;
  }

  tr.modified .action-cell {
    color: #569cd6;
  }

  tr.conflict .binding-cell .kbd {
    color: #d4a017;
  }

  .action-cell {
    color: #c8c8c8;
  }

  .conflict-warn {
    display: block;
    font-size: 10px;
    color: #d4a017;
    margin-top: 2px;
  }

  .binding-cell {
    width: 140px;
    white-space: nowrap;
  }

  .kbd {
    font-family: ui-monospace, monospace;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    background: #1c1c1c;
    border: 1px solid #3c3c3c;
    color: #c5c5c5;
  }

  .capture-input {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    background: rgba(0, 122, 204, 0.15);
    border: 1px solid #007acc;
    color: #569cd6;
    font-size: 11px;
    font-family: ui-monospace, monospace;
    cursor: text;
    outline: none;
  }

  .capture-input:focus {
    border-color: #569cd6;
  }

  .category-cell {
    color: #666;
    font-size: 11px;
  }

  .actions-cell {
    width: 80px;
    text-align: right;
    white-space: nowrap;
  }

  .action-btn {
    padding: 2px 7px;
    font-size: 11px;
    border-radius: 3px;
    border: 1px solid #3c3c3c;
    background: transparent;
    color: #888;
    cursor: pointer;
  }

  .action-btn:hover {
    background: #2a2a2a;
    color: #c8c8c8;
  }

  .edit-btn { margin-right: 4px; }

  .reset-btn {
    border-color: transparent;
    color: #569cd6;
  }

  .reset-btn:hover {
    border-color: #3c3c3c;
    background: #1a2a3a;
  }

  .btn {
    padding: 6px 12px;
    font-size: 12px;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid transparent;
    white-space: nowrap;
    flex-shrink: 0;
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

  .empty-note {
    margin: 0;
    font-size: 12px;
    color: #5c5c5c;
    text-align: center;
    padding: 12px;
  }
</style>
