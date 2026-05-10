<script lang="ts">
  import { get } from "svelte/store";
  import {
    settings,
    AVAILABLE_MODELS,
    HARNESS_OPTIONS,
    type ModelConfig,
    type ChatBackend,
    type HarnessKindId,
  } from "$lib/stores/settings";
  import {
    fetchOllamaModelList,
    RECOMMENDED_OLLAMA_MODELS,
    contextOptionsUpTo,
    pickContextOption,
  } from "$lib/ollamaClient";
  import { fetchLlamacppModelList, DEFAULT_LLAMACPP_ENDPOINT } from "$lib/llamaCppClient";
  import { toolPolicy as toolPolicyStore } from "$lib/stores/toolPolicy";
  import type { ToolPolicyMode } from "$lib/toolPolicy";
  import { parseWhitelistInput } from "$lib/toolPolicy";
  import { SHORTCUT_DEFAULTS } from "../shortcuts/defaults";
  import { WORKBENCH_THEME_OPTIONS, type WorkbenchThemeId } from "$lib/workbench-theme";

  interface Props {
    open: boolean;
    onClose: () => void;
    /** Full-window layout (secondary settings webview) instead of modal backdrop */
    variant?: "modal" | "page";
  }

  let { open, onClose, variant = "modal" }: Props = $props();

  let visible = $derived(open || variant === "page");

  type Section = "general" | "models" | "harness" | "appearance" | "keybindings";
  let activeSection = $state<Section>("models");

  let anthropicKey = $state("");
  let openaiKey = $state("");
  let ollamaEndpoint = $state("");
  let selectedModel = $state("");
  let ollamaModels = $state<ModelConfig[]>([]);
  let loadingOllama = $state(false);
  let loadingLlamacpp = $state(false);
  let llamacppEndpoint = $state(DEFAULT_LLAMACPP_ENDPOINT);
  let llamacppApiKey = $state("");
  let harnessKind = $state<HarnessKindId>("pi-latest");
  let toolPolicyMode = $state<ToolPolicyMode>("allow_all");
  let whitelistRaw = $state("");
  let chatBackend = $state<ChatBackend>("anthropic");
  let anthropicExtendedThinking = $state(true);
  /** Ollama chat `num_ctx` for the selected model (≤ model max). */
  let ollamaContextChoice = $state(8192);
  let workbenchTheme = $state<WorkbenchThemeId>("vscode-dark");

  const sections: { id: Section; label: string }[] = [
    { id: "general", label: "General" },
    { id: "models", label: "Models" },
    { id: "harness", label: "Harness" },
    { id: "appearance", label: "Appearance" },
    { id: "keybindings", label: "Keybindings" },
  ];

  /** When false, the next time `open` is true we treat it as a fresh open (sync from stores). */
  let settingsModalWasOpen = $state(false);

  $effect(() => {
    if (!visible) {
      settingsModalWasOpen = false;
      return;
    }
    const justOpened = !settingsModalWasOpen;
    settingsModalWasOpen = true;
    if (!justOpened) {
      return;
    }

    anthropicKey = $settings.apiKeys.anthropic;
    openaiKey = $settings.apiKeys.openai;
    ollamaEndpoint = $settings.ollamaEndpoint;
    llamacppEndpoint = $settings.llamacppEndpoint;
    llamacppApiKey = $settings.llamacppApiKey;
    selectedModel = $settings.selectedModel;
    ollamaModels = $settings.ollamaModels;
    toolPolicyMode = $toolPolicyStore.mode;
    whitelistRaw = $toolPolicyStore.whitelist.join(", ");
    chatBackend = $settings.chatBackend;
    harnessKind = $settings.harnessKind;
    anthropicExtendedThinking = $settings.anthropicExtendedThinking;
    workbenchTheme = $settings.workbenchTheme;
    void fetchOllamaModels();
    if ($settings.chatBackend === "llamacpp") {
      void fetchLlamacppModels();
    }
  });

  async function fetchLlamacppModels() {
    loadingLlamacpp = true;
    try {
      const rows = await fetchLlamacppModelList(llamacppEndpoint, llamacppApiKey);
      settings.setLlamacppModels(rows as ModelConfig[]);
    } catch {
      settings.setLlamacppModels([]);
    } finally {
      loadingLlamacpp = false;
    }
  }

  async function fetchOllamaModels() {
    loadingOllama = true;
    try {
      const prev = get(settings).ollamaModels;
      ollamaModels = await fetchOllamaModelList(ollamaEndpoint, prev);
      settings.setOllamaModels(ollamaModels);
    } catch {
      ollamaModels = [];
    } finally {
      loadingOllama = false;
    }
  }

  function maxCtxForSelectedOllama(modelId: string): number {
    const row = ollamaModels.find((m) => m.id === modelId);
    if (row?.contextLimitMax != null) return row.contextLimitMax;
    const rec = RECOMMENDED_OLLAMA_MODELS.find((r) => r.id === modelId);
    return rec?.contextLimitMax ?? rec?.contextWindow ?? 8192;
  }

  function fmtCtx(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 10_000) return `${Math.round(n / 1000)}k`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  }

  $effect(() => {
    if (!visible || chatBackend !== "ollama") return;
    void [selectedModel, ollamaModels];
    const max = maxCtxForSelectedOllama(selectedModel);
    const row = ollamaModels.find((m) => m.id === selectedModel);
    const cur = row?.contextWindow ?? Math.min(8192, max);
    ollamaContextChoice = pickContextOption(cur, max);
  });

  function handleSave() {
    settings.setApiKey("anthropic", anthropicKey);
    settings.setApiKey("openai", openaiKey);
    settings.setOllamaEndpoint(ollamaEndpoint);
    settings.setLlamacppEndpoint(llamacppEndpoint);
    settings.setLlamacppApiKey(llamacppApiKey);
    settings.setSelectedModel(selectedModel);
    toolPolicyStore.setMode(toolPolicyMode);
    toolPolicyStore.setWhitelist(parseWhitelistInput(whitelistRaw));
    settings.setChatBackend(chatBackend); /* after model: normalizes if backend/model disagree */
    settings.setHarnessKind(harnessKind);
    settings.setAnthropicExtendedThinking(anthropicExtendedThinking);
    settings.setWorkbenchTheme(workbenchTheme);

    if (chatBackend === "ollama") {
      const sid = selectedModel;
      const models = get(settings).ollamaModels;
      const next = models.map((m) =>
        m.id === sid ? { ...m, contextWindow: ollamaContextChoice } : m
      );
      settings.setOllamaModels(next);
    }

    onClose();
  }

  function onBackdropMouseDown(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

</script>

<svelte:window onkeydown={(e) => visible && variant === "modal" && e.key === "Escape" && onClose()} />

{#snippet settingsShell()}
      <header class="modal-header">
        <h2 id="settings-title" class="title">Settings</h2>
        <button type="button" class="icon-close" onclick={onClose} aria-label="Close">×</button>
      </header>

      <div class="modal-main">
        <nav class="nav-rail" aria-label="Settings sections">
          {#each sections as s}
            <button
              type="button"
              class="nav-item"
              class:active={activeSection === s.id}
              onclick={() => (activeSection = s.id)}
            >
              {s.label}
            </button>
          {/each}
        </nav>

        <div class="modal-body">
        {#if activeSection === "general"}
          <div class="stack">
            <label class="field">
              <span class="name">Workspace</span>
              <span class="hint">Current working directory (from app)</span>
              <input type="text" value="/" disabled class="input" />
            </label>
            <label class="field">
              <span class="name">Auto-save</span>
              <select class="input">
                <option value="off">Off</option>
                <option value="onFocusChange">On focus change</option>
                <option value="afterDelay">After delay</option>
              </select>
            </label>
          </div>

        {:else if activeSection === "models"}
          <div class="stack">
            <p class="group-label">Who answers chat</p>
            <p class="note">
              <strong>Anthropic</strong> uses your API key and Claude models.
              <strong>Ollama</strong> and <strong>llama.cpp</strong> are local: Ollama’s HTTP API (port 11434), or
              <code class="inline-code">llama-server</code>’s OpenAI-compatible API (often port 8080).
            </p>
            <div class="backend-toggle" role="group" aria-label="Chat backend">
              <button
                type="button"
                class="backend-btn"
                class:active={chatBackend === "anthropic"}
                onclick={() => {
                  chatBackend = "anthropic";
                  const ids = AVAILABLE_MODELS.filter((m) => m.provider === "anthropic").map((m) => m.id);
                  if (!ids.includes(selectedModel)) selectedModel = ids[0] ?? selectedModel;
                }}
              >
                Anthropic (cloud)
              </button>
              <button
                type="button"
                class="backend-btn"
                class:active={chatBackend === "ollama"}
                onclick={() => {
                  chatBackend = "ollama";
                  const ids = new Set(ollamaModels.map((m) => m.id));
                  const last = get(settings).lastOllamaModelId;
                  if (ids.has(selectedModel)) return;
                  if (last && ids.has(last)) selectedModel = last;
                  else if (ollamaModels[0]) selectedModel = ollamaModels[0].id;
                }}
              >
                Ollama (local)
              </button>
              <button
                type="button"
                class="backend-btn"
                class:active={chatBackend === "llamacpp"}
                onclick={() => {
                  chatBackend = "llamacpp";
                  const lp = get(settings).llamacppModels;
                  const cloudIds = new Set(
                    AVAILABLE_MODELS.filter((m) => m.provider === "anthropic").map((m) => m.id)
                  );
                  if (lp.length > 0) {
                    if (!lp.some((m) => m.id === selectedModel)) selectedModel = lp[0].id;
                  } else if (cloudIds.has(selectedModel) || !selectedModel.trim()) {
                    selectedModel = "local-model";
                  }
                  void fetchLlamacppModels();
                }}
              >
                llama.cpp (local)
              </button>
            </div>

            <p class="group-label">API keys</p>
            <label class="field">
              <span class="name">Anthropic</span>
              <span class="hint">Required when chat backend is Anthropic</span>
              <input
                type="password"
                bind:value={anthropicKey}
                placeholder="sk-ant-…"
                class="input"
                autocomplete="off"
              />
            </label>
            <label class="field">
              <span class="name">OpenAI</span>
              <span class="hint">Stored for a future OpenAI chat provider (not wired yet)</span>
              <input
                type="password"
                bind:value={openaiKey}
                placeholder="sk-…"
                class="input"
                autocomplete="off"
              />
            </label>

            {#if chatBackend === "ollama"}
              <p class="group-label">Ollama</p>
              <p class="note">
                Install from <a href="https://ollama.com" target="_blank" rel="noreferrer">ollama.com</a>, then run
                <code class="inline-code">ollama serve</code> (often already running). Endpoint below must match
                <code class="inline-code">ollama ps</code> / the Ollama app.
              </p>
              <div class="row">
                <input
                  type="text"
                  bind:value={ollamaEndpoint}
                  placeholder="http://127.0.0.1:11434"
                  class="input grow"
                />
                <button type="button" class="btn secondary" onclick={fetchOllamaModels} disabled={loadingOllama}>
                  {loadingOllama ? "…" : "Refresh"}
                </button>
              </div>

              {#if ollamaModels.length > 0}
                <div class="tags">
                  {#each ollamaModels as model}
                    <span class="tag">{model.name}</span>
                  {/each}
                </div>
              {:else}
                <p class="note muted">No models listed — check Ollama is running, then Refresh.</p>
              {/if}
            {:else if chatBackend === "llamacpp"}
              <p class="group-label">llama.cpp server</p>
              <p class="note">
                Run <a href="https://github.com/ggml-org/llama.cpp" target="_blank" rel="noreferrer">llama.cpp</a>
                <code class="inline-code">llama-server</code> with OpenAI API enabled (default for current builds).
                Example:
                <code class="inline-code">llama-server -m ./model.gguf --host 127.0.0.1 --port 8080</code>
              </p>
              <label class="field">
                <span class="name">Server base URL</span>
                <span class="hint">No trailing path; requests go to <code class="inline-code">/v1/chat/completions</code></span>
                <input
                  type="text"
                  bind:value={llamacppEndpoint}
                  placeholder={DEFAULT_LLAMACPP_ENDPOINT}
                  class="input"
                />
              </label>
              <label class="field">
                <span class="name">API key (optional)</span>
                <span class="hint">Only if you started the server with <code class="inline-code">--api-key</code></span>
                <input
                  type="password"
                  bind:value={llamacppApiKey}
                  placeholder="Bearer token"
                  class="input"
                  autocomplete="off"
                />
              </label>
              <div class="row">
                <button
                  type="button"
                  class="btn secondary"
                  onclick={() => fetchLlamacppModels()}
                  disabled={loadingLlamacpp}
                >
                  {loadingLlamacpp ? "…" : "Refresh models"}
                </button>
              </div>
              {#if $settings.llamacppModels.length > 0}
                <div class="tags">
                  {#each $settings.llamacppModels as model}
                    <span class="tag">{model.name}</span>
                  {/each}
                </div>
              {:else}
                <p class="note muted">No models from server — start llama-server or check URL / API key, then Refresh.</p>
              {/if}
            {/if}

            <label class="field">
              <span class="name">Model for current backend</span>
              {#if chatBackend === "anthropic"}
                <select bind:value={selectedModel} class="input">
                  <optgroup label="Anthropic">
                    {#each AVAILABLE_MODELS.filter((m) => m.provider === "anthropic") as model}
                      <option value={model.id}>{model.name}</option>
                    {/each}
                  </optgroup>
                </select>
              {:else if chatBackend === "ollama"}
                {#if ollamaModels.length > 0}
                  <select bind:value={selectedModel} class="input">
                    {#each ollamaModels as model}
                      <option value={model.id}>{model.name}</option>
                    {/each}
                  </select>
                {:else}
                  <p class="note muted">
                    No local models yet. Run <code class="inline-code">ollama pull llama3.2:1b</code> (or another tag),
                    then <strong>Refresh</strong> above.
                  </p>
                {/if}
              {:else}
                <span class="hint">Use an id from Refresh, or a placeholder such as <code class="inline-code">local-model</code> (server may ignore when a single GGUF is loaded).</span>
                {#if $settings.llamacppModels.length > 0}
                  <select bind:value={selectedModel} class="input">
                    {#each $settings.llamacppModels as model}
                      <option value={model.id}>{model.name}</option>
                    {/each}
                  </select>
                {:else}
                  <input
                    type="text"
                    bind:value={selectedModel}
                    placeholder="local-model"
                    class="input"
                  />
                {/if}
              {/if}
            </label>

            {#if chatBackend === "ollama" && ollamaModels.length > 0}
              {@const ctxMax = maxCtxForSelectedOllama(selectedModel)}
              {@const ctxOpts = contextOptionsUpTo(ctxMax)}
              <label class="field">
                <span class="name">Context window</span>
                <span class="hint">
                  Effective context for chat (<code class="inline-code">num_ctx</code>). Max per model comes from
                  Ollama (<code class="inline-code">/api/show</code>); pick a value up to that cap.
                </span>
                <select class="input" bind:value={ollamaContextChoice}>
                  {#each ctxOpts as n}
                    <option value={n}>{fmtCtx(n)} tokens (max {fmtCtx(ctxMax)})</option>
                  {/each}
                </select>
              </label>
            {/if}

            {#if chatBackend === "anthropic"}
              <label class="field field-row">
                <input type="checkbox" bind:checked={anthropicExtendedThinking} class="checkbox" />
                <div class="field-col">
                  <span class="name">Stream extended thinking (Claude 4+)</span>
                  <span class="hint">
                    Show reasoning in a small scrollable panel as it streams (uses adaptive thinking when the model
                    supports it).
                  </span>
                </div>
              </label>
            {/if}
          </div>

        {:else if activeSection === "harness"}
          <div class="stack">
            <p class="group-label">Agent harness</p>
            <p class="note">
              The sidecar loads a <strong>harness</strong> implementation before each chat. Default
              <strong>Pi (bundled SDK)</strong> keeps the official
              <code class="inline-code">@mariozechner/pi-coding-agent</code> package in
              <code class="inline-code">sidecar/</code> so you can upgrade Pi independently of this app.
            </p>
            <label class="field">
              <span class="name">Harness preset</span>
              <select bind:value={harnessKind} class="input">
                {#each HARNESS_OPTIONS as opt}
                  <option value={opt.id}>{opt.label}</option>
                {/each}
              </select>
            </label>
            {#each HARNESS_OPTIONS as opt}
              {#if opt.id === harnessKind}
                <p class="note">{opt.hint}</p>
              {/if}
            {/each}

            <p class="group-label">Bundled Pi SDK</p>
            {#if $settings.lastBundledPiSdkVersion}
              <p class="note">
                Last reported from sidecar: <code class="inline-code">{$settings.lastBundledPiSdkVersion}</code>
              </p>
            {:else}
              <p class="note muted">Send a chat message once to detect the installed Pi package version.</p>
            {/if}
            <p class="note">
              Upgrade Pi: <code class="inline-code">cd sidecar && npm update @mariozechner/pi-coding-agent && npm run build</code>
              then restart the app.
            </p>

            <p class="group-label">Tool access (Anthropic)</p>
            <label class="field">
              <span class="name">Policy</span>
              <select bind:value={toolPolicyMode} class="input">
                <option value="allow_all">Allow all tools automatically</option>
                <option value="whitelist">Whitelist — prompt if tool is not listed below</option>
                <option value="ask_each">Ask for each tool call</option>
              </select>
            </label>
            <label class="field">
              <span class="name">Whitelist (comma or newline)</span>
              <span class="hint">Used when policy is Whitelist. Names: read_file, write_file, list_dir, run_command</span>
              <textarea bind:value={whitelistRaw} class="input textarea" rows="3"></textarea>
            </label>
          </div>

        {:else if activeSection === "appearance"}
          <div class="stack">
            <p class="note">
              <strong>Workbench palette</strong> — shared by the editor, file explorer, chrome, and terminal (ANSI
              colors). Popular bases: VS Code Dark, Catppuccin, Tokyo Night, One Dark Pro, Dracula, GitHub Dark.
            </p>
            <label class="field">
              <span class="name">Workbench colors</span>
              <span class="hint">Save to apply (terminal updates live).</span>
              <select class="input" bind:value={workbenchTheme}>
                {#each WORKBENCH_THEME_OPTIONS as opt}
                  <option value={opt.id}>{opt.label}</option>
                {/each}
              </select>
            </label>
            <label class="field">
              <span class="name">Editor font size</span>
              <input type="number" value="14" min="10" max="24" class="input" disabled />
            </label>
          </div>

        {:else if activeSection === "keybindings"}
          <div class="stack">
            <p class="note muted">
              Built-in chords (custom editor overrides Phase G). <kbd class="inline-code">Mod</kbd> is Ctrl on Linux/Windows
              and ⌘ on macOS. <kbd class="inline-code">Alt+Shift</kbd> shortcuts work without Mod.
            </p>
            <table class="kbd-table">
              <thead>
                <tr><th>Action</th><th>Chord</th><th>Category</th></tr>
              </thead>
              <tbody>
                {#each SHORTCUT_DEFAULTS as row}
                  <tr>
                    <td>{row.description}</td>
                    <td><code class="inline-code">{row.keys}</code></td>
                    <td>{row.category}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
        </div>
      </div>

      <footer class="modal-footer">
        <button type="button" class="btn ghost" onclick={onClose}>Cancel</button>
        <button type="button" class="btn primary" onclick={handleSave}>Save</button>
      </footer>
{/snippet}

{#if visible}
  {#if variant === "modal"}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="backdrop" onclick={onBackdropMouseDown} role="presentation">
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabindex="-1"
        onclick={(e) => e.stopPropagation()}
      >
        {@render settingsShell()}
      </div>
    </div>
  {:else}
    <div
      class="modal page-variant"
      role="dialog"
      aria-modal="false"
      aria-labelledby="settings-title"
      tabindex="-1"
    >
      {@render settingsShell()}
    </div>
  {/if}
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(2px);
  }

  .modal.page-variant {
    width: 100%;
    max-width: none;
    height: 100vh;
    border-radius: 0;
    border: none;
  }

  .modal {
    box-sizing: border-box;
    width: min(960px, calc(100vw - 48px));
    height: min(780px, calc(100vh - 48px));
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
    padding: 14px 16px 10px;
    border-bottom: 1px solid #333;
  }

  .title {
    font-size: 15px;
    font-weight: 600;
    color: #e8e8e8;
    letter-spacing: -0.01em;
  }

  .icon-close {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #888;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
  }

  .icon-close:hover {
    background: #363636;
    color: #ccc;
  }

  .modal-main {
    flex: 1;
    display: flex;
    flex-direction: row;
    min-height: 0;
    border-top: 1px solid #333;
  }

  .nav-rail {
    width: 168px;
    flex-shrink: 0;
    padding: 10px 8px;
    border-right: 1px solid #333;
    background: #1f1f1f;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .nav-item {
    width: 100%;
    padding: 8px 10px;
    font-size: 12px;
    text-align: left;
    color: #a3a3a3;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  .nav-item:hover {
    color: #e5e5e5;
    background: #2a2a2a;
  }

  .nav-item.active {
    color: #fafafa;
    background: #333;
  }

  .modal-body {
    flex: 1;
    min-width: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 16px;
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .group-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #737373;
    margin: 4px 0 -4px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field-row {
    flex-direction: row;
    align-items: flex-start;
    gap: 10px;
  }

  .field-row .checkbox {
    margin-top: 2px;
    flex-shrink: 0;
  }

  .field-col {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .name {
    font-size: 12px;
    color: #a3a3a3;
  }

  .hint {
    font-size: 11px;
    color: #666;
  }

  .input {
    width: 100%;
    padding: 8px 10px;
    font-size: 13px;
    color: #e5e5e5;
    background: #1c1c1c;
    border: 1px solid #404040;
    border-radius: 6px;
  }

  .input:focus {
    outline: none;
    border-color: #525252;
  }

  .input:disabled {
    opacity: 0.45;
  }

  .row {
    display: flex;
    gap: 8px;
    align-items: stretch;
  }

  .grow {
    flex: 1;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .tag {
    font-size: 11px;
    font-family: ui-monospace, monospace;
    padding: 3px 8px;
    border-radius: 4px;
    background: #1c1c1c;
    color: #86c9b7;
    border: 1px solid #333;
  }

  .note {
    font-size: 12px;
    line-height: 1.45;
    color: #737373;
    margin: 0;
  }

  .note.muted {
    color: #5c5c5c;
  }

  .note a {
    color: #6ca6e8;
  }

  .inline-code {
    font-family: ui-monospace, monospace;
    font-size: 11px;
    padding: 1px 5px;
    border-radius: 4px;
    background: #1c1c1c;
    color: #c5c5c5;
  }

  .backend-toggle {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .backend-btn {
    flex: 1;
    min-width: 140px;
    padding: 10px 12px;
    font-size: 12px;
    border-radius: 6px;
    border: 1px solid #404040;
    background: #1e1e1e;
    color: #a3a3a3;
    cursor: pointer;
  }

  .backend-btn:hover {
    border-color: #555;
    color: #e0e0e0;
  }

  .backend-btn.active {
    border-color: #007acc;
    background: #1a2330;
    color: #e8e8e8;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid #333;
    background: #262626;
  }

  .btn {
    padding: 7px 14px;
    font-size: 12px;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid transparent;
  }

  .btn.primary {
    background: #e5e5e5;
    color: #171717;
    border-color: #e5e5e5;
  }

  .btn.primary:hover {
    background: #fafafa;
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

  .btn.secondary {
    background: #333;
    color: #e5e5e5;
    border-color: #404040;
    white-space: nowrap;
  }

  .btn.secondary:hover:not(:disabled) {
    background: #404040;
  }

  .btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .kbd-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .kbd-table th,
  .kbd-table td {
    padding: 8px 10px;
    border-bottom: 1px solid #333;
    text-align: left;
    vertical-align: top;
  }

  .kbd-table th {
    color: #b8b8b8;
    font-weight: 600;
  }
</style>
