<script lang="ts">
  import { get } from "svelte/store";
  import {
    settings,
    type ModelConfig,
    type ChatBackend,
  } from "$lib/stores/settings";
  import {
    fetchAnthropicModelCatalog,
    fetchDeepseekModelCatalog,
  } from "$lib/cloudModelCatalog";
  import { mergeCloudModelCatalog, modelsVisibleInPicker } from "$lib/modelPicker";
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
  import { toolPolicy as toolPolicyStore } from "$lib/stores/toolPolicy";
  import {
    getEditorPayloadForTool,
    type ToolEditorPayload,
  } from "$lib/toolPolicy";
  import { EMPTY_PARAMETERS_JSON } from "$lib/toolSchema";
  import { files } from "$lib/stores/files";
  import { isTauriAvailable, runShell } from "$lib/ipc";
  import AgentContextSection, {
    type AgentContextSubview,
  } from "./AgentContextSection.svelte";
  import ModelListWithSettings from "./ModelListWithSettings.svelte";
  import ProviderModelDefaultsPanel from "./ProviderModelDefaultsPanel.svelte";
  import AppearanceSettings from "./AppearanceSettings.svelte";
  import IconsSettings from "./IconsSettings.svelte";
  import ExperimentalSettings from "./ExperimentalSettings.svelte";
  import KeybindingsSettings from "./KeybindingsSettings.svelte";
  import LspSettings from "./LspSettings.svelte";
  import ToolsSettings from "./ToolsSettings.svelte";
  import GeneralSettings from "./GeneralSettings.svelte";
  import {
    probeOllama,
    probeLlamacpp,
    portFromBaseUrl,
    startOllamaServeCommand,
    stopOllamaServerCommand,
    stopLlamacppServerCommand,
    type ProviderHealth,
  } from "$lib/providerHealth";
  import { workbenchChrome } from "$lib/stores/workbenchChrome";
  import { type WorkbenchChromeMap } from "$lib/workbench/workbenchChrome";
  import { applyWorkbenchTheme, type WorkbenchThemeId } from "$lib/workbench-theme";
  import { syntaxTheme } from "$lib/stores/syntaxTheme";
  import { editorChrome } from "$lib/stores/editorChrome";
  import { type SyntaxColorMap } from "$lib/editor/syntaxColors";
  import { type EditorChromeMap } from "$lib/editor/editorChrome";
  import { explorerAppearance } from "$lib/stores/explorerAppearance";
  import { chatAppearance } from "$lib/stores/chatAppearance";
  import { contextAppearance } from "$lib/stores/contextAppearance";
  import { type ExplorerAppearanceMap } from "$lib/explorer/explorerAppearance";
  import { type ChatAppearanceMap } from "$lib/chat/chatAppearance";
  import { type ContextAppearanceMap } from "$lib/chat/contextAppearance";
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
    | "general"
    | "agent-context"
    | "agent-context-prompts"
    | "agent-context-skills"
    | "providers-ollama"
    | "providers-llamacpp"
    | "providers-anthropic"
    | "providers-deepseek"
    | "tools"
    | "experimental-compaction"
    | "experimental-autocomplete"
    | "appearance-theme"
    | "appearance-icons"
    | "lsp"
    | "keybindings";

  const backendToSection: Record<ChatBackend, Section> = {
    ollama: "providers-ollama",
    llamacpp: "providers-llamacpp",
    anthropic: "providers-anthropic",
    deepseek: "providers-deepseek",
  };

  let activeSection = $state<Section>("general");
  let agentContextSubview = $state<AgentContextSubview>("overview");

  type ProviderSubview = "ollama-server" | "llamacpp-server";
  let providerSubview = $state<ProviderSubview | null>(null);

  function openProviderSubview(view: ProviderSubview) {
    providerSubview = view;
  }

  function closeProviderSubview() {
    providerSubview = null;
  }

  function selectSettingsSection(id: Section) {
    providerSubview = null;
    activeSection = id;
    if (id === "agent-context") agentContextSubview = "overview";
    if (id === "agent-context-prompts") agentContextSubview = "prompts";
    if (id === "agent-context-skills") agentContextSubview = "skills";
  }

  function onAgentContextNavigate(view: AgentContextSubview) {
    agentContextSubview = view;
    if (view === "overview") activeSection = "agent-context";
    if (view === "prompts") activeSection = "agent-context-prompts";
    if (view === "skills") activeSection = "agent-context-skills";
  }

  let anthropicKey = $state("");
  let deepseekKey = $state("");
  let anthropicKeyFromKeychain = $state(false);
  let deepseekKeyFromKeychain = $state(false);
  let anthropicModels = $state<ModelConfig[]>([]);
  let deepseekModels = $state<ModelConfig[]>([]);
  let loadingAnthropicCatalog = $state(false);
  let loadingDeepseekCatalog = $state(false);
  let anthropicCatalogError = $state("");
  let deepseekCatalogError = $state("");
  let openaiKey = $state("");
  let ollamaEndpoint = $state("");
  let ollamaApiKey = $state("");
  let selectedModel = $state("");
  let ollamaModels = $state<ModelConfig[]>([]);
  let loadingOllama = $state(false);
  let loadingLlamacpp = $state(false);
  let llamacppEndpoint = $state(DEFAULT_LLAMACPP_ENDPOINT);
  let llamacppApiKey = $state("");
  let toolEditorOpen = $state(false);
  let toolEditorIsNew = $state(false);
  let toolEditorError = $state("");
  let toolEditorDraft = $state<ToolEditorPayload | null>(null);
  let chatBackend = $state<ChatBackend>("ollama");
  let anthropicExtendedThinking = $state(true);
  let ollamaContextChoice = $state(8192);
  let llamacppContextChoice = $state(8192);
  let ollamaServerTemplate = $state<OllamaServerTemplate>({
    modelsPath: "~/.ollama/models",
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
    modelPath: "/path/to/model.gguf",
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
    user: "user",
  });
  let workbenchTheme = $state<WorkbenchThemeId>("spacebar");
  let webFetchAllowedHostsText = $state("");
  let syntaxColors = $state<SyntaxColorMap>(syntaxTheme.get());
  let editorColors = $state<EditorChromeMap>(editorChrome.get());
  let explorerColors = $state<ExplorerAppearanceMap>(explorerAppearance.get());
  let chatColors = $state<ChatAppearanceMap>(chatAppearance.get());
  let contextColors = $state<ContextAppearanceMap>(contextAppearance.get());
  let workbenchChromeColors = $state<WorkbenchChromeMap>(workbenchChrome.get());

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

  const sections: {
    id: Section;
    label: string;
    group?: string;
    experimental?: boolean;
  }[] = [
    { id: "general", label: "General" },
    { id: "agent-context", label: "Agent Context", group: "Agent Context" },
    { id: "agent-context-prompts", label: "System prompts", group: "Agent Context" },
    { id: "agent-context-skills", label: "Skills", group: "Agent Context" },
    { id: "providers-ollama", label: "Ollama", group: "Providers" },
    { id: "providers-llamacpp", label: "llama.cpp", group: "Providers" },
    { id: "providers-anthropic", label: "Anthropic", group: "Providers" },
    { id: "providers-deepseek", label: "DeepSeek", group: "Providers" },
    { id: "tools", label: "Tools" },
    { id: "experimental-compaction", label: "Compaction", group: "Experimental", experimental: true },
    { id: "experimental-autocomplete", label: "Autocomplete", group: "Experimental", experimental: true },
    { id: "appearance-theme", label: "Theme", group: "Appearance" },
    { id: "appearance-icons", label: "Icons", group: "Appearance" },
    { id: "lsp", label: "LSP" },
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
    deepseekKey = $settings.apiKeys.deepseek;
    anthropicKeyFromKeychain = false;
    deepseekKeyFromKeychain = false;
    openaiKey = $settings.apiKeys.openai;
    ollamaEndpoint = $settings.ollamaEndpoint;
    ollamaApiKey = $settings.ollamaApiKey;
    llamacppEndpoint = $settings.llamacppEndpoint;
    llamacppApiKey = $settings.llamacppApiKey;
    selectedModel = $settings.selectedModel;
    ollamaModels = $settings.ollamaModels;
    anthropicModels = $settings.anthropicModels;
    deepseekModels = $settings.deepseekModels;
    anthropicCatalogError = "";
    deepseekCatalogError = "";
    chatBackend = $settings.chatBackend;
    anthropicExtendedThinking = $settings.anthropicExtendedThinking;
    workbenchTheme = $settings.workbenchTheme;
    webFetchAllowedHostsText = $settings.webFetchAllowedHosts.join("\n");
    syntaxColors = { ...syntaxTheme.get() };
    editorColors = { ...editorChrome.get() };
    explorerColors = { ...explorerAppearance.get() };
    chatColors = { ...chatAppearance.get() };
    contextColors = { ...contextAppearance.get() };
    workbenchChromeColors = { ...workbenchChrome.get() };
    llamacppModels = $settings.llamacppModels;
    ollamaServerTemplate = structuredClone($settings.ollamaServerTemplate);
    llamacppServerTemplate = structuredClone($settings.llamacppServerTemplate);
    activeSection = "general";
    void connectOllama();
    void connectLlamacpp();
    void loadKeychainKeys();
  });

  async function loadKeychainKeys() {
    const { getCloudApiKey } = await import("$lib/apiSecrets");
    const st = get(settings);
    if (st.cloudApiKeyStored?.anthropic && !anthropicKey.trim()) {
      try {
        const k = await getCloudApiKey("anthropic");
        if (k) { anthropicKey = k; anthropicKeyFromKeychain = true; }
      } catch { /* keychain unavailable */ }
    }
    if (st.cloudApiKeyStored?.deepseek && !deepseekKey.trim()) {
      try {
        const k = await getCloudApiKey("deepseek");
        if (k) { deepseekKey = k; deepseekKeyFromKeychain = true; }
      } catch { /* keychain unavailable */ }
    }
  }

  function setAsChatProvider(backend: ChatBackend) {
    chatBackend = backend;
    settings.setChatBackend(backend);
    const s = get(settings);
    selectedModel = s.selectedModel;
  }

  async function checkOllamaStatus(): Promise<ProviderHealth> {
    ollamaStatus = { ...ollamaStatus, checking: true, dot: "idle", detail: "Checking…" };
    const health = await probeOllama(ollamaEndpoint, ollamaApiKey);
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
      const loadedId = props.model?.trim() || null;
      if (llamacppModels.length > 0) {
        const match =
          (loadedId && llamacppModels.find((m) => m.id === loadedId)) ??
          llamacppModels.find((m) => m.id === selectedModel) ??
          llamacppModels[0];
        if (match) {
          selectedModel = match.id;
          settings.setSelectedModel(match.id);
        }
      }
      if (props.nCtx != null) {
        llamacppContextChoice = props.nCtx;
      } else if (llamacppModels[0]?.contextWindow) {
        llamacppContextChoice = llamacppModels[0].contextWindow;
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
      ollamaModels = await fetchOllamaModelList(ollamaEndpoint, prev, ollamaApiKey);
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

  async function connectAnthropicCatalog(force = false) {
    const key = anthropicKey.trim();
    if (key.length < 20) {
      anthropicCatalogError = "Add a valid API key first.";
      return;
    }
    const st = get(settings);
    if (st.anthropicCatalogFetched && !force) return;

    loadingAnthropicCatalog = true;
    anthropicCatalogError = "";
    try {
      const rows = await fetchAnthropicModelCatalog(key);
      const merged = mergeCloudModelCatalog(st.anthropicModels, rows);
      anthropicModels = merged;
      settings.setAnthropicModels(merged);
    } catch (e) {
      anthropicCatalogError = e instanceof Error ? e.message : String(e);
      anthropicModels = [];
      settings.setAnthropicModels([]);
    } finally {
      loadingAnthropicCatalog = false;
    }
  }

  async function connectDeepseekCatalog(force = false) {
    const key = deepseekKey.trim();
    if (key.length < 20) {
      deepseekCatalogError = "Add a valid API key first.";
      return;
    }
    const st = get(settings);
    if (st.deepseekCatalogFetched && !force) return;

    loadingDeepseekCatalog = true;
    deepseekCatalogError = "";
    try {
      const rows = await fetchDeepseekModelCatalog(key);
      const merged = mergeCloudModelCatalog(st.deepseekModels, rows);
      deepseekModels = merged;
      settings.setDeepseekModels(merged);
    } catch (e) {
      deepseekCatalogError = e instanceof Error ? e.message : String(e);
      deepseekModels = [];
      settings.setDeepseekModels([]);
    } finally {
      loadingDeepseekCatalog = false;
    }
  }

  function toggleOllamaPicker(modelId: string, show: boolean) {
    settings.setModelShowInPicker("ollama", modelId, show);
    ollamaModels = get(settings).ollamaModels;
  }

  function toggleAnthropicPicker(modelId: string, show: boolean) {
    settings.setModelShowInPicker("anthropic", modelId, show);
    anthropicModels = get(settings).anthropicModels;
  }

  function toggleDeepseekPicker(modelId: string, show: boolean) {
    settings.setModelShowInPicker("deepseek", modelId, show);
    deepseekModels = get(settings).deepseekModels;
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

  const llamacppLoadedModelId = $derived.by(() => {
    const fromProps = llamacppLiveProps?.model?.trim();
    if (fromProps && llamacppModels.some((m) => m.id === fromProps)) return fromProps;
    if (llamacppModels.length === 1) return llamacppModels[0]!.id;
    return selectedModel;
  });

  const llamacppChatModelLabel = $derived.by(() => {
    const row = llamacppModels.find((m) => m.id === selectedModel);
    return row?.name ?? selectedModel ?? "—";
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
      rule: get(toolPolicyStore).defaultRule,
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
    closeToolEditor();
  }

  async function handleSave() {
    const { saveCloudApiKey } = await import("$lib/apiSecrets");
    await saveCloudApiKey("anthropic", anthropicKey);
    await saveCloudApiKey("deepseek", deepseekKey);
    settings.setApiKey("openai", openaiKey);
    settings.setOllamaEndpoint(ollamaEndpoint);
    settings.setOllamaApiKey(ollamaApiKey);
    settings.setLlamacppEndpoint(llamacppEndpoint);
    settings.setLlamacppApiKey(llamacppApiKey);
    settings.setSelectedModel(selectedModel);
    settings.setChatBackend(chatBackend);
    settings.setAnthropicExtendedThinking(anthropicExtendedThinking);
    const previousWorkbenchTheme = get(settings).workbenchTheme;
    if (workbenchTheme !== previousWorkbenchTheme) {
      applyWorkbenchTheme(workbenchTheme);
      editorColors = editorChrome.syncFromActiveTheme();
      syntaxColors = { ...syntaxTheme.syncFromActiveTheme() };
      workbenchChromeColors = { ...workbenchChrome.syncFromActiveTheme() };
      contextColors = { ...contextAppearance.syncFromActiveTheme() };
      chatColors = { ...chatAppearance.syncFromActiveTheme() };
    }
    settings.setWorkbenchTheme(workbenchTheme);
    settings.setWebFetchAllowedHosts(
      webFetchAllowedHostsText
        .split(/\n|,/)
        .map((h) => h.trim())
        .filter(Boolean)
    );
    syntaxTheme.persist(syntaxColors);
    editorChrome.persist(editorColors);
    explorerAppearance.persist(explorerColors);
    chatAppearance.persist(chatColors);
    contextAppearance.persist(contextColors);
    workbenchChrome.persist(workbenchChromeColors);

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
              onclick={() => selectSettingsSection(s.id)}
            >
              <span class="nav-item-label">{s.label}</span>
              {#if s.experimental}
                <span class="nav-experimental-pill">Experimental</span>
              {/if}
              {#if (s.id === "providers-ollama" && chatBackend === "ollama") || (s.id === "providers-llamacpp" && chatBackend === "llamacpp") || (s.id === "providers-anthropic" && chatBackend === "anthropic") || (s.id === "providers-deepseek" && chatBackend === "deepseek")}
                <span class="nav-active-dot" title="Active chat provider"></span>
              {/if}
            </button>
          {/each}
        </nav>

        <div class="modal-body">
        {#if activeSection === "general"}
          <GeneralSettings bind:explorerColors />

        {:else if activeSection === "agent-context" || activeSection === "agent-context-prompts" || activeSection === "agent-context-skills"}
          <AgentContextSection
            subview={agentContextSubview}
            onNavigate={onAgentContextNavigate}
          />

        {:else if activeSection === "providers-ollama"}
          <div class="stack ollama-settings provider-page-shell">
            {#if providerSubview === "ollama-server"}
              <div class="provider-advanced-page">
              <button
                type="button"
                class="provider-drillback"
                onclick={() => closeProviderSubview()}
              >
                <span class="provider-drillback-arrow" aria-hidden="true">←</span>
                Ollama
              </button>
              <h3 class="provider-page-title">Server config (terminal)</h3>
              <ProviderServerGuide
                kind="ollama"
                compact
                bind:ollamaTemplate={ollamaServerTemplate}
                {ollamaEndpoint}
                {selectedModel}
                ollamaContext={ollamaContextChoice}
              />
              </div>
            {:else}
            <div class="provider-page-body">
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

            <div class="ollama-connection">
              <div class="provider-head">
                <span
                  class="status-dot"
                  class:green={!ollamaStatus.checking && ollamaStatus.dot === "green"}
                  class:red={!ollamaStatus.checking && ollamaStatus.dot === "red"}
                  class:yellow={!ollamaStatus.checking && ollamaStatus.dot === "yellow"}
                  class:idle={ollamaStatus.checking || ollamaStatus.dot === "idle"}
                  title={ollamaStatus.detail}
                ></span>
                <span class="provider-detail">
                  {ollamaStatus.checking ? "Checking…" : ollamaStatus.detail}
                </span>
              </div>
              <div class="row ollama-endpoint-row">
                <input
                  type="text"
                  bind:value={ollamaEndpoint}
                  placeholder="http://127.0.0.1:11434"
                  class="input grow ollama-endpoint-input"
                />
                <div class="ollama-connection-actions">
                  {#if ollamaStatus.dot === "red"}
                    <button
                      type="button"
                      class="btn secondary ollama-action-btn"
                      onclick={() => connectOllama()}
                      disabled={ollamaStatus.checking}
                    >
                      {ollamaStatus.checking ? "…" : "Connect"}
                    </button>
                    {#if canRunShell}
                      <button
                        type="button"
                        class="btn ghost ollama-action-btn"
                        onclick={() => startOllamaServer()}
                        disabled={ollamaStatus.checking}
                      >
                        Start
                      </button>
                    {/if}
                  {:else}
                    <button
                      type="button"
                      class="btn secondary ollama-action-btn"
                      onclick={() => connectOllama()}
                      disabled={loadingOllama || ollamaStatus.checking}
                    >
                      {loadingOllama || ollamaStatus.checking ? "…" : "Refresh"}
                    </button>
                    {#if canRunShell}
                      <button
                        type="button"
                        class="btn ghost ollama-action-btn"
                        onclick={() => stopOllamaServer()}
                        disabled={loadingOllama || ollamaStatus.checking}
                      >
                        Stop
                      </button>
                    {/if}
                  {/if}
                </div>
              </div>
              <label class="field">
                <span class="name">API key (optional)</span>
                <input
                  type="password"
                  bind:value={ollamaApiKey}
                  placeholder="Bearer token for remote Ollama"
                  class="input"
                  autocomplete="off"
                />
              </label>
            </div>

            <p class="group-label">Default for new chats</p>
            <div class="chat-model-context-row">
              <label class="chat-model-context-field">
                <span class="name">Chat model</span>
                {#if modelsVisibleInPicker(ollamaModels).length > 0}
                  <select bind:value={selectedModel} class="input input-compact chat-model-select">
                    {#each modelsVisibleInPicker(ollamaModels) as model}
                      <option value={model.id}>{model.name}</option>
                    {/each}
                  </select>
                {:else}
                  <p class="note muted chat-model-empty">
                    No local models yet. Run <code class="inline-code">ollama pull llama3.2:1b</code>
                    then <strong>Refresh</strong>.
                  </p>
                {/if}
              </label>

              {#if ollamaModels.length > 0}
                {@const ctxMax = maxCtxForSelectedOllama(selectedModel)}
                {@const ctxOpts = contextOptionsUpTo(ctxMax)}
                <label class="chat-model-context-field">
                  <span class="name" title="API num_ctx on next message · max {fmtCtx(ctxMax)}">Context</span>
                  <select class="input input-compact context-select" bind:value={ollamaContextChoice}>
                    {#each ctxOpts as n}
                      <option value={n}>{fmtCtx(n)}</option>
                    {/each}
                  </select>
                </label>
              {/if}
            </div>

            <p class="group-label">Installed models</p>
            <p class="note muted">Choose which models appear in the chat model menu.</p>
            <ProviderModelDefaultsPanel backend="ollama" />
            {#if ollamaModels.length > 0}
              <ModelListWithSettings backend="ollama" onTogglePicker={toggleOllamaPicker} />
            {:else}
              <p class="note muted">No models installed yet.</p>
            {/if}

            <button
              type="button"
              class="btn secondary model-library-toggle"
              onclick={() => (showModelLibrary = !showModelLibrary)}
            >
              {showModelLibrary ? "Hide Model Library" : "Browse Model Library"}
            </button>

            {#if showModelLibrary}
              <div class="model-library-panel">
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

            <footer class="provider-page-footer">
              <button
                type="button"
                class="btn secondary"
                onclick={() => openProviderSubview("ollama-server")}
              >
                Advanced settings…
              </button>
            </footer>
            {/if}
          </div>

        {:else if activeSection === "providers-llamacpp"}
          <div class="stack ollama-settings provider-page-shell">
            {#if providerSubview === "llamacpp-server"}
              <div class="provider-advanced-page">
              <button
                type="button"
                class="provider-drillback"
                onclick={() => closeProviderSubview()}
              >
                <span class="provider-drillback-arrow" aria-hidden="true">←</span>
                llama.cpp
              </button>
              <h3 class="provider-page-title">Server config (terminal)</h3>
              <ProviderServerGuide
                kind="llamacpp"
                compact
                bind:llamacppTemplate={llamacppServerTemplate}
                llamacppContext={llamacppContextChoice}
              />
              </div>
            {:else}
            <div class="provider-page-body">
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

            <div class="ollama-connection">
              <div class="provider-head">
                <span
                  class="status-dot"
                  class:green={!llamacppStatus.checking && llamacppStatus.dot === "green"}
                  class:red={!llamacppStatus.checking && llamacppStatus.dot === "red"}
                  class:yellow={!llamacppStatus.checking && llamacppStatus.dot === "yellow"}
                  class:idle={llamacppStatus.checking || llamacppStatus.dot === "idle"}
                  title={llamacppStatus.detail}
                ></span>
                <span class="provider-detail">
                  {llamacppStatus.checking ? "Checking…" : llamacppStatus.detail}
                </span>
              </div>
              <div class="row ollama-endpoint-row">
                <input
                  type="text"
                  bind:value={llamacppEndpoint}
                  placeholder={DEFAULT_LLAMACPP_ENDPOINT}
                  class="input grow ollama-endpoint-input"
                />
                <div class="ollama-connection-actions">
                  {#if llamacppStatus.dot === "red"}
                    <button
                      type="button"
                      class="btn secondary ollama-action-btn"
                      onclick={() => connectLlamacpp()}
                      disabled={llamacppStatus.checking}
                    >
                      {llamacppStatus.checking ? "…" : "Connect"}
                    </button>
                  {:else}
                    <button
                      type="button"
                      class="btn secondary ollama-action-btn"
                      onclick={() => connectLlamacpp()}
                      disabled={loadingLlamacpp || llamacppStatus.checking}
                    >
                      {loadingLlamacpp || llamacppStatus.checking ? "…" : "Refresh"}
                    </button>
                    {#if canRunShell}
                      <button
                        type="button"
                        class="btn ghost ollama-action-btn"
                        onclick={() => stopLlamacppServer()}
                        disabled={loadingLlamacpp || llamacppStatus.checking}
                      >
                        Stop
                      </button>
                    {/if}
                  {/if}
                </div>
              </div>
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
            </div>

            {#if llamacppModels.length > 0}
              <p class="group-label">Default for new chats</p>
              <div class="chat-model-context-row">
                <label class="chat-model-context-field">
                  <span class="name">Chat model</span>
                  <span class="provider-readonly-value" title={llamacppChatModelLabel}>
                    {llamacppChatModelLabel}
                  </span>
                </label>
                <label class="chat-model-context-field">
                  <span class="name" title="From running server (GET /props)">Context</span>
                  <span class="provider-readonly-value">{fmtCtx(llamacppContextChoice)}</span>
                </label>
              </div>
            {/if}

            <p class="group-label">Server models</p>
            <p class="note muted">
              Models reported by the running server. Only the loaded GGUF is usable for chat.
            </p>
            <ProviderModelDefaultsPanel backend="llamacpp" />
            {#if llamacppModels.length > 0}
              <ModelListWithSettings backend="llamacpp" readonly loadedModelId={llamacppLoadedModelId} />
            {:else}
              <p class="note muted">
                {#if llamacppStatus.dot === "red"}
                  Server not reachable — start llama-server, then Connect.
                {:else}
                  No models reported — load a GGUF with llama-server, then Connect.
                {/if}
              </p>
            {/if}

            <p class="group-label">Get GGUF models</p>
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

            <footer class="provider-page-footer">
              <button
                type="button"
                class="btn secondary"
                onclick={() => openProviderSubview("llamacpp-server")}
              >
                Advanced settings…
              </button>
            </footer>
            {/if}
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
              {#if anthropicKeyFromKeychain}
                <span class="hint hint-keychain">Stored in system keychain</span>
              {:else}
                <span class="hint">Required for Claude models</span>
              {/if}
              <input
                type="password"
                bind:value={anthropicKey}
                oninput={() => { anthropicKeyFromKeychain = false; }}
                placeholder="sk-ant-…"
                class="input"
                autocomplete="off"
              />
            </label>

            <div class="provider-connect-row">
              <button
                type="button"
                class="btn secondary"
                disabled={loadingAnthropicCatalog || anthropicKey.trim().length < 20}
                onclick={() => connectAnthropicCatalog(true)}
              >
                {loadingAnthropicCatalog
                  ? "…"
                  : $settings.anthropicCatalogFetched
                    ? "Refresh models"
                    : "Connect"}
              </button>
            </div>
            {#if anthropicCatalogError}
              <p class="note catalog-error">{anthropicCatalogError}</p>
            {/if}

            {#if anthropicModels.length > 0}
              <p class="group-label">Models in chat picker</p>
              <p class="note muted">Fetched from your API key. Toggle which appear in the chat menu.</p>
              <ProviderModelDefaultsPanel backend="anthropic" />
              <ModelListWithSettings backend="anthropic" onTogglePicker={toggleAnthropicPicker} />

              <label class="field">
                <span class="name">Chat model</span>
                <select bind:value={selectedModel} class="input">
                  {#each modelsVisibleInPicker(anthropicModels) as model}
                    <option value={model.id}>{model.name}</option>
                  {/each}
                </select>
              </label>
            {:else if !loadingAnthropicCatalog}
              <p class="note muted">Connect to load models available to your API key.</p>
            {/if}

            <label class="field field-row">
              <input type="checkbox" bind:checked={anthropicExtendedThinking} class="checkbox" />
              <div class="field-col">
                <span class="name">Extended thinking (Claude 4+)</span>
                <span class="hint">Show reasoning as it streams.</span>
              </div>
            </label>
          </div>

        {:else if activeSection === "providers-deepseek"}
          <div class="stack">
            <div class="provider-page-head">
              <h3 class="provider-page-title">DeepSeek</h3>
              {#if chatBackend === "deepseek"}
                <span class="active-provider-pill">Active chat provider</span>
              {:else}
                <button type="button" class="btn secondary" onclick={() => setAsChatProvider("deepseek")}>
                  Use for chat
                </button>
              {/if}
            </div>
            <p class="note">
              Cloud DeepSeek models via the OpenAI-compatible API. Requires an API key from
              <a href="https://platform.deepseek.com" target="_blank" rel="noreferrer">platform.deepseek.com</a>.
            </p>

            <label class="field">
              <span class="name">API Key</span>
              {#if deepseekKeyFromKeychain}
                <span class="hint hint-keychain">Stored in system keychain</span>
              {:else}
                <span class="hint">Required for DeepSeek Chat and Reasoner</span>
              {/if}
              <input
                type="password"
                bind:value={deepseekKey}
                oninput={() => { deepseekKeyFromKeychain = false; }}
                placeholder="sk-…"
                class="input"
                autocomplete="off"
              />
            </label>

            <div class="provider-connect-row">
              <button
                type="button"
                class="btn secondary"
                disabled={loadingDeepseekCatalog || deepseekKey.trim().length < 20}
                onclick={() => connectDeepseekCatalog(true)}
              >
                {loadingDeepseekCatalog
                  ? "…"
                  : $settings.deepseekCatalogFetched
                    ? "Refresh models"
                    : "Connect"}
              </button>
            </div>
            {#if deepseekCatalogError}
              <p class="note catalog-error">{deepseekCatalogError}</p>
            {/if}

            {#if deepseekModels.length > 0}
              <p class="group-label">Models in chat picker</p>
              <p class="note muted">Fetched from your API key. Toggle which appear in the chat menu.</p>
              <ProviderModelDefaultsPanel backend="deepseek" />
              <ModelListWithSettings backend="deepseek" onTogglePicker={toggleDeepseekPicker} />

              <label class="field">
                <span class="name">Chat model</span>
                <select bind:value={selectedModel} class="input">
                  {#each modelsVisibleInPicker(deepseekModels) as model}
                    <option value={model.id}>{model.name}</option>
                  {/each}
                </select>
              </label>
            {:else if !loadingDeepseekCatalog}
              <p class="note muted">Connect to load models available to your API key.</p>
            {/if}
          </div>

        {:else if activeSection === "tools"}
          <ToolsSettings
            bind:webFetchAllowedHostsText
            onOpenToolEditor={openToolEditor}
            onOpenNewToolEditor={openNewToolEditor}
            onResetTools={resetToolsToDefaults}
            onNavigate={selectSettingsSection}
          />

        {:else if activeSection === "experimental-compaction" || activeSection === "experimental-autocomplete"}
          <ExperimentalSettings section={activeSection} />

        {:else if activeSection === "appearance-theme"}
          <AppearanceSettings
            section="appearance-theme"
            bind:syntaxColors
            bind:editorColors
            bind:explorerColors
            bind:chatColors
            bind:contextColors
            bind:workbenchChromeColors
            bind:workbenchTheme
            onNavigate={selectSettingsSection}
          />

        {:else if activeSection === "appearance-icons"}
          <IconsSettings />

        {:else if activeSection === "lsp"}
          <LspSettings />

        {:else if activeSection === "keybindings"}
          <KeybindingsSettings />
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
    background: rgba(0, 0, 0, 0.72);
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
    isolation: isolate;
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
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #333 #1f1f1f;
  }

  .nav-rail::-webkit-scrollbar {
    width: 4px;
  }

  .nav-rail::-webkit-scrollbar-track {
    background: #1f1f1f;
  }

  .nav-rail::-webkit-scrollbar-thumb {
    background: #333;
    border-radius: 2px;
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
    background: #3a3a3a;
  }

  .nav-item.active:hover {
    background: #424242;
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

  .nav-item-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nav-experimental-pill {
    flex-shrink: 0;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #c9a227;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(201, 162, 39, 0.12);
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

  .provider-page-shell {
    flex: 1;
    min-height: 0;
  }

  .provider-page-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
    flex: 1;
    min-height: 0;
  }

  .provider-page-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: auto;
    padding-top: 12px;
    border-top: 1px solid #333;
    flex-shrink: 0;
  }

  .provider-drillback {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    font-size: 12px;
    color: #a8d4ff;
    cursor: pointer;
  }

  .provider-drillback:hover {
    color: #cce4ff;
    text-decoration: underline;
  }

  .provider-drillback-arrow {
    font-size: 14px;
    line-height: 1;
  }

  .provider-advanced-page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
    min-width: 0;
  }

  .provider-advanced-page .provider-page-title {
    margin-top: -4px;
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
    scrollbar-width: thin;
    scrollbar-color: #3a3a3a #262626;
  }

  .modal-body::-webkit-scrollbar {
    width: 6px;
  }

  .modal-body::-webkit-scrollbar-track {
    background: #262626;
  }

  .modal-body::-webkit-scrollbar-thumb {
    background: #3a3a3a;
    border-radius: 3px;
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

  .chat-model-context-row {
    display: grid;
    grid-template-columns: auto auto;
    gap: 10px 16px;
    align-items: start;
    width: max-content;
    max-width: 100%;
  }

  .chat-model-context-field {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    margin: 0;
    min-width: 0;
  }

  .chat-model-context-field .name {
    font-size: 11px;
    line-height: 1.2;
    white-space: nowrap;
  }

  .chat-model-context-row .input-compact {
    width: 100%;
    min-width: 0;
    padding: 4px 6px;
    font-size: 12px;
    border-radius: 4px;
    box-sizing: border-box;
  }

  .chat-model-context-row .chat-model-select {
    width: 180px;
  }

  .chat-model-context-row .context-select {
    width: 72px;
  }

  .chat-model-context-row .chat-model-empty {
    margin: 0;
    max-width: 280px;
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

  .hint-keychain {
    color: #4ade80;
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

  .provider-readonly-value {
    display: block;
    min-height: 24px;
    padding: 4px 8px;
    box-sizing: border-box;
    border: 1px solid #333;
    border-radius: 4px;
    background: #1a1a1a;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.35;
    color: #d4d4d4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-model-context-field .provider-readonly-value {
    width: 100%;
    min-width: 0;
  }

  .chat-model-context-row .provider-readonly-value {
    min-width: 72px;
  }

  .ollama-settings {
    gap: 14px;
  }

  .ollama-connection {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .ollama-endpoint-row {
    align-items: center;
    flex-wrap: nowrap;
    width: min(100%, 520px);
  }

  .ollama-connection-actions {
    display: flex;
    flex-shrink: 0;
    gap: 8px;
  }

  .ollama-connection-actions .ollama-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 4.5rem;
  }

  .ollama-connection-actions .btn.ghost.ollama-action-btn {
    min-width: 3.25rem;
  }

  .ollama-endpoint-input {
    flex: 1 1 auto;
    min-width: 0;
    width: 0;
  }

  .provider-connect-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .catalog-error {
    color: #f48771;
  }

  .model-library-toggle {
    align-self: flex-start;
  }

  .model-library-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
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

  .provider-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }

  .provider-detail {
    flex: 1;
    min-width: 120px;
    font-size: 11px;
    color: #888;
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

  .tool-editor-backdrop {
    position: fixed;
    inset: 0;
    z-index: 300;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(0, 0, 0, 0.72);
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

</style>
