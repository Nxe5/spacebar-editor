<script lang="ts">
  import { get } from "svelte/store";
  import {
    settings,
    AVAILABLE_MODELS,
    type ModelConfig,
    type ChatBackend,
    AGENT_LIMIT_BOUNDS,
  } from "$lib/stores/settings";
  import {
    fetchOllamaModelList,
    RECOMMENDED_OLLAMA_MODELS,
    contextOptionsUpTo,
    pickContextOption,
  } from "$lib/ollamaClient";
  import {
    fetchLlamacppModelList,
    fetchLlamacppServerProps,
    DEFAULT_LLAMACPP_ENDPOINT,
    type LlamacppLiveServerInfo,
  } from "$lib/llamaCppClient";
  import {
    searchModels,
    pullModel,
    deleteModel,
    formatPullProgress,
    formatModelWithTag,
    type OllamaLibraryModel,
    type OllamaPullProgress,
  } from "$lib/ollamaLibrary";
  import GearIcon from "phosphor-svelte/lib/GearIcon";
  import { toolPolicy as toolPolicyStore } from "$lib/stores/toolPolicy";
  import {
    listManagedTools,
    getEditorPayloadForTool,
    type ToolRule,
    type ToolEditorPayload,
  } from "$lib/toolPolicy";
  import { EMPTY_PARAMETERS_JSON } from "$lib/toolSchema";
  import { files } from "$lib/stores/files";
  import { isTauriAvailable, runShell } from "$lib/ipc";
  import {
    probeOllama,
    probeLlamacpp,
    portFromBaseUrl,
    startOllamaServeCommand,
    stopOllamaServerCommand,
    stopLlamacppServerCommand,
    type ProviderHealth,
  } from "$lib/providerHealth";
  import { SHORTCUT_DEFAULTS } from "../shortcuts/defaults";
  import {
    WORKBENCH_THEME_OPTIONS,
    applyWorkbenchTheme,
    type WorkbenchThemeId,
  } from "$lib/workbench-theme";
  import { iconTheme } from "$lib/stores/iconTheme";
  import { syntaxTheme } from "$lib/stores/syntaxTheme";
  import { editorChrome } from "$lib/stores/editorChrome";
  import { SYNTAX_COLOR_FIELDS, type SyntaxColorMap } from "$lib/editor/syntaxColors";
  import { EDITOR_CHROME_FIELDS, type EditorChromeMap } from "$lib/editor/editorChrome";
  import { explorerAppearance } from "$lib/stores/explorerAppearance";
  import { chatAppearance } from "$lib/stores/chatAppearance";
  import {
    EXPLORER_APPEARANCE_FIELDS,
    type ExplorerAppearanceMap,
  } from "$lib/explorer/explorerAppearance";
  import {
    CHAT_APPEARANCE_COLOR_FIELDS,
    CHAT_WAITING_STYLE_OPTIONS,
    type ChatAppearanceMap,
    type ChatWaitingStyle,
  } from "$lib/chat/chatAppearance";
  import { VSCODE_ICONS_ATTRIBUTION } from "$lib/icon-packs/types";
  import { pickIconPackFolder, isTauriAvailable as isTauri } from "$lib/ipc";
  import ProviderServerGuide from "./ProviderServerGuide.svelte";
  import {
    type LlamacppServerTemplate,
    type OllamaServerTemplate,
  } from "$lib/providerServerConfig";

  interface Props {
    open: boolean;
    onClose: () => void;
    variant?: "modal" | "page";
  }

  let { open, onClose, variant = "modal" }: Props = $props();

  let visible = $derived(open || variant === "page");

  type Section =
    | "providers-ollama"
    | "providers-llamacpp"
    | "providers-anthropic"
    | "tools"
    | "appearance-theme"
    | "appearance-editor"
    | "appearance-icons"
    | "appearance-syntax"
    | "appearance-explorer"
    | "appearance-chat"
    | "keybindings";

  const backendToSection: Record<ChatBackend, Section> = {
    ollama: "providers-ollama",
    llamacpp: "providers-llamacpp",
    anthropic: "providers-anthropic",
  };

  let activeSection = $state<Section>("providers-ollama");

  let anthropicKey = $state("");
  let openaiKey = $state("");
  let ollamaEndpoint = $state("");
  let selectedModel = $state("");
  let ollamaModels = $state<ModelConfig[]>([]);
  let loadingOllama = $state(false);
  let loadingLlamacpp = $state(false);
  let llamacppEndpoint = $state(DEFAULT_LLAMACPP_ENDPOINT);
  let llamacppApiKey = $state("");
  let toolPolicyDefaultRule = $state<ToolRule>("ask");
  let toolEditorOpen = $state(false);
  let toolEditorIsNew = $state(false);
  let toolEditorError = $state("");
  let toolEditorDraft = $state<ToolEditorPayload | null>(null);
  let chatBackend = $state<ChatBackend>("ollama");
  let anthropicExtendedThinking = $state(true);
  let ollamaContextChoice = $state(8192);
  let llamacppContextChoice = $state(8192);
  let ollamaServerTemplate = $state<OllamaServerTemplate>({
    modelsPath: "/mnt/data/ollama/models",
    contextLength: 8192,
    numThreads: 6,
    keepAlive: -1,
    maxLoadedModels: 1,
    numParallel: 1,
    newEngine: false,
    flashAttention: false,
    useHsaOverride: false,
    hsaOverrideVersion: "9.0.6",
  });
  let llamacppServerTemplate = $state<LlamacppServerTemplate>({
    serviceName: "llamacpp",
    modelPath: "/mnt/data/llamacpp-models/Qwen2.5-1.5B-Instruct-Q5_K_M.gguf",
    host: "127.0.0.1",
    port: 8080,
    context: 8192,
    ngl: 99,
    threads: 6,
    threadsBatch: 12,
    ubatch: 512,
    batch: 512,
    flashAttn: true,
    mlock: true,
    jinja: true,
    user: "Nxe5",
  });
  let workbenchTheme = $state<WorkbenchThemeId>("vscode-dark");
  let webFetchAllowedHostsText = $state("");
  let maxAgentSteps = $state(0);
  let maxToolCallsPerRun = $state(0);
  let maxToolsPerTurn = $state(0);
  let iconThemeId = $state<"seti" | "vscode-icons" | "codicons" | "custom">("seti");
  let iconPackCustomPath = $state("");
  let iconRefreshStatus = $state("");
  let iconRefreshing = $state(false);
  let syntaxColors = $state<SyntaxColorMap>(syntaxTheme.get());
  let editorColors = $state<EditorChromeMap>(editorChrome.get());
  let editorWordWrap = $state(false);
  let editorFormatOnSave = $state(false);
  let explorerColors = $state<ExplorerAppearanceMap>(explorerAppearance.get());
  let chatColors = $state<ChatAppearanceMap>(chatAppearance.get());

  let modelSearchQuery = $state("");
  let modelSearchResults = $state<OllamaLibraryModel[]>([]);
  let pullingModel = $state<string | null>(null);
  let pullProgress = $state<string>("");
  let showModelLibrary = $state(false);

  type ProviderStatus = ProviderHealth & { checking: boolean };

  const idleProviderStatus = (): ProviderStatus => ({
    dot: "idle",
    detail: "Not checked",
    modelCount: 0,
    checking: false,
  });

  let ollamaStatus = $state<ProviderStatus>(idleProviderStatus());
  let llamacppStatus = $state<ProviderStatus>(idleProviderStatus());
  let llamacppModels = $state<ModelConfig[]>([]);
  let llamacppLiveProps = $state<LlamacppLiveServerInfo | null>(null);

  let canRunShell = $derived(isTauriAvailable() && !!$files.workspacePath);

  $effect(() => {
    modelSearchResults = searchModels(modelSearchQuery);
  });

  const sections: { id: Section; label: string; group?: string }[] = [
    { id: "providers-ollama", label: "Ollama", group: "Providers" },
    { id: "providers-llamacpp", label: "llama.cpp", group: "Providers" },
    { id: "providers-anthropic", label: "Anthropic", group: "Providers" },
    { id: "tools", label: "Tools" },
    { id: "appearance-theme", label: "Theme", group: "Appearance" },
    { id: "appearance-editor", label: "Editor", group: "Appearance" },
    { id: "appearance-icons", label: "Icons", group: "Appearance" },
    { id: "appearance-syntax", label: "Syntax", group: "Appearance" },
    { id: "appearance-explorer", label: "Explorer", group: "Appearance" },
    { id: "appearance-chat", label: "Chat activity", group: "Appearance" },
    { id: "keybindings", label: "Keybindings" },
  ];

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
    toolPolicyDefaultRule = $toolPolicyStore.defaultRule;
    chatBackend = $settings.chatBackend;
    anthropicExtendedThinking = $settings.anthropicExtendedThinking;
    workbenchTheme = $settings.workbenchTheme;
    webFetchAllowedHostsText = $settings.webFetchAllowedHosts.join("\n");
    maxAgentSteps = $settings.agentLimits.maxAgentSteps;
    maxToolCallsPerRun = $settings.agentLimits.maxToolCallsPerRun;
    maxToolsPerTurn = $settings.agentLimits.maxToolsPerTurn;
    iconThemeId = $iconTheme.themeId;
    iconPackCustomPath = $iconTheme.customPackPath ?? "";
    syntaxColors = { ...syntaxTheme.get() };
    editorColors = { ...editorChrome.get() };
    editorWordWrap = $settings.editor.wordWrap;
    editorFormatOnSave = $settings.editor.formatOnSave;
    explorerColors = { ...explorerAppearance.get() };
    chatColors = { ...chatAppearance.get() };
    llamacppModels = $settings.llamacppModels;
    ollamaServerTemplate = structuredClone($settings.ollamaServerTemplate);
    llamacppServerTemplate = structuredClone($settings.llamacppServerTemplate);
    activeSection = backendToSection[$settings.chatBackend] ?? "providers-ollama";
    void connectOllama();
    void connectLlamacpp();
  });

  function persistAgentLimits() {
    settings.setAgentLimits({
      maxAgentSteps,
      maxToolCallsPerRun,
      maxToolsPerTurn,
    });
    const saved = get(settings).agentLimits;
    maxAgentSteps = saved.maxAgentSteps;
    maxToolCallsPerRun = saved.maxToolCallsPerRun;
    maxToolsPerTurn = saved.maxToolsPerTurn;
  }

  function setAsChatProvider(backend: ChatBackend) {
    chatBackend = backend;
    settings.setChatBackend(backend);
    const s = get(settings);
    selectedModel = s.selectedModel;
  }

  async function checkOllamaStatus(): Promise<ProviderHealth> {
    ollamaStatus = { ...ollamaStatus, checking: true, dot: "idle", detail: "Checking…" };
    const health = await probeOllama(ollamaEndpoint);
    ollamaStatus = { ...health, checking: false };
    return health;
  }

  async function checkLlamacppStatus(): Promise<ProviderHealth> {
    llamacppStatus = { ...llamacppStatus, checking: true, dot: "idle", detail: "Checking…" };
    const health = await probeLlamacpp(llamacppEndpoint, llamacppApiKey);
    llamacppStatus = { ...health, checking: false };
    return health;
  }

  async function fetchLlamacppModels() {
    loadingLlamacpp = true;
    try {
      const props = await fetchLlamacppServerProps(llamacppEndpoint, llamacppApiKey);
      llamacppLiveProps = props.nCtx != null || props.model != null ? props : null;
      const rows = await fetchLlamacppModelList(
        llamacppEndpoint,
        llamacppApiKey,
        props.nCtx ?? llamacppServerTemplate.context,
        props
      );
      llamacppModels = rows as ModelConfig[];
      settings.setLlamacppModels(llamacppModels);
      if (props.nCtx != null) {
        llamacppContextChoice = props.nCtx;
      }
      if (llamacppStatus.dot === "green" || llamacppStatus.dot === "yellow") {
        const ctxNote = props.nCtx != null ? ` · ctx ${fmtCtx(props.nCtx)}` : "";
        llamacppStatus = {
          ...llamacppStatus,
          detail: `${llamacppStatus.detail.replace(/ · ctx [\d.kM]+$/i, "")}${ctxNote}`,
        };
      }
    } catch {
      llamacppModels = [];
      llamacppLiveProps = null;
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

  async function connectOllama() {
    const health = await checkOllamaStatus();
    if (health.dot === "green" || health.dot === "yellow") {
      await fetchOllamaModels();
    }
  }

  async function connectLlamacpp() {
    const health = await checkLlamacppStatus();
    if (health.dot === "green" || health.dot === "yellow") {
      await fetchLlamacppModels();
    }
  }

  async function runProviderShell(command: string): Promise<void> {
    const ws = $files.workspacePath;
    if (!ws || !isTauriAvailable()) return;
    try {
      await runShell(ws, command, 10_000);
    } catch (e) {
      alert(String(e));
    }
  }

  async function startOllamaServer() {
    await runProviderShell(startOllamaServeCommand());
    await new Promise((r) => setTimeout(r, 1500));
    await connectOllama();
  }

  async function stopOllamaServer() {
    if (!confirm("Stop the Ollama server on this machine?")) return;
    const port = portFromBaseUrl(ollamaEndpoint, 11434);
    await runProviderShell(stopOllamaServerCommand(port));
    ollamaModels = [];
    await checkOllamaStatus();
  }

  async function stopLlamacppServer() {
    if (!confirm("Stop the llama.cpp server on this machine?")) return;
    const port = portFromBaseUrl(llamacppEndpoint, 8080);
    await runProviderShell(stopLlamacppServerCommand(port));
    llamacppModels = [];
    llamacppLiveProps = null;
    settings.setLlamacppModels([]);
    await checkLlamacppStatus();
  }

  async function pullOllamaModel(modelName: string) {
    pullingModel = modelName;
    pullProgress = "Starting download...";

    const result = await pullModel(
      ollamaEndpoint || "http://127.0.0.1:11434",
      modelName,
      (progress: OllamaPullProgress) => {
        pullProgress = formatPullProgress(progress);
      }
    );

    if (result.success) {
      pullProgress = "Download complete!";
      await fetchOllamaModels();
      setTimeout(() => {
        pullingModel = null;
        pullProgress = "";
      }, 1500);
    } else {
      pullProgress = result.error ?? "Download failed";
      setTimeout(() => {
        pullingModel = null;
        pullProgress = "";
      }, 3000);
    }
  }

  async function deleteOllamaModel(modelName: string) {
    if (!confirm(`Delete model "${modelName}"? This cannot be undone.`)) return;

    const result = await deleteModel(
      ollamaEndpoint || "http://127.0.0.1:11434",
      modelName
    );

    if (result.success) {
      await fetchOllamaModels();
    } else {
      alert(result.error ?? "Failed to delete model");
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
    if (!visible || activeSection !== "providers-ollama") return;
    void [selectedModel, ollamaModels];
    const max = maxCtxForSelectedOllama(selectedModel);
    const row = ollamaModels.find((m) => m.id === selectedModel);
    const cur = row?.contextWindow ?? Math.min(8192, max);
    ollamaContextChoice = pickContextOption(cur, max);
  });

  $effect(() => {
    if (!visible || activeSection !== "providers-llamacpp") return;
    void [selectedModel, llamacppModels, llamacppLiveProps];
    const row = llamacppModels.find((m) => m.id === selectedModel);
    llamacppContextChoice =
      llamacppLiveProps?.nCtx ?? row?.contextWindow ?? llamacppServerTemplate.context;
  });

  const llamacppGenerationRows = $derived.by(() => {
    const gen = llamacppLiveProps?.generationDefaults;
    if (!gen) return [] as { key: string; value: string }[];
    const skip = new Set(["n_ctx", "model"]);
    return Object.entries(gen)
      .filter(([k, v]) => !skip.has(k) && v != null && v !== "")
      .slice(0, 12)
      .map(([key, value]) => ({
        key,
        value: typeof value === "object" ? JSON.stringify(value) : String(value),
      }));
  });

  function openToolEditor(name: string, builtin: boolean) {
    const payload = getEditorPayloadForTool(get(toolPolicyStore), name, builtin);
    if (!payload) return;
    toolEditorDraft = { ...payload };
    toolEditorIsNew = false;
    toolEditorError = "";
    toolEditorOpen = true;
  }

  function openNewToolEditor() {
    toolEditorDraft = {
      name: "",
      description: "",
      rule: toolPolicyDefaultRule,
      parametersJson: EMPTY_PARAMETERS_JSON,
      builtin: false,
    };
    toolEditorIsNew = true;
    toolEditorError = "";
    toolEditorOpen = true;
  }

  function closeToolEditor() {
    toolEditorOpen = false;
    toolEditorDraft = null;
    toolEditorError = "";
  }

  function saveToolEditor() {
    if (!toolEditorDraft) return;
    const result = toolPolicyStore.saveToolEditor(toolEditorDraft, toolEditorIsNew);
    if (!result.ok) {
      toolEditorError = result.error;
      return;
    }
    closeToolEditor();
  }

  function resetToolsToDefaults() {
    if (
      !confirm(
        "Reset all tools to factory defaults? Policies, custom tools, and edits will be removed."
      )
    ) {
      return;
    }
    toolPolicyStore.reset();
    toolPolicyDefaultRule = "allow";
    closeToolEditor();
  }

  function handleSave() {
    settings.setApiKey("anthropic", anthropicKey);
    settings.setApiKey("openai", openaiKey);
    settings.setOllamaEndpoint(ollamaEndpoint);
    settings.setLlamacppEndpoint(llamacppEndpoint);
    settings.setLlamacppApiKey(llamacppApiKey);
    settings.setSelectedModel(selectedModel);
    toolPolicyStore.setDefaultRule(toolPolicyDefaultRule);
    settings.setChatBackend(chatBackend);
    settings.setAnthropicExtendedThinking(anthropicExtendedThinking);
    settings.setWorkbenchTheme(workbenchTheme);
    settings.setWebFetchAllowedHosts(
      webFetchAllowedHostsText
        .split(/\n|,/)
        .map((h) => h.trim())
        .filter(Boolean)
    );
    iconTheme.setThemeId(iconThemeId);
    if (iconThemeId === "custom" && iconPackCustomPath) {
      iconTheme.setCustomPackPath(iconPackCustomPath);
    }
    syntaxTheme.persist(syntaxColors);
    editorChrome.persist(editorColors);
    settings.setEditorSettings({
      wordWrap: editorWordWrap,
      formatOnSave: editorFormatOnSave,
    });
    explorerAppearance.persist(explorerColors);
    chatAppearance.persist(chatColors);

    if (chatBackend === "ollama") {
      const sid = selectedModel;
      const models = get(settings).ollamaModels;
      const next = models.map((m) =>
        m.id === sid ? { ...m, contextWindow: ollamaContextChoice } : m
      );
      settings.setOllamaModels(next);
    }

    if (chatBackend === "llamacpp") {
      const sid = selectedModel;
      const models = get(settings).llamacppModels;
      const next = models.map((m) =>
        m.id === sid ? { ...m, contextWindow: llamacppContextChoice } : m
      );
      settings.setLlamacppModels(next.length ? next : models);
    }

    settings.setOllamaServerTemplate(ollamaServerTemplate);
    settings.setLlamacppServerTemplate(llamacppServerTemplate);

    onClose();
  }

  function onBackdropMouseDown(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  function onToolEditorBackdropMouseDown(e: MouseEvent) {
    if (e.target === e.currentTarget) closeToolEditor();
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    if (toolEditorOpen) {
      closeToolEditor();
      return;
    }
    if (visible && variant === "modal") onClose();
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#snippet settingsShell()}
      <header class="modal-header">
        <h2 id="settings-title" class="title">Settings</h2>
        <button type="button" class="icon-close" onclick={onClose} aria-label="Close">×</button>
      </header>

      <div class="modal-main">
        <nav class="nav-rail" aria-label="Settings sections">
          {#each sections as s, i}
            {#if s.group && (i === 0 || sections[i - 1].group !== s.group)}
              <span class="nav-group">{s.group}</span>
            {/if}
            <button
              type="button"
              class="nav-item"
              class:nav-item--nested={!!s.group}
              class:active={activeSection === s.id}
              onclick={() => (activeSection = s.id)}
            >
              {s.label}
              {#if (s.id === "providers-ollama" && chatBackend === "ollama") || (s.id === "providers-llamacpp" && chatBackend === "llamacpp") || (s.id === "providers-anthropic" && chatBackend === "anthropic")}
                <span class="nav-active-dot" title="Active chat provider"></span>
              {/if}
            </button>
          {/each}
        </nav>

        <div class="modal-body">
        {#if activeSection === "providers-ollama"}
          <div class="stack">
            <div class="provider-page-head">
              <h3 class="provider-page-title">Ollama</h3>
              {#if chatBackend === "ollama"}
                <span class="active-provider-pill">Active chat provider</span>
              {:else}
                <button type="button" class="btn secondary" onclick={() => setAsChatProvider("ollama")}>
                  Use for chat
                </button>
              {/if}
            </div>
            <p class="note">
              Local models via Ollama's HTTP API. Install from
              <a href="https://ollama.com" target="_blank" rel="noreferrer">ollama.com</a>, then
              <code class="inline-code">ollama serve</code> (default port 11434).
            </p>

            <div class="provider-card">
              <div class="provider-head">
                <span class="provider-title">
                  <span
                    class="status-dot"
                    class:green={!ollamaStatus.checking && ollamaStatus.dot === "green"}
                    class:red={!ollamaStatus.checking && ollamaStatus.dot === "red"}
                    class:yellow={!ollamaStatus.checking && ollamaStatus.dot === "yellow"}
                    class:idle={ollamaStatus.checking || ollamaStatus.dot === "idle"}
                    title={ollamaStatus.detail}
                  ></span>
                  Ollama
                </span>
                <span class="provider-detail">
                  {ollamaStatus.checking ? "Checking…" : ollamaStatus.detail}
                </span>
              </div>
              <div class="row provider-toolbar">
                <input
                  type="text"
                  bind:value={ollamaEndpoint}
                  placeholder="http://127.0.0.1:11434"
                  class="input grow"
                />
                {#if ollamaStatus.checking}
                  <button type="button" class="btn secondary" disabled>…</button>
                {:else if ollamaStatus.dot === "red"}
                  <button type="button" class="btn secondary" onclick={() => connectOllama()}>
                    Connect
                  </button>
                  {#if canRunShell}
                    <button type="button" class="btn ghost" onclick={() => startOllamaServer()}>
                      Start
                    </button>
                  {/if}
                {:else}
                  <button
                    type="button"
                    class="btn secondary"
                    onclick={() => connectOllama()}
                    disabled={loadingOllama}
                  >
                    {loadingOllama ? "…" : "Refresh"}
                  </button>
                  {#if canRunShell}
                    <button type="button" class="btn ghost" onclick={() => stopOllamaServer()}>
                      Stop
                    </button>
                  {/if}
                {/if}
              </div>

              <p class="group-label">Installed Models</p>
              {#if ollamaModels.length > 0}
                <div class="model-list">
                  {#each ollamaModels as model}
                    <div class="model-list-item">
                      <span class="model-list-name">{model.name}</span>
                      <button
                        type="button"
                        class="model-list-delete"
                        onclick={() => deleteOllamaModel(model.id)}
                        title="Delete model"
                      >
                        ×
                      </button>
                    </div>
                  {/each}
                </div>
              {:else}
                <p class="note muted">No models installed yet.</p>
              {/if}

              <div class="model-library-toggle">
                <button
                  type="button"
                  class="btn secondary"
                  onclick={() => (showModelLibrary = !showModelLibrary)}
                >
                  {showModelLibrary ? "Hide Model Library" : "Browse Model Library"}
                </button>
              </div>

              {#if showModelLibrary}
                <div class="model-library">
                  <input
                    type="text"
                    bind:value={modelSearchQuery}
                    placeholder="Search models (e.g., llama, code, phi)..."
                    class="input"
                  />

                  {#if pullingModel}
                    <div class="pull-progress">
                      <span class="pull-model">{pullingModel}</span>
                      <span class="pull-status">{pullProgress}</span>
                    </div>
                  {/if}

                  <div class="model-library-grid">
                    {#each modelSearchResults as model}
                      <div class="library-model-card">
                        <div class="library-model-header">
                          <span class="library-model-name">{model.name}</span>
                          {#if model.size}
                            <span class="library-model-size">{model.size}</span>
                          {/if}
                        </div>
                        <p class="library-model-desc">{model.description}</p>
                        <div class="library-model-tags">
                          {#each model.tags.slice(0, 5) as tag}
                            {@const fullName = formatModelWithTag(model.name, tag)}
                            {@const isInstalled = ollamaModels.some((m) => m.id === fullName)}
                            <button
                              type="button"
                              class="library-tag-btn"
                              class:installed={isInstalled}
                              disabled={pullingModel !== null}
                              onclick={() => {
                                if (!isInstalled) pullOllamaModel(fullName);
                              }}
                              title={isInstalled ? "Already installed" : `Download ${fullName}`}
                            >
                              {tag}
                              {#if isInstalled}
                                ✓
                              {/if}
                            </button>
                          {/each}
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>

            <label class="field">
              <span class="name">Chat model</span>
              {#if ollamaModels.length > 0}
                <select bind:value={selectedModel} class="input">
                  {#each ollamaModels as model}
                    <option value={model.id}>{model.name}</option>
                  {/each}
                </select>
              {:else}
                <p class="note muted">
                  No local models yet. Run <code class="inline-code">ollama pull llama3.2:1b</code>
                  then <strong>Refresh</strong>.
                </p>
              {/if}
            </label>

            {#if ollamaModels.length > 0}
              {@const ctxMax = maxCtxForSelectedOllama(selectedModel)}
              {@const ctxOpts = contextOptionsUpTo(ctxMax)}
              <label class="field">
                <span class="name">Context window (API — next chat message)</span>
                <select class="input" bind:value={ollamaContextChoice}>
                  {#each ctxOpts as n}
                    <option value={n}>{fmtCtx(n)} tokens (max {fmtCtx(ctxMax)})</option>
                  {/each}
                </select>
              </label>
            {/if}

            <ProviderServerGuide
              kind="ollama"
              bind:ollamaTemplate={ollamaServerTemplate}
              {ollamaEndpoint}
              {selectedModel}
              ollamaContext={ollamaContextChoice}
            />
          </div>

        {:else if activeSection === "providers-llamacpp"}
          <div class="stack">
            <div class="provider-page-head">
              <h3 class="provider-page-title">llama.cpp</h3>
              {#if chatBackend === "llamacpp"}
                <span class="active-provider-pill">Active chat provider</span>
              {:else}
                <button type="button" class="btn secondary" onclick={() => setAsChatProvider("llamacpp")}>
                  Use for chat
                </button>
              {/if}
            </div>
            <p class="note">
              Run <a href="https://github.com/ggml-org/llama.cpp" target="_blank" rel="noreferrer">llama.cpp</a>
              <code class="inline-code">llama-server</code> with OpenAI API enabled (often port 8080).
            </p>

            <div class="provider-card">
              <div class="provider-head">
                <span class="provider-title">
                  <span
                    class="status-dot"
                    class:green={!llamacppStatus.checking && llamacppStatus.dot === "green"}
                    class:red={!llamacppStatus.checking && llamacppStatus.dot === "red"}
                    class:yellow={!llamacppStatus.checking && llamacppStatus.dot === "yellow"}
                    class:idle={llamacppStatus.checking || llamacppStatus.dot === "idle"}
                    title={llamacppStatus.detail}
                  ></span>
                  Server
                </span>
                <span class="provider-detail">
                  {llamacppStatus.checking ? "Checking…" : llamacppStatus.detail}
                </span>
              </div>
              <label class="field">
                <span class="name">Server base URL</span>
                <input
                  type="text"
                  bind:value={llamacppEndpoint}
                  placeholder={DEFAULT_LLAMACPP_ENDPOINT}
                  class="input"
                />
              </label>
              <label class="field">
                <span class="name">API key (optional)</span>
                <input
                  type="password"
                  bind:value={llamacppApiKey}
                  placeholder="Bearer token"
                  class="input"
                  autocomplete="off"
                />
              </label>
              <div class="row provider-toolbar">
                {#if llamacppStatus.checking}
                  <button type="button" class="btn secondary" disabled>…</button>
                {:else if llamacppStatus.dot === "red"}
                  <button type="button" class="btn secondary" onclick={() => connectLlamacpp()}>
                    Connect
                  </button>
                {:else}
                  <button
                    type="button"
                    class="btn secondary"
                    onclick={() => connectLlamacpp()}
                    disabled={loadingLlamacpp}
                  >
                    {loadingLlamacpp ? "…" : "Refresh"}
                  </button>
                  {#if canRunShell}
                    <button type="button" class="btn ghost" onclick={() => stopLlamacppServer()}>
                      Stop
                    </button>
                  {/if}
                {/if}
              </div>

              <p class="group-label">Server Models</p>
              {#if llamacppLiveProps}
                <div class="live-server-panel">
                  <p class="group-label">Running server (GET /props)</p>
                  <dl class="live-server-dl">
                    <dt>Context (n_ctx)</dt>
                    <dd>
                      {#if llamacppLiveProps.nCtx != null}
                        {llamacppLiveProps.nCtx.toLocaleString()} tokens
                      {:else}
                        <span class="muted">Not reported — is llama-server running?</span>
                      {/if}
                    </dd>
                    {#if llamacppLiveProps.model}
                      <dt>Loaded model</dt>
                      <dd><code class="inline-code">{llamacppLiveProps.model}</code></dd>
                    {/if}
                    {#if llamacppLiveProps.totalSlots != null}
                      <dt>Parallel slots</dt>
                      <dd>{llamacppLiveProps.totalSlots}</dd>
                    {/if}
                  </dl>
                  {#if llamacppLiveProps.nCtx != null && llamacppServerTemplate.context !== llamacppLiveProps.nCtx}
                    <p class="note caution">
                      Saved template uses <code class="inline-code">-c {llamacppServerTemplate.context}</code>,
                      but the running server reports
                      <code class="inline-code">n_ctx={llamacppLiveProps.nCtx}</code>. Restart with the
                      ExecStart below or update systemd.
                    </p>
                  {/if}
                  {#if llamacppGenerationRows.length > 0}
                    <p class="group-label">Default generation settings</p>
                    <div class="api-table-wrap">
                      <table class="api-table">
                        <thead>
                          <tr><th>Key</th><th>Value</th></tr>
                        </thead>
                        <tbody>
                          {#each llamacppGenerationRows as row}
                            <tr>
                              <td><code class="inline-code">{row.key}</code></td>
                              <td>{row.value}</td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    </div>
                  {/if}
                </div>
              {/if}

              {#if llamacppModels.length > 0}
                <div class="model-list">
                  {#each llamacppModels as model}
                    <div class="model-list-item">
                      <span class="model-list-name">{model.name}</span>
                      {#if model.contextWindow}
                        <span class="model-list-meta">{fmtCtx(model.contextWindow)} ctx</span>
                      {/if}
                    </div>
                  {/each}
                </div>
              {:else}
                <p class="note muted">
                  {#if llamacppStatus.dot === "red"}
                    Server not reachable — start llama-server, then Connect.
                  {:else}
                    No models reported — load a GGUF with llama-server, then Refresh.
                  {/if}
                </p>
              {/if}

              <p class="group-label">Get GGUF Models</p>
              <p class="note">
                llama.cpp uses GGUF model files. Download models from HuggingFace, then run:
                <code class="inline-code">llama-server -m model.gguf --port 8080</code>
              </p>
              <div class="gguf-links">
                <a href="https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF" target="_blank" rel="noreferrer" class="gguf-link">
                  <span class="gguf-name">Llama 3.2 3B</span>
                  <span class="gguf-desc">Meta's lightweight model</span>
                </a>
                <a href="https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF" target="_blank" rel="noreferrer" class="gguf-link">
                  <span class="gguf-name">Qwen 2.5 7B</span>
                  <span class="gguf-desc">Strong reasoning & coding</span>
                </a>
                <a href="https://huggingface.co/bartowski/Qwen2.5-Coder-7B-Instruct-GGUF" target="_blank" rel="noreferrer" class="gguf-link">
                  <span class="gguf-name">Qwen 2.5 Coder 7B</span>
                  <span class="gguf-desc">Code-specialized model</span>
                </a>
                <a href="https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF" target="_blank" rel="noreferrer" class="gguf-link">
                  <span class="gguf-name">Mistral 7B</span>
                  <span class="gguf-desc">Fast & efficient</span>
                </a>
                <a href="https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF" target="_blank" rel="noreferrer" class="gguf-link">
                  <span class="gguf-name">Phi 3.5 Mini</span>
                  <span class="gguf-desc">Microsoft's small model</span>
                </a>
                <a href="https://huggingface.co/bartowski/gemma-2-9b-it-GGUF" target="_blank" rel="noreferrer" class="gguf-link">
                  <span class="gguf-name">Gemma 2 9B</span>
                  <span class="gguf-desc">Google's open model</span>
                </a>
              </div>
              <p class="note muted" style="margin-top: 8px;">
                Choose Q4_K_M quantization for best quality/size balance. See
                <a href="https://huggingface.co/models?library=gguf&sort=trending" target="_blank" rel="noreferrer">all GGUF models</a>.
              </p>
            </div>

            <label class="field">
              <span class="name">Chat model</span>
              {#if llamacppModels.length > 0}
                <select bind:value={selectedModel} class="input">
                  {#each llamacppModels as model}
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
                <span class="hint">Model id reported by llama-server, or your loaded GGUF name.</span>
              {/if}
            </label>

            <label class="field">
              <span class="name">Context window (chat meter &amp; num_ctx)</span>
              <input
                class="input"
                type="number"
                bind:value={llamacppContextChoice}
                min="512"
                step="512"
                readonly={llamacppLiveProps?.nCtx != null}
              />
              <span class="hint">
                {#if llamacppLiveProps?.nCtx != null}
                  Synced from the running server (<code class="inline-code">GET /props</code>). Chat footer
                  uses this value. Change <code class="inline-code">-c</code> in the service and restart to
                  resize.
                {:else}
                  Connect to read <code class="inline-code">n_ctx</code> from the server, or set manually.
                  Server context is fixed at launch (<code class="inline-code">-c</code>).
                {/if}
              </span>
            </label>

            <ProviderServerGuide
              kind="llamacpp"
              bind:llamacppTemplate={llamacppServerTemplate}
              llamacppContext={llamacppContextChoice}
            />
          </div>

        {:else if activeSection === "providers-anthropic"}
          <div class="stack">
            <div class="provider-page-head">
              <h3 class="provider-page-title">Anthropic</h3>
              {#if chatBackend === "anthropic"}
                <span class="active-provider-pill">Active chat provider</span>
              {:else}
                <button type="button" class="btn secondary" onclick={() => setAsChatProvider("anthropic")}>
                  Use for chat
                </button>
              {/if}
            </div>
            <p class="note">
              Cloud Claude models via the Anthropic API. Requires an API key from
              <a href="https://console.anthropic.com" target="_blank" rel="noreferrer">console.anthropic.com</a>.
            </p>

            <label class="field">
              <span class="name">API Key</span>
              <span class="hint">Required for Claude models</span>
              <input
                type="password"
                bind:value={anthropicKey}
                placeholder="sk-ant-…"
                class="input"
                autocomplete="off"
              />
            </label>

            <label class="field">
              <span class="name">Chat model</span>
              <select bind:value={selectedModel} class="input">
                {#each AVAILABLE_MODELS.filter((m) => m.provider === "anthropic") as model}
                  <option value={model.id}>{model.name}</option>
                {/each}
              </select>
            </label>

            <label class="field field-row">
              <input type="checkbox" bind:checked={anthropicExtendedThinking} class="checkbox" />
              <div class="field-col">
                <span class="name">Extended thinking (Claude 4+)</span>
                <span class="hint">Show reasoning as it streams.</span>
              </div>
            </label>
          </div>

        {:else if activeSection === "tools"}
          <div class="stack">
            <p class="group-label">Agent limits</p>
            <p class="note">
              Optional caps for Plan and Agent modes on a single user message.
              <strong>0 = unlimited</strong> (default). The agent loop otherwise stops when the
              model finishes or the <strong>context budget</strong> for the active model is full
              (see context meter in chat). Conversation compaction is not implemented yet.
            </p>
            <label class="field">
              <span class="name">Max agent steps</span>
              <input
                type="number"
                class="input"
                min={AGENT_LIMIT_BOUNDS.maxAgentSteps.min}
                max={AGENT_LIMIT_BOUNDS.maxAgentSteps.max}
                bind:value={maxAgentSteps}
                onchange={persistAgentLimits}
              />
              <span class="hint">
                LLM turns per message (0 = unlimited, max {AGENT_LIMIT_BOUNDS.maxAgentSteps.max}).
              </span>
            </label>
            <label class="field">
              <span class="name">Max tool calls per run</span>
              <input
                type="number"
                class="input"
                min={AGENT_LIMIT_BOUNDS.maxToolCallsPerRun.min}
                max={AGENT_LIMIT_BOUNDS.maxToolCallsPerRun.max}
                bind:value={maxToolCallsPerRun}
                onchange={persistAgentLimits}
              />
              <span class="hint">
                Total tools executed per message (0 = unlimited, max {AGENT_LIMIT_BOUNDS.maxToolCallsPerRun.max}).
              </span>
            </label>
            <label class="field">
              <span class="name">Max tools per turn</span>
              <input
                type="number"
                class="input"
                min={AGENT_LIMIT_BOUNDS.maxToolsPerTurn.min}
                max={AGENT_LIMIT_BOUNDS.maxToolsPerTurn.max}
                bind:value={maxToolsPerTurn}
                onchange={persistAgentLimits}
              />
              <span class="hint">
                Tools from one model response (0 = unlimited, max {AGENT_LIMIT_BOUNDS.maxToolsPerTurn.max}).
              </span>
            </label>

            <p class="group-label">Tool policy</p>
            <p class="note">
              Per-tool rules: <strong>Allow</strong> runs without prompting,
              <strong>Ask</strong> shows approval above the composer,
              <strong>Deny</strong> blocks the tool. Chat mode still hides tools; Plan and Agent
              use the subsets defined in each mode.
            </p>
            <label class="field">
              <span class="name">Default for new tools</span>
              <select bind:value={toolPolicyDefaultRule} class="input" onchange={() => toolPolicyStore.setDefaultRule(toolPolicyDefaultRule)}>
                <option value="ask">Ask</option>
                <option value="allow">Allow</option>
                <option value="deny">Deny</option>
              </select>
            </label>

            <p class="group-label">Tools</p>
            <p class="note muted">
              Tool policies and definitions are stored globally on this machine. Per-project overrides
              live in <code>.tinyllama/tools.json</code> (tool rules and custom tools). The model sees
              name, description, and parameters JSON in Agent/Plan modes.
            </p>

            <label class="field">
              <span class="name">Web fetch allowed hosts</span>
              <textarea
                class="input textarea"
                rows="4"
                bind:value={webFetchAllowedHostsText}
                placeholder="github.com&#10;docs.rs"
              ></textarea>
              <span class="hint">One hostname per line. Used by the web_fetch tool only.</span>
            </label>
            <div class="tool-policy-table">
              <div class="tool-policy-row tool-policy-row--head">
                <span>Tool</span>
                <span>Policy</span>
                <span class="tool-policy-actions-head" aria-hidden="true"></span>
              </div>
              {#each listManagedTools($toolPolicyStore) as tool (tool.name)}
                <div class="tool-policy-row">
                  <div class="tool-policy-name-col">
                    <span class="tool-policy-name">{tool.name}</span>
                    {#if tool.builtin}
                      <span class="tool-policy-badge">built-in</span>
                    {:else}
                      <span class="tool-policy-badge custom">custom</span>
                    {/if}
                    {#if tool.hasOverride}
                      <span class="tool-policy-badge edited">edited</span>
                    {/if}
                    <p class="tool-policy-desc">{tool.description}</p>
                  </div>
                  <div class="tool-rule-toggle" role="group" aria-label="Policy for {tool.name}">
                    {#each (["allow", "ask", "deny"] as ToolRule[]) as rule}
                      <button
                        type="button"
                        class="tool-rule-btn"
                        class:active={tool.rule === rule}
                        onclick={() => toolPolicyStore.setToolRule(tool.name, rule)}
                      >
                        {rule}
                      </button>
                    {/each}
                  </div>
                  <div class="tool-policy-actions">
                    <button
                      type="button"
                      class="tool-policy-icon-btn"
                      title="Edit tool"
                      aria-label="Edit {tool.name}"
                      onclick={() => openToolEditor(tool.name, tool.builtin)}
                    >
                      <GearIcon size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      class="tool-policy-remove"
                      title="Remove tool"
                      aria-label="Remove {tool.name}"
                      onclick={() => toolPolicyStore.removeTool(tool.name, tool.builtin)}
                    >
                      ×
                    </button>
                  </div>
                </div>
              {/each}
            </div>

            {#if $toolPolicyStore.removedBuiltinTools.length > 0}
              <div class="removed-tools">
                <span class="name">Removed built-in tools</span>
                <div class="tags">
                  {#each $toolPolicyStore.removedBuiltinTools as name}
                    <button
                      type="button"
                      class="tag tag-btn"
                      onclick={() => toolPolicyStore.restoreBuiltinTool(name)}
                      title="Restore"
                    >
                      + {name}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}

            <div class="tool-policy-footer">
              <button type="button" class="btn secondary" onclick={openNewToolEditor}>
                Create tool
              </button>
              <button type="button" class="btn ghost" onclick={resetToolsToDefaults}>
                Reset to defaults
              </button>
            </div>
          </div>

        {:else if activeSection === "appearance-theme"}
          <div class="stack">
            <h3 class="provider-page-title">Theme</h3>
            <p class="note">
              Workbench colors — editor background, sidebar, tabs, status bar, and terminal.
              <strong>VS Code Dark</strong> is the classic look (#1e1e1e, blue accents).
              <strong>Cursor Dark</strong> matches the Linux Cursor IDE (darker #181818, cyan accents).
            </p>
            <label class="field">
              <span class="name">Color theme</span>
              <select
                class="input"
                bind:value={workbenchTheme}
                onchange={() => {
                  applyWorkbenchTheme(workbenchTheme);
                  editorColors = editorChrome.syncFromActiveTheme();
                }}
              >
                {#each WORKBENCH_THEME_OPTIONS as opt}
                  <option value={opt.id}>{opt.label}</option>
                {/each}
              </select>
            </label>
          </div>

        {:else if activeSection === "appearance-editor"}
          <div class="stack">
            <h3 class="provider-page-title">Editor</h3>
            <p class="note">
              Code editor behavior and chrome colors. Changing the workbench theme updates editor
              color pickers below to match that theme (save to keep). Syntax token colors are under
              <button type="button" class="linkish" onclick={() => (activeSection = "appearance-syntax")}>
                Syntax
              </button>.
            </p>
            <label class="field checkbox-field">
              <input
                type="checkbox"
                bind:checked={editorWordWrap}
                onchange={() => settings.setEditorSettings({ wordWrap: editorWordWrap })}
              />
              <span class="name">Wrap lines</span>
            </label>
            <label class="field checkbox-field">
              <input
                type="checkbox"
                bind:checked={editorFormatOnSave}
                onchange={() =>
                  settings.setEditorSettings({ formatOnSave: editorFormatOnSave })}
              />
              <span class="name">Format on save (Prettier)</span>
            </label>
            <p class="note muted">
              Manual format: <kbd class="inline-code">Shift</kbd>+<kbd class="inline-code">Alt</kbd>+<kbd class="inline-code">F</kbd>
              or the Prettier icon in the status bar.
            </p>
            <h4 class="settings-subheading">Editor colors</h4>
            {#each EDITOR_CHROME_FIELDS as field}
              <label class="field syntax-color-field">
                <span class="name">{field.label}</span>
                <span class="syntax-color-hint">{field.hint}</span>
                <div class="syntax-color-row">
                  <input
                    type="color"
                    class="syntax-color-swatch"
                    value={editorColors[field.key]}
                    oninput={(e) => {
                      const v = (e.currentTarget as HTMLInputElement).value;
                      editorColors = { ...editorColors, [field.key]: v };
                      editorChrome.apply(editorColors);
                    }}
                  />
                  <input
                    type="text"
                    class="input syntax-color-hex"
                    value={editorColors[field.key]}
                    spellcheck={false}
                    oninput={(e) => {
                      const v = (e.currentTarget as HTMLInputElement).value;
                      editorColors = { ...editorColors, [field.key]: v };
                      editorChrome.apply(editorColors);
                    }}
                  />
                </div>
              </label>
            {/each}
            <div
              class="editor-chrome-preview"
              style={`background:${editorColors.bg};color:${editorColors.fg};`}
              aria-hidden="true"
            >
              <span style={`color:${editorColors.gutterFg}`}>1</span>
              <span> function hello() {'{'}</span>
              <span
                class="editor-chrome-preview__selection"
                style={`background:${editorColors.selection}`}
              >
                return "world";
              </span>
              <span> {'}'}</span>
            </div>
            <button
              type="button"
              class="btn ghost"
              onclick={() => {
                applyWorkbenchTheme(workbenchTheme);
                editorColors = editorChrome.syncFromActiveTheme();
              }}
            >
              Sync editor colors from theme
            </button>
            <button
              type="button"
              class="btn ghost"
              onclick={() => {
                editorColors = editorChrome.resetToDefaults();
              }}
            >
              Reset editor color defaults
            </button>
          </div>

        {:else if activeSection === "appearance-icons"}
          <div class="stack">
            <h3 class="provider-page-title">Icons</h3>
            <p class="note">
              File and folder icons in the explorer. Default pack:
              <a href={VSCODE_ICONS_ATTRIBUTION.repository} target="_blank" rel="noopener noreferrer">
                {VSCODE_ICONS_ATTRIBUTION.name}
              </a>
              ({VSCODE_ICONS_ATTRIBUTION.license}).
            </p>
            <label class="field">
              <span class="name">Icon theme</span>
              <select
                class="input"
                bind:value={iconThemeId}
                onchange={() => {
                  iconTheme.setThemeId(iconThemeId);
                  void iconTheme.reloadManifest();
                }}
              >
                <option value="seti">Seti (Cursor default)</option>
                <option value="vscode-icons">VS Code Icons (SVG)</option>
                <option value="codicons">Built-in codicons (simple)</option>
                <option value="custom">Custom folder…</option>
              </select>
            </label>
            {#if iconThemeId === "custom"}
              <label class="field">
                <span class="name">Custom pack folder</span>
                <div class="icon-pack-path-row">
                  <input class="input" readonly value={iconPackCustomPath} placeholder="Select folder with manifest.json + icons/" />
                  {#if isTauriAvailable()}
                    <button
                      type="button"
                      class="btn secondary"
                      onclick={async () => {
                        const picked = await pickIconPackFolder();
                        if (picked) {
                          iconPackCustomPath = picked;
                          iconTheme.setCustomPackPath(picked);
                          await iconTheme.reloadManifest();
                          iconTheme.bumpRevision();
                        }
                      }}
                    >
                      Browse…
                    </button>
                  {/if}
                </div>
              </label>
            {/if}
            <div class="icon-pack-actions">
              <button
                type="button"
                class="btn secondary"
                disabled={iconRefreshing}
                onclick={async () => {
                  iconRefreshing = true;
                  iconRefreshStatus = "";
                  const result = await iconTheme.refreshBundledPack();
                  iconRefreshing = false;
                  iconRefreshStatus = result.ok
                    ? `Refreshed pack (${result.path})`
                    : `Refresh failed: ${result.error}`;
                  void iconTheme.reloadManifest();
                  iconTheme.bumpRevision();
                }}
              >
                {iconRefreshing ? "Refreshing…" : "Refresh default icon pack"}
              </button>
              <button
                type="button"
                class="btn ghost"
                onclick={async () => {
                  iconTheme.invalidateManifest();
                  await iconTheme.reloadManifest();
                  iconTheme.bumpRevision();
                }}
              >
                Reload icons
              </button>
            </div>
            {#if iconRefreshStatus}
              <p class="note muted">{iconRefreshStatus}</p>
            {/if}
            <details class="attribution-details">
              <summary>Icon pack attribution</summary>
              <p class="note muted">
                {VSCODE_ICONS_ATTRIBUTION.copyright}. See
                <a href={VSCODE_ICONS_ATTRIBUTION.repository} target="_blank" rel="noopener noreferrer">
                  {VSCODE_ICONS_ATTRIBUTION.repository}
                </a>.
              </p>
            </details>
          </div>

        {:else if activeSection === "appearance-explorer"}
          <div class="stack">
            <h3 class="provider-page-title">Explorer</h3>
            <p class="note">
              File tree selection, label and icon sizes, and git status colors. Changes preview live;
              click Save to keep them.
            </p>
            {#each EXPLORER_APPEARANCE_FIELDS as field}
              <label class="field syntax-color-field">
                <span class="name">{field.label}</span>
                <span class="syntax-color-hint">{field.hint}</span>
                {#if field.kind === "color"}
                  <div class="syntax-color-row">
                    <input
                      type="color"
                      class="syntax-color-swatch"
                      value={explorerColors[field.key] as string}
                      oninput={(e) => {
                        const v = (e.currentTarget as HTMLInputElement).value;
                        explorerColors = { ...explorerColors, [field.key]: v };
                        explorerAppearance.apply(explorerColors);
                      }}
                    />
                    <input
                      type="text"
                      class="input syntax-color-hex"
                      value={explorerColors[field.key] as string}
                      spellcheck={false}
                      oninput={(e) => {
                        const v = (e.currentTarget as HTMLInputElement).value;
                        explorerColors = { ...explorerColors, [field.key]: v };
                        explorerAppearance.apply(explorerColors);
                      }}
                    />
                  </div>
                {:else}
                  <input
                    type="number"
                    class="input"
                    min={field.min}
                    max={field.max}
                    value={explorerColors[field.key] as number}
                    oninput={(e) => {
                      const v = Number((e.currentTarget as HTMLInputElement).value);
                      explorerColors = { ...explorerColors, [field.key]: v };
                      explorerAppearance.apply(explorerColors);
                    }}
                  />
                {/if}
              </label>
            {/each}
            <button
              type="button"
              class="btn ghost"
              onclick={() => {
                explorerColors = explorerAppearance.resetToDefaults();
              }}
            >
              Reset explorer defaults
            </button>
          </div>

        {:else if activeSection === "appearance-chat"}
          <div class="stack">
            <h3 class="provider-page-title">Chat activity</h3>
            <p class="note">
              Agent feed in the chat pane — waiting indicator style and colors for thoughts,
              tools, and badges. Changes preview live; click Save to keep them.
            </p>
            <label class="field">
              <span class="name">While waiting for the model</span>
              <span class="syntax-color-hint">Before tools or reasoning appear</span>
              <select
                class="input"
                value={chatColors.waitingStyle}
                onchange={(e) => {
                  chatColors = {
                    ...chatColors,
                    waitingStyle: (e.currentTarget as HTMLSelectElement)
                      .value as ChatWaitingStyle,
                  };
                  chatAppearance.apply(chatColors);
                }}
              >
                {#each CHAT_WAITING_STYLE_OPTIONS as opt}
                  <option value={opt.id}>{opt.label}</option>
                {/each}
              </select>
            </label>
            {#each CHAT_APPEARANCE_COLOR_FIELDS as field}
              <label class="field syntax-color-field">
                <span class="name">{field.label}</span>
                <span class="syntax-color-hint">{field.hint}</span>
                <div class="syntax-color-row">
                  <input
                    type="color"
                    class="syntax-color-swatch"
                    value={chatColors[field.key]}
                    oninput={(e) => {
                      const v = (e.currentTarget as HTMLInputElement).value;
                      chatColors = { ...chatColors, [field.key]: v };
                      chatAppearance.apply(chatColors);
                    }}
                  />
                  <input
                    type="text"
                    class="input syntax-color-hex"
                    value={chatColors[field.key]}
                    spellcheck={false}
                    oninput={(e) => {
                      const v = (e.currentTarget as HTMLInputElement).value;
                      chatColors = { ...chatColors, [field.key]: v };
                      chatAppearance.apply(chatColors);
                    }}
                  />
                </div>
              </label>
            {/each}
            <button
              type="button"
              class="btn ghost"
              onclick={() => {
                chatColors = chatAppearance.resetToDefaults();
              }}
            >
              Reset chat activity defaults
            </button>
          </div>

        {:else if activeSection === "appearance-syntax"}
          <div class="stack">
            <h3 class="provider-page-title">Syntax highlighting</h3>
            <p class="note">
              Colors in the code editor for every language. Default palette: Tokyo Night.
              Changes preview live; click Save to keep them.
            </p>
            <h4 class="settings-subheading">Code tokens</h4>
            {#each SYNTAX_COLOR_FIELDS.filter((f) => f.group !== "markdown") as field}
              <label class="field syntax-color-field">
                <span class="name">{field.label}</span>
                <span class="syntax-color-hint">{field.hint}</span>
                <div class="syntax-color-row">
                  <input
                    type="color"
                    class="syntax-color-swatch"
                    value={syntaxColors[field.key]}
                    oninput={(e) => {
                      const v = (e.currentTarget as HTMLInputElement).value;
                      syntaxColors = { ...syntaxColors, [field.key]: v };
                      syntaxTheme.apply(syntaxColors);
                    }}
                  />
                  <input
                    type="text"
                    class="input syntax-color-hex"
                    value={syntaxColors[field.key]}
                    spellcheck={false}
                    oninput={(e) => {
                      const v = (e.currentTarget as HTMLInputElement).value;
                      syntaxColors = { ...syntaxColors, [field.key]: v };
                      syntaxTheme.apply(syntaxColors);
                    }}
                  />
                </div>
              </label>
            {/each}
            <h4 class="settings-subheading">Markdown tokens</h4>
            {#each SYNTAX_COLOR_FIELDS.filter((f) => f.group === "markdown") as field}
              <label class="field syntax-color-field">
                <span class="name">{field.label}</span>
                <span class="syntax-color-hint">{field.hint}</span>
                <div class="syntax-color-row">
                  <input
                    type="color"
                    class="syntax-color-swatch"
                    value={syntaxColors[field.key]}
                    oninput={(e) => {
                      const v = (e.currentTarget as HTMLInputElement).value;
                      syntaxColors = { ...syntaxColors, [field.key]: v };
                      syntaxTheme.apply(syntaxColors);
                    }}
                  />
                  <input
                    type="text"
                    class="input syntax-color-hex"
                    value={syntaxColors[field.key]}
                    spellcheck={false}
                    oninput={(e) => {
                      const v = (e.currentTarget as HTMLInputElement).value;
                      syntaxColors = { ...syntaxColors, [field.key]: v };
                      syntaxTheme.apply(syntaxColors);
                    }}
                  />
                </div>
              </label>
            {/each}
            <div class="syntax-preview" aria-hidden="true">
              <p class="syntax-preview-label">TypeScript</p>
              <span class="syntax-preview-line"><span style="color: {syntaxColors.comment}">// comment</span></span>
              <span class="syntax-preview-line"><span style="color: {syntaxColors.keyword}">const</span> <span style="color: {syntaxColors.variable}">count</span> <span style="color: {syntaxColors.operator}">=</span> <span style="color: {syntaxColors.number}">42</span><span style="color: {syntaxColors.punctuation}">;</span></span>
              <span class="syntax-preview-line"><span style="color: {syntaxColors.keyword}">class</span> <span style="color: {syntaxColors.type}">MyClass</span> <span style="color: {syntaxColors.punctuation}">{`{`}</span></span>
              <span class="syntax-preview-line">  <span style="color: {syntaxColors.function}">render</span><span style="color: {syntaxColors.punctuation}">()</span> <span style="color: {syntaxColors.punctuation}">{`{`}</span> <span style="color: {syntaxColors.keyword}">return</span> <span style="color: {syntaxColors.string}">"hello"</span><span style="color: {syntaxColors.punctuation}">;</span> <span style="color: {syntaxColors.punctuation}">{`}`}</span></span>
              <span class="syntax-preview-line"><span style="color: {syntaxColors.punctuation}">{`}`}</span></span>
              <p class="syntax-preview-label">Markdown</p>
              <span class="syntax-preview-line"><span style="color: {syntaxColors.heading}; font-weight:700"># Title</span></span>
              <span class="syntax-preview-line"><span style="color: {syntaxColors.link}">[link](https://example.com)</span></span>
              <span class="syntax-preview-line"><span style="color: {syntaxColors.emphasis}">*emphasis*</span> <span style="color: {syntaxColors.strong}; font-weight:700">**strong**</span></span>
              <span class="syntax-preview-line"><span style="color: {syntaxColors.meta}">```ts</span></span>
            </div>
            <button
              type="button"
              class="btn ghost"
              onclick={() => {
                syntaxColors = syntaxTheme.resetToDefaults();
              }}
            >
              Reset to Tokyo Night defaults
            </button>
          </div>

        {:else if activeSection === "keybindings"}
          <div class="stack">
            <p class="note muted">
              Built-in shortcuts. <kbd class="inline-code">Mod</kbd> is Ctrl on Linux/Windows
              and ⌘ on macOS.
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

{#snippet toolEditorShell()}
  <header class="modal-header">
    <h2 id="tool-editor-title" class="title">
      {toolEditorIsNew ? "Create tool" : `Edit ${toolEditorDraft?.name ?? "tool"}`}
    </h2>
    <button type="button" class="icon-close" onclick={closeToolEditor} aria-label="Close">×</button>
  </header>

  <div class="tool-editor-body">
    {#if toolEditorError}
      <p class="tool-editor-error" role="alert">{toolEditorError}</p>
    {/if}
    <label class="field">
      <span class="name">Name</span>
      <input
        type="text"
        class="input"
        bind:value={toolEditorDraft!.name}
        placeholder="my_tool"
        disabled={!toolEditorIsNew && toolEditorDraft!.builtin}
      />
      {#if toolEditorDraft!.builtin}
        <span class="hint">Built-in tool names cannot be changed.</span>
      {/if}
    </label>
    <label class="field">
      <span class="name">Description</span>
      <textarea
        class="input tool-editor-textarea"
        rows="3"
        bind:value={toolEditorDraft!.description}
        placeholder="What this tool does for the model…"
      ></textarea>
    </label>
    <label class="field">
      <span class="name">Default policy</span>
      <select class="input" bind:value={toolEditorDraft!.rule}>
        <option value="ask">Ask</option>
        <option value="allow">Allow</option>
        <option value="deny">Deny</option>
      </select>
    </label>
    <label class="field">
      <span class="name">Parameters (JSON Schema)</span>
      <textarea
        class="input tool-editor-code"
        rows="10"
        bind:value={toolEditorDraft!.parametersJson}
        spellcheck="false"
      ></textarea>
      <span class="hint">
        OpenAI-style function parameters object. Custom tools need a handler in code to run; built-ins
        use the app implementation.
      </span>
    </label>
  </div>

  <footer class="modal-footer">
    <button type="button" class="btn ghost" onclick={closeToolEditor}>Cancel</button>
    <button type="button" class="btn primary" onclick={saveToolEditor}>Save tool</button>
  </footer>
{/snippet}

{#if toolEditorOpen && toolEditorDraft}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="tool-editor-backdrop" onclick={onToolEditorBackdropMouseDown} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="tool-editor-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tool-editor-title"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
    >
      {@render toolEditorShell()}
    </div>
  </div>
{/if}

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

  .nav-group {
    display: block;
    padding: 10px 10px 4px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #5c5c5c;
  }

  .nav-item--nested {
    padding-left: 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .nav-active-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
    background: #3fb950;
    box-shadow: 0 0 4px rgba(63, 185, 80, 0.5);
  }

  .provider-page-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .provider-page-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #e8e8e8;
  }

  .active-provider-pill {
    font-size: 11px;
    font-weight: 500;
    padding: 4px 10px;
    border-radius: 999px;
    background: #1e2a1e;
    border: 1px solid #2d4a2d;
    color: #86c9b7;
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

  .note.caution {
    color: #d4a656;
    margin-top: 8px;
  }

  .live-server-panel {
    margin-top: 12px;
    padding: 10px 12px;
    border: 1px solid #333;
    border-radius: 8px;
    background: #181818;
  }

  .live-server-dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
    margin: 0 0 8px;
    font-size: 12px;
  }

  .live-server-dl dt {
    color: #737373;
    font-weight: 500;
  }

  .live-server-dl dd {
    margin: 0;
    color: #e0e0e0;
  }

  .model-list-meta {
    font-size: 10px;
    color: #737373;
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

  .model-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .model-list-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px 4px 10px;
    background: #1c1c1c;
    border: 1px solid #333;
    border-radius: 6px;
  }

  .model-list-name {
    font-size: 11px;
    font-family: ui-monospace, monospace;
    color: #86c9b7;
  }

  .model-list-delete {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: #555;
    font-size: 14px;
    cursor: pointer;
  }

  .model-list-delete:hover {
    background: #3a2020;
    color: #e57373;
  }

  .model-library-toggle {
    margin-top: 4px;
  }

  .model-library {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 8px;
  }

  .pull-progress {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    background: #1e2a1e;
    border: 1px solid #2d4a2d;
    border-radius: 6px;
  }

  .pull-model {
    font-size: 12px;
    font-family: ui-monospace, monospace;
    color: #86c9b7;
  }

  .pull-status {
    font-size: 11px;
    color: #8bc98b;
  }

  .model-library-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 10px;
    max-height: 400px;
    overflow-y: auto;
  }

  .library-model-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    background: #222;
    border: 1px solid #383838;
    border-radius: 6px;
  }

  .library-model-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .library-model-name {
    font-size: 13px;
    font-weight: 600;
    color: #e8e8e8;
  }

  .library-model-size {
    font-size: 10px;
    color: #666;
  }

  .library-model-desc {
    font-size: 11px;
    line-height: 1.4;
    color: #888;
    margin: 0;
  }

  .library-model-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }

  .library-tag-btn {
    padding: 3px 8px;
    font-size: 10px;
    font-family: ui-monospace, monospace;
    background: #2a2a2a;
    border: 1px solid #404040;
    border-radius: 4px;
    color: #a8d4ff;
    cursor: pointer;
  }

  .library-tag-btn:hover:not(:disabled) {
    background: #1a3a52;
    border-color: #007acc;
  }

  .library-tag-btn.installed {
    background: #1e2a1e;
    border-color: #2d4a2d;
    color: #86c9b7;
    cursor: default;
  }

  .library-tag-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .gguf-links {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px;
  }

  .gguf-link {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
    background: #1c1c1c;
    border: 1px solid #333;
    border-radius: 6px;
    text-decoration: none;
    transition: border-color 0.15s, background 0.15s;
  }

  .gguf-link:hover {
    background: #222;
    border-color: #007acc;
  }

  .gguf-name {
    font-size: 12px;
    font-weight: 500;
    color: #a8d4ff;
  }

  .gguf-desc {
    font-size: 10px;
    color: #666;
  }

  .provider-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    background: #1e1e1e;
    border: 1px solid #383838;
    border-radius: 8px;
  }

  .provider-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }

  .provider-title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: #e8e8e8;
  }

  .provider-detail {
    flex: 1;
    min-width: 120px;
    font-size: 11px;
    color: #888;
  }

  .provider-toolbar {
    flex-wrap: wrap;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    background: #555;
  }

  .status-dot.green {
    background: #3fb950;
    box-shadow: 0 0 6px rgba(63, 185, 80, 0.45);
  }

  .status-dot.red {
    background: #f85149;
    box-shadow: 0 0 6px rgba(248, 81, 73, 0.35);
  }

  .status-dot.yellow {
    background: #d29922;
    box-shadow: 0 0 6px rgba(210, 153, 34, 0.4);
  }

  .status-dot.idle {
    background: #555;
  }

  .tool-policy-table {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .tool-policy-row {
    display: grid;
    grid-template-columns: 1fr auto 60px;
    gap: 10px;
    align-items: start;
    padding: 10px 12px;
    background: #1e1e1e;
    border: 1px solid #383838;
    border-radius: 8px;
  }

  .tool-policy-row--head {
    background: transparent;
    border: none;
    padding: 0 4px 4px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #666;
  }

  .tool-policy-actions-head {
    width: 60px;
  }

  .tool-policy-actions {
    display: flex;
    gap: 4px;
    justify-content: flex-end;
  }

  .tool-policy-icon-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: #888;
    cursor: pointer;
  }

  .tool-policy-icon-btn:hover {
    background: #2a2a2a;
    color: #e0e0e0;
  }

  .tool-policy-badge.edited {
    color: #c9a86c;
  }

  .tool-policy-footer {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
  }

  .tool-editor-backdrop {
    position: fixed;
    inset: 0;
    z-index: 300;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(3px);
  }

  .tool-editor-modal {
    box-sizing: border-box;
    width: min(520px, calc(100vw - 48px));
    max-height: min(640px, calc(100vh - 48px));
    display: flex;
    flex-direction: column;
    background: #262626;
    border: 1px solid #3f3f3f;
    border-radius: 10px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
    overflow: hidden;
  }

  .tool-editor-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 14px 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .tool-editor-error {
    margin: 0;
    padding: 8px 10px;
    border-radius: 6px;
    background: #3a2020;
    color: #e57373;
    font-size: 12px;
  }

  .tool-editor-textarea {
    resize: vertical;
    min-height: 64px;
  }

  .tool-editor-code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    line-height: 1.45;
    resize: vertical;
    min-height: 160px;
  }

  .tool-policy-name-col {
    min-width: 0;
  }

  .tool-policy-name {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    color: #86c9b7;
  }

  .tool-policy-badge {
    margin-left: 6px;
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 3px;
    background: #2a2a2a;
    color: #888;
    text-transform: uppercase;
  }

  .tool-policy-badge.custom {
    color: #a8d4ff;
  }

  .tool-policy-desc {
    margin: 4px 0 0;
    font-size: 11px;
    line-height: 1.4;
    color: #737373;
  }

  .tool-rule-toggle {
    display: flex;
    border: 1px solid #404040;
    border-radius: 6px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .tool-rule-btn {
    padding: 4px 8px;
    font-size: 10px;
    text-transform: capitalize;
    border: none;
    background: #1c1c1c;
    color: #888;
    cursor: pointer;
  }

  .tool-rule-btn + .tool-rule-btn {
    border-left: 1px solid #404040;
  }

  .tool-rule-btn:hover {
    color: #e0e0e0;
    background: #2a2a2a;
  }

  .tool-rule-btn.active {
    background: #1a3a52;
    color: #e8e8e8;
  }

  .tool-policy-remove {
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: #666;
    font-size: 18px;
    cursor: pointer;
  }

  .tool-policy-remove:hover {
    background: #3a2020;
    color: #e57373;
  }

  .removed-tools {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .tag-btn {
    cursor: pointer;
    border: 1px dashed #444;
  }

  .tag-btn:hover {
    border-color: #007acc;
    color: #a8d4ff;
  }

  .icon-pack-path-row {
    display: flex;
    gap: 8px;
    align-items: stretch;
  }

  .icon-pack-path-row .input {
    flex: 1;
    min-width: 0;
  }

  .icon-pack-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .attribution-details {
    margin: 0;
    font-size: 12px;
    color: #9a9a9a;
  }

  .attribution-details summary {
    cursor: pointer;
    color: #c8c8c8;
  }

  .attribution-details a {
    color: #6eb6ff;
  }

  .syntax-color-field .name {
    display: block;
  }

  .syntax-color-hint {
    display: block;
    font-size: 11px;
    color: #888;
    margin-top: 2px;
    font-family: var(--font-mono, ui-monospace, monospace);
  }

  .syntax-color-row {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 6px;
  }

  .syntax-color-swatch {
    width: 36px;
    height: 32px;
    padding: 2px;
    border: 1px solid #444;
    border-radius: 4px;
    background: #1e1e1e;
    cursor: pointer;
  }

  .syntax-color-hex {
    flex: 1;
    min-width: 0;
    font-family: var(--font-mono, ui-monospace, monospace);
    text-transform: lowercase;
  }

  .syntax-preview {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    border-radius: 6px;
    background: var(--editor-bg, #1a1b26);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 12px;
    line-height: 1.5;
  }

  .syntax-preview-line {
    display: block;
    white-space: pre;
  }

  .syntax-preview-label {
    margin: 8px 0 2px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted-foreground);
  }

  .syntax-preview-label:first-child {
    margin-top: 0;
  }

  .settings-subheading {
    margin: 16px 0 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--foreground);
  }

  .linkish {
    padding: 0;
    border: none;
    background: none;
    color: var(--primary);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }

  .editor-chrome-preview {
    margin-top: 8px;
    padding: 10px 12px;
    border-radius: 6px;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 12px;
    line-height: 1.5;
    border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  }

  .editor-chrome-preview__selection {
    padding: 0 2px;
    border-radius: 2px;
  }

  .checkbox-field {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-direction: row;
  }

  .checkbox-field .name {
    margin: 0;
  }
</style>
