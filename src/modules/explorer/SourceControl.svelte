<script lang="ts">
  let changes = $state<{ path: string; status: "M" | "A" | "D" | "U" }[]>([]);
  let commitMessage = $state("");

  // TODO: Implement git status via Tauri
</script>

<div class="source-control">
  <div class="commit-section">
    <textarea
      bind:value={commitMessage}
      placeholder="Commit message"
      rows="3"
      class="commit-input"
    ></textarea>
    <button class="commit-btn" disabled={!commitMessage.trim()}>
      Commit
    </button>
  </div>

  <div class="changes-section">
    <div class="section-header">
      <span class="section-title">Changes</span>
      <span class="change-count">{changes.length}</span>
    </div>

    {#if changes.length === 0}
      <div class="no-changes">
        No changes detected
      </div>
    {:else}
      <div class="change-list">
        {#each changes as change}
          <div class="change-item">
            <span class="status status-{change.status.toLowerCase()}">{change.status}</span>
            <span class="path">{change.path}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <div class="actions-section">
    <button class="action-btn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 5v14M5 12h14"/>
      </svg>
      Stage All
    </button>
    <button class="action-btn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
        <path d="M3 3v5h5"/>
      </svg>
      Refresh
    </button>
  </div>
</div>

<style>
  .source-control {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 8px;
    gap: 12px;
  }

  .commit-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .commit-input {
    padding: 8px;
    background: #3c3c3c;
    border: 1px solid #4c4c4c;
    border-radius: 4px;
    color: #d4d4d4;
    font-size: 13px;
    font-family: inherit;
    resize: none;
  }

  .commit-input:focus {
    outline: none;
    border-color: #007acc;
  }

  .commit-btn {
    padding: 8px 12px;
    background: #0e639c;
    border: none;
    border-radius: 4px;
    color: white;
    font-size: 13px;
    cursor: pointer;
  }

  .commit-btn:hover:not(:disabled) {
    background: #1177bb;
  }

  .commit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .changes-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px solid #3c3c3c;
    margin-bottom: 8px;
  }

  .section-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: #bbbbbb;
  }

  .change-count {
    font-size: 11px;
    color: #808080;
    background: #3c3c3c;
    padding: 2px 6px;
    border-radius: 10px;
  }

  .no-changes {
    color: #808080;
    font-size: 13px;
    padding: 16px;
    text-align: center;
  }

  .change-list {
    flex: 1;
    overflow-y: auto;
  }

  .change-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    font-size: 13px;
    cursor: pointer;
    border-radius: 4px;
  }

  .change-item:hover {
    background: #2a2d2e;
  }

  .status {
    font-size: 11px;
    font-weight: 600;
    font-family: monospace;
    width: 16px;
    text-align: center;
  }

  .status-m { color: #e2c08d; }
  .status-a { color: #89d185; }
  .status-d { color: #f14c4c; }
  .status-u { color: #6796e6; }

  .path {
    color: #d4d4d4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actions-section {
    display: flex;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid #3c3c3c;
  }

  .action-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px;
    background: #3c3c3c;
    border: none;
    border-radius: 4px;
    color: #d4d4d4;
    font-size: 12px;
    cursor: pointer;
  }

  .action-btn:hover {
    background: #4c4c4c;
  }
</style>
