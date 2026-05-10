<script lang="ts">
  let searchQuery = $state("");
  let replaceQuery = $state("");
  let showReplace = $state(false);
  let results = $state<{ file: string; line: number; text: string }[]>([]);

  function handleSearch() {
    // TODO: Implement search via Tauri
    console.log("Search:", searchQuery);
  }
</script>

<div class="search-panel">
  <div class="search-inputs">
    <div class="input-row">
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search"
        class="search-input"
        onkeydown={(e) => e.key === "Enter" && handleSearch()}
      />
      <button
        class="toggle-btn"
        class:active={showReplace}
        onclick={() => showReplace = !showReplace}
        title="Toggle Replace"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3 3h10v1H3V3zm0 4h10v1H3V7zm0 4h6v1H3v-1z"/>
        </svg>
      </button>
    </div>

    {#if showReplace}
      <div class="input-row">
        <input
          type="text"
          bind:value={replaceQuery}
          placeholder="Replace"
          class="search-input"
        />
      </div>
    {/if}
  </div>

  <div class="search-options">
    <label class="option">
      <input type="checkbox" />
      <span>Match Case</span>
    </label>
    <label class="option">
      <input type="checkbox" />
      <span>Regex</span>
    </label>
  </div>

  <div class="search-results">
    {#if results.length === 0}
      <div class="no-results">
        {#if searchQuery}
          No results found
        {:else}
          Enter a search term
        {/if}
      </div>
    {:else}
      {#each results as result}
        <div class="result-item">
          <span class="result-file">{result.file}</span>
          <span class="result-line">:{result.line}</span>
          <span class="result-text">{result.text}</span>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .search-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 8px;
  }

  .search-inputs {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 8px;
  }

  .input-row {
    display: flex;
    gap: 4px;
  }

  .search-input {
    flex: 1;
    padding: 6px 8px;
    background: #3c3c3c;
    border: 1px solid #4c4c4c;
    border-radius: 4px;
    color: #d4d4d4;
    font-size: 13px;
  }

  .search-input:focus {
    outline: none;
    border-color: #007acc;
  }

  .toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    background: #3c3c3c;
    border: 1px solid #4c4c4c;
    border-radius: 4px;
    color: #808080;
    cursor: pointer;
  }

  .toggle-btn:hover,
  .toggle-btn.active {
    color: #d4d4d4;
  }

  .search-options {
    display: flex;
    gap: 12px;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #3c3c3c;
  }

  .option {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #808080;
    cursor: pointer;
  }

  .option input {
    width: 14px;
    height: 14px;
  }

  .search-results {
    flex: 1;
    overflow-y: auto;
  }

  .no-results {
    color: #808080;
    font-size: 13px;
    padding: 16px;
    text-align: center;
  }

  .result-item {
    padding: 6px 8px;
    font-size: 12px;
    cursor: pointer;
    border-radius: 4px;
  }

  .result-item:hover {
    background: #2a2d2e;
  }

  .result-file {
    color: #4ec9b0;
  }

  .result-line {
    color: #808080;
  }

  .result-text {
    color: #d4d4d4;
    margin-left: 8px;
  }
</style>
