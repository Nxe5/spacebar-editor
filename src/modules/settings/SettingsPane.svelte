<script lang="ts">
  import { get } from "svelte/store";
  import {
    settings,
    type ModelConfig,
    type ChatBackend,
    AGENT_LIMIT_BOUNDS,
    AGENT_COMPACTION_BOUNDS,
    compactionThresholdPercent,
    compactionThresholdFromPercent,
    AUTOCOMPLETE_BOUNDS,
  } from "$lib/stores/settings";
  import {
    fetchAnthropicModelCatalog,
    fetchDeepseekModelCatalog,
  } from "$lib/cloudModelCatalog";
  import { buildCompactionModelOptions } from "$lib/compactionModel";
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
  import SystemPromptsManager from "$lib/components/SystemPromptsManager.svelte";
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
  import {
    DEFAULT_TAB_UNIFORM_WIDTH_PX,
    TAB_UNIFORM_WIDTH_MAX,
    TAB_UNIFORM_WIDTH_MIN,
    normalizeUniformTabWidthPx,
  } from "$lib/editor/tabWidth";
  import { explorerAppearance } from "$lib/stores/explorerAppearance";
  import { chatAppearance } from "$lib/stores/chatAppearance";
  import {
    EXPLORER_COLOR_FIELDS,
    EXPLORER_SIZE_FIELDS,
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
    | "general"
    | "providers-ollama"
    | "providers-llamacpp"
    | "providers-anthropic"
    | "providers-deepseek"
    | "tools"
    | "experimental-compaction"
    | "experimental-autocomplete"
    | "appearance-editor"
    | "appearance-syntax"
    | "appearance-explorer"
    | "appearance-chat"
    | "keybindings";

  const backendToSection: Record<ChatBackend, Section> = {
    ollama: "providers-ollama",
    llamacpp: "providers-llamacpp",
    anthropic: "providers-anthropic",
    deepseek: "providers-deepseek",
  };

  let activeSection = $state<Section>("providers-ollama");

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
  }

  let anthropicKey = $state("");
  let deepseekKey = $state("");
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
  let editorUniformTabWidth = $state(false);
  let editorUniformTabWidthPx = $state(96);
  let explorerColors = $state<ExplorerAppearanceMap>(explorerAppearance.get());
  let chatColors = $state<ChatAppearanceMap>(chatAppearance.get());
  let autoCompact = $state(false);
  let compactEnabled = $state(false);
  let useActiveChatModel = $state(true);
  let compactThresholdPct = $state(85);
  let compactKeepRecent = $state(6);
  let compactionModelChoice = $state("");
  let autocompleteEnabled = $state(false);
  let autocompleteDebounceMs = $state(300);

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
    { id: "providers-ollama", label: "Ollama", group: "Providers" },
    { id: "providers-llamacpp", label: "llama.cpp", group: "Providers" },
    { id: "providers-anthropic", label: "Anthropic", group: "Providers" },
    { id: "providers-deepseek", label: "DeepSeek", group: "Providers" },
    { id: "tools", label: "Tools" },
    { id: "experimental-compaction", label: "Compaction", group: "Experimental", experimental: true },
    { id: "experimental-autocomplete", label: "Autocomplete", group: "Experimental", experimental: true },
    { id: "appearance-editor", label: "Editor", group: "Appearance" },
    { id: "appearance-syntax", label: "Syntax", group: "Appearance" },
    { id: "appearance-explorer", label: "Explorer", group: "Appearance" },
    { id: "appearance-chat", label: "Chat activity", group: "Appearance" },
    { id: "keybindings", label: "Keybindings" },
  ];


  let activeChatModelLabel = $derived.by(() => {
    const st = $settings;
    if (st.chatBackend === "ollama") {
      return st.ollamaModels.find((m) => m.id === st.selectedModel)?.name ?? st.selectedModel;
    }
    if (st.chatBackend === "llamacpp") {
      return st.llamacppModels.find((m) => m.id === st.selectedModel)?.name ?? st.selectedModel;
    }
    if (st.chatBackend === "deepseek") {
      return st.deepseekModels.find((m) => m.id === st.selectedModel)?.name ?? "DeepSeek";
    }
    if (st.chatBackend === "anthropic") {
      return st.anthropicModels.find((m) => m.id === st.selectedModel)?.name ?? "Anthropic";
    }
    return st.selectedModel;
  });

  let compactionModelOptions = $derived.by(() =>
    buildCompactionModelOptions({
      ollamaModels: $settings.ollamaModels,
      llamacppModels: $settings.llamacppModels,
      anthropicModels: $settings.anthropicModels,
      deepseekModels: $settings.deepseekModels,
    })
  );

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
    editorUniformTabWidth = $settings.editor.uniformTabWidth;
    editorUniformTabWidthPx = $settings.editor.uniformTabWidthPx;
    explorerColors = { ...explorerAppearance.get() };
    chatColors = { ...chatAppearance.get() };
    autoCompact = $settings.agentCompaction.autoCompact;
    compactEnabled = $settings.agentCompaction.enabled;
    useActiveChatModel = $settings.agentCompaction.useActiveChatModel;
    compactThresholdPct = compactionThresholdPercent($settings.agentCompaction.compactThreshold);
    compactKeepRecent = $settings.agentCompaction.compactKeepRecentTurns;
    compactionModelChoice = $settings.modelRoles.compaction ?? "";
    autocompleteEnabled = $settings.autocomplete.enabled;
    autocompleteDebounceMs = $settings.autocomplete.debounceMs;
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

  function persistAgentCompaction() {
    settings.setAgentCompaction({
      enabled: compactEnabled,
      autoCompact,
      useActiveChatModel,
      compactThreshold: compactionThresholdFromPercent(compactThresholdPct),
      compactKeepRecentTurns: compactKeepRecent,
    });
    if (useActiveChatModel) {
      settings.setModelRoles({ compaction: null });
      compactionModelChoice = "";
    }
    const saved = get(settings).agentCompaction;
    compactEnabled = saved.enabled;
    autoCompact = saved.autoCompact;
    useActiveChatModel = saved.useActiveChatModel;
    compactThresholdPct = compactionThresholdPercent(saved.compactThreshold);
    compactKeepRecent = saved.compactKeepRecentTurns;
    if (useActiveChatModel) {
      compactionModelChoice = "";
    }
  }

  function persistUseActiveChatModel() {
    if (useActiveChatModel) {
      compactionModelChoice = "";
    }
    persistAgentCompaction();
  }

  function persistCompactionModel() {
    settings.setModelRoles({
      compaction: compactionModelChoice.trim() || null,
    });
    if (compactionModelChoice.trim()) {
      useActiveChatModel = false;
      settings.setAgentCompaction({ useActiveChatModel: false });
    }
    compactionModelChoice = get(settings).modelRoles.compaction ?? "";
    useActiveChatModel = get(settings).agentCompaction.useActiveChatModel;
  }

  function persistAutocompleteSettings() {
    settings.setAutocompleteSettings({
      enabled: autocompleteEnabled,
      debounceMs: autocompleteDebounceMs,
    });
    const saved = get(settings).autocomplete;
    autocompleteEnabled = saved.enabled;
    autocompleteDebounceMs = saved.debounceMs;
  }

  function persistHeaderTabWidthPx() {
    const px = normalizeUniformTabWidthPx(editorUniformTabWidthPx);
    editorUniformTabWidthPx = px;
    settings.setEditorSettings({ uniformTabWidthPx: px });
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
    settings.setApiKey("deepseek", deepseekKey);
    settings.setApiKey("openai", openaiKey);
    settings.setOllamaEndpoint(ollamaEndpoint);
    settings.setOllamaApiKey(ollamaApiKey);
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
      uniformTabWidth: editorUniformTabWidth,
      uniformTabWidthPx: normalizeUniformTabWidthPx(editorUniformTabWidthPx),
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

{#snippet modelPickerGrid(models: ModelConfig[], onToggle: (modelId: string, show: boolean) => void)}
  <div class="model-picker-cards">
    {#each models as model (model.id)}
      <label class="model-picker-card" class:model-picker-card--hidden={model.showInPicker === false}>
        <input
          type="checkbox"
          class="checkbox"
          checked={model.showInPicker !== false}
          aria-label="Show {model.name} in chat model menu"
          onchange={(e) => onToggle(model.id, (e.currentTarget as HTMLInputElement).checked)}
        />
        <span class="model-picker-card-body">
          <span class="model-picker-card-name" title={model.name}>{model.name}</span>
          {#if model.contextWindow}
            <span class="model-list-meta">{fmtCtx(model.contextWindow)} ctx</span>
          {/if}
        </span>
      </label>
    {/each}
  </div>
{/snippet}

{#snippet llamacppModelGrid(models: ModelConfig[], loadedModelId: string | null)}
  <div class="model-picker-cards">
    {#each models as model (model.id)}
      <div
        class="model-picker-card model-picker-card--readonly"
        class:model-picker-card--loaded={loadedModelId != null && model.id === loadedModelId}
      >
        <span class="model-picker-card-body">
          <span class="model-picker-card-name" title={model.name}>{model.name}</span>
          {#if model.contextWindow}
            <span class="model-list-meta">{fmtCtx(model.contextWindow)} ctx</span>
          {/if}
          {#if loadedModelId != null && model.id === loadedModelId}
            <span class="model-list-meta model-list-meta--loaded">Loaded on server</span>
          {/if}
        </span>
      </div>
    {/each}
  </div>
{/snippet}

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
          <div class="stack">
            <h3 class="provider-page-title">General</h3>
            <p class="note">
              Editor, chat, explorer, theme, and icon options. Changes preview live where noted.
            </p>

            <p class="group-label">Editor</p>
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
                onchange={() => settings.setEditorSettings({ formatOnSave: editorFormatOnSave })}
              />
              <span class="name">Format on save (Prettier)</span>
            </label>
            <label class="field">
              <span class="name">Header tab width</span>
              <span class="syntax-color-hint">{TAB_UNIFORM_WIDTH_MIN}–{TAB_UNIFORM_WIDTH_MAX} px</span>
              <input
                type="number"
                class="input tab-width-input"
                min={TAB_UNIFORM_WIDTH_MIN}
                max={TAB_UNIFORM_WIDTH_MAX}
                step="4"
                bind:value={editorUniformTabWidthPx}
                onchange={persistHeaderTabWidthPx}
              />
            </label>
            <label class="field checkbox-field">
              <input
                type="checkbox"
                bind:checked={editorUniformTabWidth}
                onchange={() =>
                  settings.setEditorSettings({
                    uniformTabWidth: editorUniformTabWidth,
                    uniformTabWidthPx: normalizeUniformTabWidthPx(editorUniformTabWidthPx),
                  })}
              />
              <span class="name">Uniform tab width in header</span>
            </label>
            <p class="note muted">
              Default {DEFAULT_TAB_UNIFORM_WIDTH_PX} px. With uniform on, chat and workbench tabs use this
              width; off, tabs size to their titles. Scroll the tab row with the mouse wheel.
            </p>
            <p class="note muted">
              Manual format:
              <kbd class="inline-code">Shift</kbd>+<kbd class="inline-code">Alt</kbd>+<kbd class="inline-code">F</kbd>
              or the Prettier icon in the status bar.
            </p>

            <p class="group-label">Chat</p>
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

            <p class="group-label">System prompts</p>
            <p class="note muted">
              Per-project files in <code class="inline-code">.tinyllama/prompts/</code>. Enable prompts
              to append them to the active chat mode. Edit files in the main editor.
            </p>
            <SystemPromptsManager variant="settings" />

            <p class="group-label">Explorer</p>
            {#each EXPLORER_SIZE_FIELDS as field}
              <label class="field">
                <span class="name">{field.label}</span>
                <span class="syntax-color-hint">{field.hint}</span>
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
              </label>
            {/each}

            <p class="group-label">Theme</p>
            <p class="note muted">
              Workbench colors — editor background, sidebar, tabs, status bar, and terminal.
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

            <p class="group-label">Icons</p>
            <p class="note muted">
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
            {#if ollamaModels.length > 0}
              {@render modelPickerGrid(ollamaModels, toggleOllamaPicker)}
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
              Models reported by the running server. Only the loaded GGUF is usable for chat; visibility
              in the chat menu is not configurable.
            </p>
            {#if llamacppModels.length > 0}
              {@render llamacppModelGrid(llamacppModels, llamacppLoadedModelId)}
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
              <span class="hint">Required for Claude models</span>
              <input
                type="password"
                bind:value={anthropicKey}
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
              {@render modelPickerGrid(anthropicModels, toggleAnthropicPicker)}

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
              <span class="hint">Required for DeepSeek Chat and Reasoner</span>
              <input
                type="password"
                bind:value={deepseekKey}
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
              {@render modelPickerGrid(deepseekModels, toggleDeepseekPicker)}

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
          <div class="stack">
            <p class="group-label">Agent limits</p>
            <p class="note">
              Optional caps for Plan and Agent modes on a single user message.
              <strong>0 = unlimited</strong> (default). The agent loop otherwise stops when the
              model finishes or the <strong>context budget</strong> for the active model is full
              (see context meter in chat). Compaction options are under
              <button type="button" class="linkish" onclick={() => (activeSection = "experimental-compaction")}>
                Experimental → Compaction
              </button>.
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

        {:else if activeSection === "experimental-compaction"}
          <div class="stack">
            <div class="provider-page-head">
              <h3 class="provider-page-title">Compaction</h3>
              <span class="experimental-pill">Experimental</span>
            </div>
            <p class="note">
              Summarize-and-rehydrate long chat sessions when context fills up (spec 21). Enable
              compaction first, then choose manual-only or automatic behavior.
            </p>

            <label class="field checkbox-field">
              <input
                type="checkbox"
                bind:checked={compactEnabled}
                onchange={persistAgentCompaction}
              />
              <span class="name">Enable compaction</span>
            </label>
            <p class="note muted">
              When off, the chat footer Compact button and automatic compaction are disabled.
            </p>

            {#if compactEnabled}
            <p class="group-label">Compaction model</p>
            <label class="field checkbox-field">
              <input
                type="checkbox"
                bind:checked={useActiveChatModel}
                onchange={persistUseActiveChatModel}
              />
              <span class="name">Use active chat model</span>
            </label>
            {#if useActiveChatModel}
              <p class="note muted">Summaries use <strong>{activeChatModelLabel}</strong>.</p>
            {:else}
              <label class="field">
                <span class="name">Compaction model</span>
                <select
                  class="input"
                  bind:value={compactionModelChoice}
                  onchange={persistCompactionModel}
                >
                  <option value="" disabled>Select a model…</option>
                  {#each compactionModelOptions as opt (opt.value)}
                    <option value={opt.value}>{opt.label}</option>
                  {/each}
                </select>
                <span class="hint">
                  Pick a model from any connected provider — useful for a cheaper or faster
                  summarizer.
                </span>
              </label>
            {/if}

            <p class="group-label">Automatic compaction</p>
            <label class="field checkbox-field">
              <input
                type="checkbox"
                bind:checked={autoCompact}
                onchange={persistAgentCompaction}
              />
              <span class="name">Enable automatic compaction</span>
            </label>
            <p class="note muted">
              When off, compact only from the chat footer button. Manual compact is always available
              while compaction is enabled.
            </p>

            <label class="field" class:field--disabled={!autoCompact}>
              <span class="name">Auto-compact when context reaches</span>
              <div class="threshold-row">
                <input
                  type="number"
                  class="input threshold-input"
                  min={compactionThresholdPercent(AGENT_COMPACTION_BOUNDS.compactThreshold.min)}
                  max={compactionThresholdPercent(AGENT_COMPACTION_BOUNDS.compactThreshold.max)}
                  bind:value={compactThresholdPct}
                  disabled={!autoCompact}
                  onchange={persistAgentCompaction}
                />
                <span class="threshold-suffix">% of model window</span>
              </div>
              <span class="hint">Range 50–95. Default 85 leaves headroom for the summary call.</span>
            </label>

            <label class="field">
              <span class="name">Keep last messages after compacting</span>
              <input
                type="number"
                class="input"
                min={AGENT_COMPACTION_BOUNDS.compactKeepRecentTurns.min}
                max={AGENT_COMPACTION_BOUNDS.compactKeepRecentTurns.max}
                bind:value={compactKeepRecent}
                onchange={persistAgentCompaction}
              />
              <span class="hint">
                Raw messages preserved after the summary (default 6, max {AGENT_COMPACTION_BOUNDS.compactKeepRecentTurns.max}).
              </span>
            </label>
            {/if}
          </div>

        {:else if activeSection === "experimental-autocomplete"}
          <div class="stack">
            <div class="provider-page-head">
              <h3 class="provider-page-title">Autocomplete</h3>
              <span class="experimental-pill">Experimental</span>
            </div>
            <p class="note">
              Inline code completions while you type. Not implemented yet — options are saved for when
              the feature lands.
            </p>

            <label class="field checkbox-field">
              <input
                type="checkbox"
                bind:checked={autocompleteEnabled}
                disabled
                onchange={persistAutocompleteSettings}
              />
              <span class="name">Enable inline autocomplete</span>
            </label>
            <p class="note muted">Coming soon — checkbox is disabled until the feature exists.</p>

            <label class="field">
              <span class="name">Debounce before requesting</span>
              <input
                type="number"
                class="input"
                min={AUTOCOMPLETE_BOUNDS.debounceMs.min}
                max={AUTOCOMPLETE_BOUNDS.debounceMs.max}
                bind:value={autocompleteDebounceMs}
                disabled
                onchange={persistAutocompleteSettings}
              />
              <span class="hint">Milliseconds to wait after you stop typing (100–2000).</span>
            </label>

            <p class="group-label">Model for autocomplete</p>
            <label class="field">
              <span class="name">Autocomplete model</span>
              <select class="input" disabled title="Not wired yet — uses active chat model">
                <option value="">{activeChatModelLabel} (active chat model)</option>
              </select>
              <span class="hint">A fast local model may be recommended when this ships.</span>
            </label>
          </div>

        {:else if activeSection === "appearance-editor"}
          <div class="stack">
            <h3 class="provider-page-title">Editor</h3>
            <p class="note">
              Editor chrome colors. Theme, icons, wrap, tab width, and Prettier are under
              <button type="button" class="linkish" onclick={() => selectSettingsSection("general")}>
                General
              </button>.
              Syntax token colors are under
              <button type="button" class="linkish" onclick={() => (activeSection = "appearance-syntax")}>
                Syntax
              </button>.
              Changing the workbench theme in General updates color pickers below (save to keep).
            </p>
            <p class="note muted">
              Wrap, tab width, Prettier, and related options are under
              <button type="button" class="linkish" onclick={() => selectSettingsSection("general")}>
                General
              </button>.
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

        {:else if activeSection === "appearance-explorer"}
          <div class="stack">
            <h3 class="provider-page-title">Explorer</h3>
            <p class="note">
              File tree selection and git status colors. Label and icon sizes are under
              <button type="button" class="linkish" onclick={() => (activeSection = "general")}>
                General
              </button>.
              Changes preview live; click Save to keep them.
            </p>
            {#each EXPLORER_COLOR_FIELDS as field}
              <label class="field syntax-color-field">
                <span class="name">{field.label}</span>
                <span class="syntax-color-hint">{field.hint}</span>
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
              Agent feed colors for thoughts, tools, and badges. The waiting indicator style is under
              <button type="button" class="linkish" onclick={() => (activeSection = "general")}>
                General
              </button>.
              Changes preview live; click Save to keep them.
            </p>
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

  .experimental-pill {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #c9a227;
    padding: 2px 8px;
    border-radius: 4px;
    background: rgba(201, 162, 39, 0.12);
  }

  .threshold-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .threshold-input {
    width: 4.5rem;
  }

  .tab-width-input {
    width: 4.5rem;
  }

  .threshold-suffix {
    font-size: 12px;
    color: #a3a3a3;
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

  .field--disabled {
    opacity: 0.55;
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

  .model-picker-cards {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }

  .model-picker-card {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    min-width: 0;
    padding: 6px 8px;
    background: #1c1c1c;
    border: 1px solid #333;
    border-radius: 6px;
    cursor: pointer;
  }

  .model-picker-card--hidden {
    opacity: 0.55;
  }

  .model-picker-card--readonly {
    cursor: default;
    padding: 6px 10px;
  }

  .model-picker-card--loaded {
    border-color: color-mix(in srgb, var(--primary, #007acc) 55%, #333);
    background: color-mix(in srgb, var(--primary, #007acc) 8%, #1c1c1c);
  }

  .model-list-meta--loaded {
    color: #7eb8e8;
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

  .model-picker-card .checkbox {
    flex-shrink: 0;
    margin: 1px 0 0;
  }

  .model-picker-card-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .model-picker-card-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    line-height: 1.3;
    color: #86c9b7;
  }

  .model-picker-card:hover .model-picker-card-name {
    color: #a8e6d4;
  }

  @media (max-width: 720px) {
    .model-picker-cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 480px) {
    .model-picker-cards {
      grid-template-columns: minmax(0, 1fr);
    }
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

  .model-list-name {
    font-size: 11px;
    font-family: ui-monospace, monospace;
    color: #86c9b7;
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
