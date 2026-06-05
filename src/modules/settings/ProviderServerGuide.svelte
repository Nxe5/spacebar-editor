<script lang="ts">
  import CopyableSnippet from "$lib/components/CopyableSnippet.svelte";
  import {
    OLLAMA_API_DOCS,
    LLAMACPP_FLAG_DOCS,
    DEFAULT_OLLAMA_SERVER_TEMPLATE,
    DEFAULT_LLAMACPP_SERVER_TEMPLATE,
    buildOllamaApplyCommands,
    buildOllamaRestartOneLiner,
    buildOllamaApiTestCurl,
    buildOllamaModelfileCommand,
    buildLlamacppApplyCommands,
    buildLlamacppRestartOneLiner,
    buildLlamacppServiceUnit,
    buildLlamacppContextChangeCommand,
    buildLlamacppExecStart,
    buildLlamacppModelChangeCommand,
    buildLlamacppOneShotCommand,
    type LlamacppServerTemplate,
    type OllamaServerTemplate,
  } from "$lib/providerServerConfig";
  import OllamaOverridePanel from "./OllamaOverridePanel.svelte";

  let {
    kind,
    compact = false,
    ollamaTemplate = $bindable(),
    llamacppTemplate = $bindable(),
    ollamaEndpoint = "",
    selectedModel = "",
    ollamaContext = 8192,
    llamacppContext = 8192,
  }: {
    kind: "ollama" | "llamacpp";
    compact?: boolean;
    ollamaTemplate?: OllamaServerTemplate;
    llamacppTemplate?: LlamacppServerTemplate;
    ollamaEndpoint?: string;
    selectedModel?: string;
    ollamaContext?: number;
    llamacppContext?: number;
  } = $props();

  let ollamaTpl = $derived(ollamaTemplate ?? DEFAULT_OLLAMA_SERVER_TEMPLATE);
  let llamacppTpl = $derived(llamacppTemplate ?? DEFAULT_LLAMACPP_SERVER_TEMPLATE);

  let ollamaRestart = $derived(buildOllamaRestartOneLiner());
  let ollamaApply = $derived(buildOllamaApplyCommands());
  let ollamaModelfile = $derived(
    selectedModel
      ? buildOllamaModelfileCommand(selectedModel, ollamaContext, ollamaTpl.numThreads)
      : ""
  );
  let ollamaCurl = $derived(
    selectedModel
      ? buildOllamaApiTestCurl(ollamaEndpoint, selectedModel, ollamaContext, ollamaTpl.numThreads)
      : ""
  );

  let llamacppExec = $derived(buildLlamacppExecStart(llamacppTpl));
  let llamacppUnit = $derived(buildLlamacppServiceUnit(llamacppTpl));
  let llamacppRestart = $derived(buildLlamacppRestartOneLiner(llamacppTpl));
  let llamacppApply = $derived(buildLlamacppApplyCommands(llamacppTpl));
  let llamacppOneShot = $derived(buildLlamacppOneShotCommand(llamacppTpl));
  let llamacppContextCmd = $derived(
    buildLlamacppContextChangeCommand(llamacppTpl, llamacppContext)
  );
  let llamacppModelCmd = $derived(
    buildLlamacppModelChangeCommand(llamacppTpl, llamacppTpl.modelPath)
  );
</script>

<section class="server-guide" class:server-guide--compact={compact}>
  {#if !compact}
    <h4 class="guide-title">Server config (terminal)</h4>
  {/if}
  {#if compact}
    <div class="guide-lead-box">
      <p class="guide-lead-line">
        <span class="guide-lead-tag guide-lead-tag--api">API</span>
        Settings apply on the next chat message (model, context, threads).
      </p>
      <p class="guide-lead-line">
        <span class="guide-lead-tag guide-lead-tag--server">Server</span>
        Copy-paste blocks below use <code class="inline-code">systemctl</code> — requires sudo.
      </p>
    </div>
  {:else}
    <p class="guide-lead note muted">
      Settings above marked <strong>via API</strong> apply on the next chat message. Server blocks below
      are copy-paste snippets for <code class="inline-code">systemctl</code> — requires sudo.
    </p>
  {/if}

  {#if kind === "ollama" && ollamaTemplate}
    {#if compact}
      <details class="guide-panel" open>
        <summary class="guide-panel-summary">Via API (Spacebar Editor)</summary>
        <div class="guide-panel-body">
          <div class="api-table-wrap">
            <table class="api-table api-table--readable">
              <thead>
                <tr><th>Setting</th><th>Where</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {#each OLLAMA_API_DOCS as row}
                  <tr>
                    <td class="api-cell-name">{row.name}</td>
                    <td><span class="via-pill">{row.via}</span></td>
                    <td class="api-cell-notes">{row.notes}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <section class="guide-panel guide-panel--static">
        <header class="guide-panel-header">
          <h4 class="guide-panel-title">override.conf template</h4>
          <p class="guide-panel-desc">Context is per-request via API only — not written to override.conf.</p>
        </header>
        <div class="guide-panel-body">
          <OllamaOverridePanel compact bind:template={ollamaTemplate} />
        </div>
      </section>

      <details class="guide-panel">
        <summary class="guide-panel-summary">Apply &amp; restart</summary>
        <div class="guide-panel-body snippet-stack">
          <CopyableSnippet compact label="After saving override" text={ollamaRestart} />
          <CopyableSnippet compact label="Full apply workflow" text={ollamaApply} />
        </div>
      </details>

      {#if ollamaModelfile}
        <details class="guide-panel">
          <summary class="guide-panel-summary">Custom model variant (optional)</summary>
          <div class="guide-panel-body">
            <CopyableSnippet compact label="Modelfile commands" text={ollamaModelfile} />
          </div>
        </details>
      {/if}

      {#if ollamaCurl}
        <details class="guide-panel">
          <summary class="guide-panel-summary">Test API (curl)</summary>
          <div class="guide-panel-body">
            <CopyableSnippet compact label="curl" text={ollamaCurl} />
          </div>
        </details>
      {/if}
    {:else}
      <p class="group-label">Via API (Spacebar Editor controls these)</p>
      <div class="api-table-wrap">
        <table class="api-table">
          <thead>
            <tr><th>Setting</th><th>Where</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {#each OLLAMA_API_DOCS as row}
              <tr>
                <td>{row.name}</td>
                <td>{row.via}</td>
                <td>{row.notes}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <p class="group-label">Server template (generates override.conf)</p>
      <p class="note muted">
        Edit values below; preview updates live. Context window is per-request via API only — not in
        override.conf. Use the reset control to restore defaults.
      </p>
      <OllamaOverridePanel bind:template={ollamaTemplate} />
      <CopyableSnippet label="After saving override — run in terminal" text={ollamaRestart} />
      <CopyableSnippet label="Full apply workflow" text={ollamaApply} />
      {#if ollamaModelfile}
        <CopyableSnippet label="Create custom model variant (optional)" text={ollamaModelfile} />
      {/if}
      {#if ollamaCurl}
        <CopyableSnippet label="Test API (curl)" text={ollamaCurl} />
      {/if}
    {/if}
  {:else if kind === "llamacpp" && llamacppTemplate}
    {#if compact}
      <section class="guide-panel guide-panel--static">
        <header class="guide-panel-header">
          <h4 class="guide-panel-title">Via API</h4>
          <p class="guide-panel-desc">
            Model id and endpoint in settings. Context is fixed at launch (<code class="inline-code">-c</code>).
          </p>
        </header>
      </section>

      <details class="guide-panel">
        <summary class="guide-panel-summary">llama-server flags</summary>
        <div class="guide-panel-body">
          <div class="api-table-wrap">
            <table class="api-table api-table--readable">
              <thead>
                <tr><th>Flag</th><th>Meaning</th><th>Restart?</th></tr>
              </thead>
              <tbody>
                {#each LLAMACPP_FLAG_DOCS as row}
                  <tr>
                    <td><code class="inline-code">{row.flag}</code></td>
                    <td>{row.meaning}</td>
                    <td>{row.restart === "server" ? "service" : "no"}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <section class="guide-panel guide-panel--static">
        <header class="guide-panel-header">
          <h4 class="guide-panel-title">systemd template</h4>
        </header>
        <div class="guide-panel-body template-grid template-grid--compact">
          <label class="field"><span class="name">Service</span><input class="input input-compact" bind:value={llamacppTemplate.serviceName} /></label>
          <label class="field"><span class="name">Model path</span><input class="input input-compact" bind:value={llamacppTemplate.modelPath} /></label>
          <label class="field"><span class="name">Host</span><input class="input input-compact" bind:value={llamacppTemplate.host} /></label>
          <label class="field"><span class="name">Port</span><input class="input input-compact" type="number" bind:value={llamacppTemplate.port} /></label>
          <label class="field"><span class="name">Context (-c)</span><input class="input input-compact" type="number" bind:value={llamacppTemplate.context} /></label>
          <label class="field"><span class="name">GPU (-ngl)</span><input class="input input-compact" type="number" bind:value={llamacppTemplate.ngl} /></label>
          <label class="field"><span class="name">Threads (-t)</span><input class="input input-compact" type="number" bind:value={llamacppTemplate.threads} /></label>
          <label class="field"><span class="name">Batch (-tb)</span><input class="input input-compact" type="number" bind:value={llamacppTemplate.threadsBatch} /></label>
          <label class="field field-row field-row--compact"><input type="checkbox" class="checkbox" bind:checked={llamacppTemplate.jinja} /><span class="name">--jinja</span></label>
          <label class="field field-row field-row--compact"><input type="checkbox" class="checkbox" bind:checked={llamacppTemplate.flashAttn} /><span class="name">--flash-attn</span></label>
          <label class="field field-row field-row--compact"><input type="checkbox" class="checkbox" bind:checked={llamacppTemplate.mlock} /><span class="name">--mlock</span></label>
        </div>
      </section>

      <details class="guide-panel" open>
        <summary class="guide-panel-summary">Copy-paste snippets</summary>
        <div class="guide-panel-body snippet-stack">
          <CopyableSnippet compact label="ExecStart line" text={llamacppExec} />
          <CopyableSnippet compact label="Full systemd unit" text={llamacppUnit} />
          <CopyableSnippet compact label="After saving unit" text={llamacppRestart} />
          <CopyableSnippet compact label="Full apply workflow" text={llamacppApply} />
        </div>
      </details>

      <details class="guide-panel">
        <summary class="guide-panel-summary">One-shot &amp; tweaks</summary>
        <div class="guide-panel-body snippet-stack">
          <CopyableSnippet compact label="One-shot (no systemd)" text={llamacppOneShot} />
          <CopyableSnippet compact label="Change context only" text={llamacppContextCmd} />
          <CopyableSnippet compact label="Change model path only" text={llamacppModelCmd} />
        </div>
      </details>
    {:else}
      <p class="group-label">Via API (Spacebar Editor)</p>
      <p class="note muted">Model id and endpoint only. Context for llama.cpp is set at server launch (<code class="inline-code">-c</code>).</p>

      <p class="group-label">llama-server flags (your working setup)</p>
      <div class="api-table-wrap">
        <table class="api-table">
          <thead>
            <tr><th>Flag</th><th>Meaning</th><th>Restart?</th></tr>
          </thead>
          <tbody>
            {#each LLAMACPP_FLAG_DOCS as row}
              <tr>
                <td><code class="inline-code">{row.flag}</code></td>
                <td>{row.meaning}</td>
                <td>{row.restart === "server" ? "service" : "no"}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <p class="group-label">Server template (generates systemd unit)</p>
      <div class="template-grid">
        <label class="field"><span class="name">Service name</span><input class="input" bind:value={llamacppTemplate.serviceName} /></label>
        <label class="field"><span class="name">Model (.gguf path)</span><input class="input" bind:value={llamacppTemplate.modelPath} /></label>
        <label class="field"><span class="name">Host</span><input class="input" bind:value={llamacppTemplate.host} /></label>
        <label class="field"><span class="name">Port</span><input class="input" type="number" bind:value={llamacppTemplate.port} /></label>
        <label class="field"><span class="name">Context (-c)</span><input class="input" type="number" bind:value={llamacppTemplate.context} /></label>
        <label class="field"><span class="name">GPU layers (-ngl)</span><input class="input" type="number" bind:value={llamacppTemplate.ngl} /></label>
        <label class="field"><span class="name">Threads (-t)</span><input class="input" type="number" bind:value={llamacppTemplate.threads} /></label>
        <label class="field"><span class="name">Batch threads (-tb)</span><input class="input" type="number" bind:value={llamacppTemplate.threadsBatch} /></label>
        <label class="field"><span class="name">User</span><input class="input" bind:value={llamacppTemplate.user} /></label>
        <label class="field field-row"><input type="checkbox" class="checkbox" bind:checked={llamacppTemplate.jinja} /><span class="name">--jinja</span></label>
        <label class="field field-row"><input type="checkbox" class="checkbox" bind:checked={llamacppTemplate.flashAttn} /><span class="name">--flash-attn on</span></label>
        <label class="field field-row"><input type="checkbox" class="checkbox" bind:checked={llamacppTemplate.mlock} /><span class="name">--mlock</span></label>
      </div>

      <CopyableSnippet label="ExecStart line" text={llamacppExec} />
      <CopyableSnippet label="Full systemd unit (reference)" text={llamacppUnit} />
      <CopyableSnippet label="After saving unit — run in terminal" text={llamacppRestart} />
      <CopyableSnippet label="Full apply workflow" text={llamacppApply} />
      <CopyableSnippet label="One-shot (no systemd)" text={llamacppOneShot} />
      <CopyableSnippet label="Change context only" text={llamacppContextCmd} />
      <CopyableSnippet label="Change model path only" text={llamacppModelCmd} />
    {/if}
  {/if}
</section>

<style>
  .server-guide {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 0;
  }

  .server-guide--compact {
    gap: 14px;
    max-width: 52rem;
  }

  .guide-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }

  .guide-lead {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
  }

  .guide-lead-box {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid #383838;
    border-radius: 8px;
    background: #1c1c1c;
  }

  .guide-lead-line {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: #c8c8c8;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
  }

  .guide-lead-tag {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 2px 7px;
    border-radius: 4px;
  }

  .guide-lead-tag--api {
    color: #86c9b7;
    background: rgba(134, 201, 183, 0.12);
    border: 1px solid rgba(134, 201, 183, 0.35);
  }

  .guide-lead-tag--server {
    color: #a8d4ff;
    background: rgba(168, 212, 255, 0.1);
    border: 1px solid rgba(168, 212, 255, 0.3);
  }

  .guide-panel {
    margin: 0;
    border: 1px solid #383838;
    border-radius: 8px;
    background: #1a1a1a;
    overflow: hidden;
  }

  .guide-panel--static {
    display: flex;
    flex-direction: column;
  }

  .guide-panel-header {
    padding: 10px 14px;
    border-bottom: 1px solid #333;
    background: #222;
  }

  .guide-panel-title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: #e8e8e8;
  }

  .guide-panel-desc {
    margin: 4px 0 0;
    font-size: 12px;
    line-height: 1.45;
    color: #999;
  }

  .guide-panel-summary {
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    color: #e8e8e8;
    padding: 10px 14px;
    list-style: none;
    background: #222;
    user-select: none;
  }

  .guide-panel-summary:hover {
    background: #282828;
  }

  .guide-panel-summary::-webkit-details-marker {
    display: none;
  }

  .guide-panel-summary::before {
    content: "▸ ";
    color: #888;
    font-weight: 400;
  }

  .guide-panel[open] > .guide-panel-summary::before {
    content: "▾ ";
  }

  .guide-panel[open] > .guide-panel-summary {
    border-bottom: 1px solid #333;
  }

  .guide-panel-body {
    padding: 12px 14px;
  }

  .via-pill {
    display: inline-block;
    font-size: 11px;
    font-weight: 500;
    padding: 2px 6px;
    border-radius: 4px;
    background: #2a2a2a;
    color: #b8b8b8;
    white-space: nowrap;
  }

  .api-cell-name {
    font-weight: 600;
    color: #e5e5e5;
    white-space: nowrap;
  }

  .api-cell-notes {
    color: #aaa;
    line-height: 1.45;
  }

  .snippet-stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .template-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 10px;
  }

  .template-grid--compact {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 10px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .field-row {
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }

  .field-row--compact .name {
    font-size: 12px;
  }

  .name {
    font-size: 12px;
    color: #b0b0b0;
  }

  .input {
    width: 100%;
    padding: 7px 10px;
    font-size: 13px;
    color: #e5e5e5;
    background: #141414;
    border: 1px solid #404040;
    border-radius: 6px;
    box-sizing: border-box;
  }

  .input-compact {
    padding: 6px 8px;
    font-size: 13px;
  }

  .api-table-wrap {
    overflow-x: auto;
  }

  .api-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .api-table--readable th,
  .api-table--readable td {
    padding: 8px 10px;
    line-height: 1.45;
  }

  .api-table--readable tbody tr:nth-child(even) {
    background: rgba(255, 255, 255, 0.02);
  }

  .api-table th,
  .api-table td {
    border: 1px solid var(--border, #333);
    text-align: left;
    vertical-align: top;
  }

  .api-table th {
    background: #262626;
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #a3a3a3;
  }
</style>
