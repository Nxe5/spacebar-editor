<script lang="ts">
  import { get } from "svelte/store";
  import { toast } from "svelte-sonner";
  import { chat, activeSession } from "$lib/stores/chat";
  import { settings, type ModelConfig, type SettingsState } from "$lib/stores/settings";
  import {
    fetchAnthropicModelCatalog,
    fetchDeepseekModelCatalog,
    fetchGlmModelCatalog,
    fetchKimiModelCatalog,
  } from "$lib/cloudModelCatalog";
  import { mergeCloudModelCatalog, modelsVisibleInPicker } from "$lib/modelPicker";
  import {
    cloudProviderMenuReady,
    ollamaProviderMenuReady,
  } from "$lib/chatModelMenu";
  import {
    toolPolicy as toolPolicyStore,
    effectiveToolPolicy,
    reloadProjectTools,
  } from "$lib/stores/toolPolicy";
  import { currentMode, MODE_CONFIG, type ChatMode } from "$lib/stores/mode";
  import { activeSystemPromptText, systemPrompts } from "$lib/stores/systemPrompts";
  import { promptFilePath } from "$lib/systemPrompts/config";
  import { files } from "$lib/stores/files";
  import { workbench, activeWorkbenchTab, activeEditorFile } from "$lib/stores/workbench";
  import { skills } from "$lib/stores/skills";
  import { buildActiveSkillBlocks } from "$lib/skills/activeSkills";
  import type { VariableContext } from "$lib/skills/skillVariables";
  import {
    gitCurrentBranch,
    pathExists,
    readFile,
    listDir,
    grepWorkspace,
    getLanguageFromPath,
    listenFileDrag,
    openExternalUrl,
  } from "$lib/ipc";
  import FileIcon from "$lib/components/FileIcon.svelte";
  import { cloudApiKeysForStream } from "$lib/apiSecrets";
  import {
    nestedScaffoldNoticeMessage,
    shouldFlagNestedScaffold,
    topLevelDirFromWritePath,
    topLevelDirsFromShellCommand,
  } from "$lib/agent/nestedScaffoldNotice";
  import { resolveWorkspacePath } from "$lib/tools/pathUtils";
  import { normalizeFilePath } from "$lib/fsPath";
  import {
    countTokens,
    estimateChatContextTokens,
    estimateInflightContextTokens,
  } from "$lib/chatContext";
  import {
    resolveComposerChromeState,
    type ComposerChromeState,
  } from "$lib/chat/composerChrome";
  import { contextAppearance } from "$lib/stores/contextAppearance";
  import { getContextSectionColor } from "$lib/chat/contextAppearance";
  import {
    fetchOllamaModelList,
    RECOMMENDED_OLLAMA_MODELS,
    pickContextOption,
    contextOptionsUpTo,
  } from "$lib/ollamaClient";
  import { onMount, onDestroy } from "svelte";
  import { floatingPanel, portal } from "$lib/actions/floatingPanel";
  import { isTauriAvailable } from "$lib/ipc";
  import { workspaceReadOnly } from "$lib/workspace";
  import {
    buildProviderMessages,
    appendAssistantToolCalls,
    appendToolResults,
  } from "$lib/agent/conversation";
  import { streamOneTurn, resolveStreamCredentials } from "$lib/agent/streamTurn";
  import { inferenceOptionsForSettings } from "$lib/inferenceOptions";
  import { assembleSystemPrompt } from "$lib/agent/systemPrompt/assemble";
  import { resolveActiveModelSettings, usesNativeToolCalls } from "$lib/modelSettings";
  import { resolveReadFileMaxLines } from "$lib/readFileCap";
  import {
    SYNTHESIS_NUDGE,
    shouldRunSynthesis,
    modelDeliveredSubstantiveReply,
  } from "$lib/agent/synthesis";
import {
  recoverToolCallsFromText,
  textLooksLikeFakeToolUse,
  findMalformedToolCallFragments,
  formatToolParseError,
} from "$lib/agent/textToolCalls";
  import { syncUiAfterFilesystemTool, openWorkspaceFile, openWorkspaceFileWithDiff } from "$lib/filesystemSync";
  import { openableFilePaths } from "$lib/agent/toolDisplay";
  import {
    createLiveTurn,
    groupAgentTurns,
    groupAgentTurnsForDisplay,
    parseToolInput,
    upsertLiveTool,
    type AgentTurnBlock,
  } from "$lib/agent/activity";
  import AgentActivityFeed from "$lib/components/AgentActivityFeed.svelte";
  import {
    applyFilesystemRewind,
    createCheckpointBeforeUserMessage,
    indexOfUserMessage,
    restoreWorkspaceAfterRewind,
  } from "$lib/agent/chatRewind";
  import type { StoredToolCall } from "$lib/stores/chat";
  import {
    getToolsForPolicy,
    getToolDescription,
    toolNeedsUserApproval,
    toolIsDenied,
    type ToolPolicyState,
  } from "$lib/toolPolicy";
  import { executeTool } from "$lib/tools/toolRunner";
  import {
    StallTracker,
    stallNudgeMessage,
  } from "$lib/agent/stallDetection";
  import {
    isReadOnlyTool,
    isToolRunCapReached,
    toolCountsTowardRunCap,
    perTurnToolCap,
    shouldContinueAgentStep,
    type AgentLimits,
  } from "$lib/agentLimits";
  import {
    contextBudgetLimit,
    contextBudgetStopMessage,
    contextUsageLevel,
    effectiveReserveTokens,
    estimateProviderMessagesTokens,
    isAgentContextBudgetExceeded,
    resolveModelContextWindow,
  } from "$lib/contextBudget";
  import {
    chatHasMessagesForCompaction,
    COMPACTION_SUCCESS_NOTICE,
    compactionThresholdPercent,
    MANUAL_COMPACTION_BUTTON_TITLE,
    MANUAL_COMPACTION_DISABLED_TITLE,
  } from "$lib/agentCompaction";
  import { compactChatSession, maybeAutoCompactBeforeTurn } from "$lib/agent/sessionCompaction";
  import { persistCurrentProjectState } from "$lib/projectState";
  import {
    chatFooterProfile,
    formatMonthlyUsageLabel,
    formatFooterBalanceLabel,
    footerUsageToggleTitle,
    contextBudgetTitle,
    cloudContextBudgetTitle,
    type FooterUsageView,
  } from "$lib/chatFooterProfile";
  import { providerUsage } from "$lib/stores/providerUsage";
  import { getCloudApiKey } from "$lib/apiSecrets";
  import {
    fetchDeepseekAccountBalance,
    type ProviderAccountBalance,
  } from "$lib/providerBalance";
  import AppIcon from "$lib/components/AppIcon.svelte";

  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import MessageCircle from "@lucide/svelte/icons/message-circle";
  import ListChecks from "@lucide/svelte/icons/list-checks";
  import Bot from "@lucide/svelte/icons/bot";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Settings from "@lucide/svelte/icons/settings";

  interface Props {
    onOpenSettings?: () => void;
  }

  let { onOpenSettings }: Props = $props();

  type BrowserSpeechResultEvent = {
    resultIndex: number;
    results: {
      length: number;
      [i: number]: { 0: { transcript: string }; isFinal: boolean };
    };
  };
  type BrowserSpeechRec = {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    maxAlternatives: number;
    start(): void;
    stop(): void;
    onresult: ((ev: BrowserSpeechResultEvent) => void) | null;
    onerror: (() => void) | null;
    onend: (() => void) | null;
  };

  let inputValue = $state("");
  let composerEl = $state<HTMLDivElement | undefined>(undefined);
  let userMessageExpanded = $state<Record<string, boolean>>({});
  let userMessageDraft = $state<Record<string, string>>({});
  /** User message being edited in history; main Send rewinds here first. */
  let editingUserMessageId = $state<string | null>(null);
  let rewindNotice = $state<string | null>(null);
  let compactionNotice = $state<string | null>(null);
  /** Set when the agent loop hits maxAgentSteps; cleared on Continue or Stop here. */
  let stepLimitNotice = $state<{ limit: number } | null>(null);
  let undoingLastTurn = $state(false);
  let compactionNoticeTimer: ReturnType<typeof setTimeout> | null = null;
  let compacting = $state(false);
  let messagesContainer: HTMLDivElement;
  let showBreakdown = $state(false);
  let contextPanelOpen = $state(false);
  let expandedSectionId = $state<string | null>(null);
  let archiveExpanded = $state(false);

  function expandUserMessage(id: string, content: string) {
    const wasExpanded = userMessageExpanded[id];
    if (wasExpanded) return;

    (document.activeElement as HTMLElement | null)?.blur?.();
    userMessageDraft = { ...userMessageDraft, [id]: content };
    userMessageExpanded = { [id]: true };
    editingUserMessageId = id;
    queueMicrotask(() => {
      document
        .querySelector<HTMLTextAreaElement>(`[data-user-edit-id="${id}"]`)
        ?.focus();
    });
  }

  function collapseAllHistoryEdits() {
    if (!Object.keys(userMessageExpanded).length && !editingUserMessageId) return;
    userMessageExpanded = {};
    editingUserMessageId = null;
    const active = document.activeElement;
    if (
      active instanceof HTMLTextAreaElement &&
      active.dataset.userEditId != null
    ) {
      active.blur();
    }
  }

  function collapseUserMessage(id: string) {
    if (!userMessageExpanded[id]) return;
    const next = { ...userMessageExpanded };
    delete next[id];
    userMessageExpanded = next;
    if (editingUserMessageId === id) editingUserMessageId = null;
    const active = document.activeElement;
    if (
      active instanceof HTMLTextAreaElement &&
      active.dataset.userEditId === id
    ) {
      active.blur();
    }
  }

  let thinkingOpen = $state<Record<string, boolean>>({});
  let liveTurn = $state<AgentTurnBlock | null>(null);

  function thoughtSectionKey(
    blockId: string,
    section: "thought" | "plan" | "response"
  ) {
    return `${blockId}:${section}`;
  }

  function toolSectionKey(blockId: string, toolId: string) {
    return `${blockId}:tool:${toolId}`;
  }

  function isToolOpen(blockId: string, toolId: string): boolean {
    return thinkingOpen[toolSectionKey(blockId, toolId)] === true;
  }

  function toggleTool(blockId: string, toolId: string) {
    const key = toolSectionKey(blockId, toolId);
    thinkingOpen = { ...thinkingOpen, [key]: !thinkingOpen[key] };
  }

  function toggleThoughtSection(blockId: string, section: "thought" | "plan") {
    const key = thoughtSectionKey(blockId, section);
    thinkingOpen = { ...thinkingOpen, [key]: !thinkingOpen[key] };
  }

  function isResponseOpen(blockId: string): boolean {
    const key = thoughtSectionKey(blockId, "response");
    return thinkingOpen[key] !== false;
  }

  function toggleResponseSection(blockId: string) {
    const key = thoughtSectionKey(blockId, "response");
    thinkingOpen = { ...thinkingOpen, [key]: !isResponseOpen(blockId) };
  }

  function patchLiveTurn(patch: (turn: AgentTurnBlock) => AgentTurnBlock) {
    if (!liveTurn) return;
    liveTurn = patch(liveTurn);
  }

  async function openToolFile(path: string) {
    await openWorkspaceFile(path);
  }

  async function openToolFileDiff(relPath: string, diffBase: string) {
    const ws = get(files).workspacePath;
    if (!ws?.trim()) return;
    try {
      const abs = resolveWorkspacePath(ws, relPath);
      await openWorkspaceFileWithDiff(abs, diffBase);
    } catch {
      /* ignore bad paths */
    }
  }

  async function captureFileDiffBefore(
    toolName: string,
    args: Record<string, unknown>,
    workspacePath: string
  ): Promise<string | undefined> {
    if (toolName !== "write_file" && toolName !== "create_file") return undefined;
    const path = typeof args.path === "string" ? args.path.trim() : "";
    if (!path) return undefined;
    if (toolName === "create_file") return "";
    try {
      const resolved = resolveWorkspacePath(workspacePath, path);
      if (!(await pathExists(workspacePath, resolved))) return "";
      return await readFile(null, resolved);
    } catch {
      return "";
    }
  }

  let composerFocused = $state(false);
  let userMessageFocusId = $state<string | null>(null);
  let composerChromeState = $derived(
    resolveComposerChromeState($chat.isStreaming, composerFocused)
  );

  function userMessageChromeState(expanded: boolean, messageId: string): ComposerChromeState {
    if (!expanded) return "idle";
    return resolveComposerChromeState($chat.isStreaming, userMessageFocusId === messageId);
  }

  let streamingContent = $state("");
  let streamWallStartMs = 0;
  let streamFirstTokenAt = 0;
  let lastTokPerSec = $state<number | null>(null);
  type LastReplyMetrics = {
    outputTokens: number;
    durationSec: number;
    tokPerSec: number;
  };
  let lastReplyMetrics = $state<LastReplyMetrics | null>(null);
  let usageRecordedForStream = false;
  let prevActiveSessionForTok = $state<string | null>(null);

  let pendingToolApproval = $state<{ id: string; tool: string; input: unknown } | null>(null);
  let toolApprovalMenuOpen = $state(false);
  let toolApprovalMenuAnchorEl: HTMLDivElement | undefined = $state();
  type ToolApprovalDecision = "allow" | "deny" | "allow_always";
  let toolApprovalChoice = $state<ToolApprovalDecision>("allow");
  let abortController: AbortController | null = null;

  let modelMenuOpen = $state(false);
  let modelMenuAnchorEl: HTMLDivElement | undefined = $state();
  let modelMenuPopupEl: HTMLDivElement | undefined = $state();
  let modeMenuOpen = $state(false);
  let modeMenuAnchorEl: HTMLDivElement | undefined = $state();
  let contextBudgetMenuOpen = $state(false);
  let contextBudgetMenuEl: HTMLDivElement | undefined = $state();
  let footerUsageView = $state<FooterUsageView>("tokens");
  let footerBalance = $state<ProviderAccountBalance | null>(null);
  let footerBalanceError = $state<string | null>(null);
  let footerBalanceLoading = $state(false);
  let footerBalanceKey = $state<string | null>(null);
  let attachInputEl = $state<HTMLInputElement | undefined>(undefined);
  let chatDropActive = $state(false);
  let chatDropCounter = 0;
  let chatRootEl = $state<HTMLDivElement | undefined>(undefined);
  let unlistenFileDrag: (() => void) | null = null;

  type PendingAttachment =
    | { kind: "browser-file"; name: string; file: File }
    | { kind: "dir-entry"; name: string; entry: FileSystemDirectoryEntry }
    | { kind: "abs-path"; name: string; path: string; isDir?: boolean }
    | { kind: "element"; name: string; text: string };

  let pendingAttachments = $state<PendingAttachment[]>([]);
  let speechListening = $state(false);
  let speechRec: BrowserSpeechRec | null = null;
  let ollamaCatalogStatus = $state<"idle" | "ok" | "fail">("idle");

  type OllamaMenuRow = { id: string; name: string };

  function buildMenuRows(installed: ModelConfig[]): OllamaMenuRow[] {
    return [...installed]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((m) => ({ id: m.id, name: m.name }));
  }

  let ollamaMenuRows = $derived.by(() => {
    return buildMenuRows(modelsVisibleInPicker($settings.ollamaModels));
  });

  let anthropicMenuRows = $derived(
    buildMenuRows(modelsVisibleInPicker($settings.anthropicModels))
  );

  let deepseekMenuRows = $derived(
    buildMenuRows(modelsVisibleInPicker($settings.deepseekModels))
  );

  let glmMenuRows = $derived(buildMenuRows(modelsVisibleInPicker($settings.glmModels)));

  let kimiMenuRows = $derived(buildMenuRows(modelsVisibleInPicker($settings.kimiModels)));

  let showOllamaInModelMenu = $derived(
    ollamaProviderMenuReady(ollamaCatalogStatus === "ok", $settings.ollamaModels)
  );

  let showAnthropicInModelMenu = $derived(
    cloudProviderMenuReady(
      $settings.apiKeys.anthropic,
      $settings.anthropicModels,
      $settings.anthropicCatalogFetched
    )
  );

  let showDeepseekInModelMenu = $derived(
    cloudProviderMenuReady(
      $settings.apiKeys.deepseek,
      $settings.deepseekModels,
      $settings.deepseekCatalogFetched
    )
  );

  let showGlmInModelMenu = $derived(
    cloudProviderMenuReady(
      $settings.apiKeys.glm,
      $settings.glmModels,
      $settings.glmCatalogFetched
    )
  );

  let showKimiInModelMenu = $derived(
    cloudProviderMenuReady(
      $settings.apiKeys.kimi,
      $settings.kimiModels,
      $settings.kimiCatalogFetched
    )
  );

  let ollamaChatReady = $derived(
    $settings.chatBackend !== "ollama" ||
      (showOllamaInModelMenu && $settings.ollamaModels.some((m) => m.id === $settings.selectedModel))
  );

  function anthropicModelCap(): number {
    const m = $settings.anthropicModels.find(
      (x) => x.id === $settings.selectedModel && x.provider === "anthropic"
    );
    return m?.contextWindow ?? 128000;
  }

  function deepseekModelCap(): number {
    const m = $settings.deepseekModels.find(
      (x) => x.id === $settings.selectedModel && x.provider === "deepseek"
    );
    return m?.contextWindow ?? 65536;
  }

  function glmModelCap(): number {
    const m = $settings.glmModels.find(
      (x) => x.id === $settings.selectedModel && x.provider === "glm"
    );
    return m?.contextWindow ?? 128000;
  }

  function kimiModelCap(): number {
    const m = $settings.kimiModels.find(
      (x) => x.id === $settings.selectedModel && x.provider === "kimi"
    );
    return m?.contextWindow ?? 262144;
  }

  function contextBudgetCeiling(): number {
    if ($settings.chatBackend === "ollama") {
      const row = $settings.ollamaModels.find((m) => m.id === $settings.selectedModel);
      const rec = RECOMMENDED_OLLAMA_MODELS.find((r) => r.id === $settings.selectedModel);
      return (
        row?.contextLimitMax ??
        row?.contextWindow ??
        rec?.contextLimitMax ??
        rec?.contextWindow ??
        8192
      );
    }
    if ($settings.chatBackend === "llamacpp") {
      return $settings.llamacppModels.find((x) => x.id === $settings.selectedModel)?.contextWindow ?? 8192;
    }
    if ($settings.chatBackend === "deepseek") {
      return deepseekModelCap();
    }
    if ($settings.chatBackend === "glm") {
      return glmModelCap();
    }
    if ($settings.chatBackend === "kimi") {
      return kimiModelCap();
    }
    return anthropicModelCap();
  }

  let contextBudgetOptions = $derived(() => contextOptionsUpTo(contextBudgetCeiling()));

  let maxContextTokens = $derived(() =>
    resolveModelContextWindow({
      chatBackend: $settings.chatBackend,
      selectedModel: $settings.selectedModel,
      ollamaModels: $settings.ollamaModels,
      llamacppModels: $settings.llamacppModels,
      anthropicModels: $settings.anthropicModels,
      deepseekModels: $settings.deepseekModels,
      glmModels: $settings.glmModels,
      kimiModels: $settings.kimiModels,
      anthropicContextBudget: $settings.anthropicContextBudget,
    })
  );

  let modelTriggerLabel = $derived(
    $settings.chatBackend === "ollama"
      ? ollamaCatalogStatus === "fail"
        ? "Unavailable"
        : ($settings.ollamaModels.find((x) => x.id === $settings.selectedModel)?.name ??
            (ollamaCatalogStatus === "ok" ? "Unavailable" : "…"))
      : $settings.chatBackend === "llamacpp"
        ? ($settings.llamacppModels.find((x) => x.id === $settings.selectedModel)?.name ??
            $settings.selectedModel)
        : $settings.chatBackend === "deepseek"
          ? ($settings.deepseekModels.find((x) => x.id === $settings.selectedModel)?.name ??
              "DeepSeek")
          : $settings.chatBackend === "glm"
            ? ($settings.glmModels.find((x) => x.id === $settings.selectedModel)?.name ?? "GLM")
            : $settings.chatBackend === "kimi"
              ? ($settings.kimiModels.find((x) => x.id === $settings.selectedModel)?.name ?? "Kimi")
              : ($settings.anthropicModels.find((x) => x.id === $settings.selectedModel)?.name ??
                  "Anthropic")
  );

  // --- Skills (spec 30 §5, §10) -------------------------------------------
  /** Git branch cached per workspace for skill variable interpolation. */
  let cachedGitBranch = $state<string | null>(null);
  $effect(() => {
    const ws = $files.workspacePath;
    if (!ws || !isTauriAvailable()) {
      cachedGitBranch = null;
      return;
    }
    void gitCurrentBranch(ws)
      .then((b) => { cachedGitBranch = b; })
      .catch(() => { cachedGitBranch = null; });
  });

  function relToWorkspace(p: string, ws: string | null): string {
    if (!ws) return normalizeFilePath(p);
    const root = normalizeFilePath(ws).replace(/\/$/, "");
    const np = normalizeFilePath(p);
    return np.startsWith(`${root}/`) ? np.slice(root.length + 1) : np;
  }

  let skillVariableContext = $derived((): VariableContext => {
    const ws = $files.workspacePath;
    const activeTab = $activeWorkbenchTab;
    const editorTabs = $workbench.tabs.filter(
      (t): t is Extract<typeof t, { kind: "editor"; path: string }> => t.kind === "editor"
    );
    return {
      workspacePath: ws,
      activeFilePath:
        activeTab?.kind === "editor" ? relToWorkspace(activeTab.path, ws) : null,
      activeFileContents: $activeEditorFile?.content ?? null,
      openFilePaths: editorTabs.map((t) => relToWorkspace(t.path, ws)),
      gitBranch: cachedGitBranch,
      fileTree: null,
      today: new Date().toISOString().slice(0, 10),
      projectType: null,
    };
  });

  let activeSkillBlocks = $derived(() =>
    buildActiveSkillBlocks($skills, $currentMode, skillVariableContext())
  );

  /** System prompt sections + tool schema tokens — recomputed only when settings/mode change. */
  let systemBreakdown = $derived(() => {
    const st = $settings;
    const mode = $currentMode;
    const modeConfig = MODE_CONFIG[mode];
    const toolObjects = getToolsForPolicy($effectiveToolPolicy, modeConfig.tools);
    const modelSettings = resolveActiveModelSettings(st);
    const { sections } = assembleSystemPrompt({
      mode,
      workspacePath: $files.workspacePath,
      includeWorkspaceInChat: st.includeWorkspaceInChat,
      userPromptText: $activeSystemPromptText,
      toolsEnabled: toolObjects.length > 0,
      modelSettings,
      skillBlocks: activeSkillBlocks(),
    });
    const toolSchemaTokens = usesNativeToolCalls(modelSettings) && toolObjects.length
      ? countTokens(JSON.stringify(toolObjects))
      : 0;
    return { sections, toolSchemaTokens };
  });

  /** Full context breakdown used by the segmented bar and hover popover. */
  let contextBreakdown = $derived(() => {
    const { sections, toolSchemaTokens } = systemBreakdown();
    const systemTokens = sections.reduce((sum, s) => sum + s.tokenEstimate, 0);
    const msgs = $activeSession?.messages ?? [];
    const historyTokens = estimateChatContextTokens(
      msgs.map((m) => ({
        role: m.role,
        content: m.content,
        thinking: m.thinking,
        rawToolCalls: m.rawToolCalls,
      }))
    );
    const lt = liveTurn;
    const inflightTokens =
      $chat.isStreaming && lt
        ? estimateInflightContextTokens({
            streamingContent,
            thinking: lt.thinking,
            planText: lt.planText,
            response: lt.response,
          })
        : $chat.isStreaming && streamingContent
          ? estimateInflightContextTokens({ streamingContent })
          : 0;
    const draft = inputValue.trim();
    const draftTokens = draft ? 4 + countTokens(draft) : 0;
    const contextWindow = maxContextTokens();
    const reserveTokens = effectiveReserveTokens(contextWindow);
    return {
      sections,
      systemTokens,
      toolSchemaTokens,
      historyTokens: historyTokens + inflightTokens + draftTokens,
      reserveTokens,
      contextWindow,
      total: systemTokens + toolSchemaTokens + historyTokens + inflightTokens + draftTokens,
    };
  });

  let contextUsed = $derived(() => contextBreakdown().total);

  let contextPct = $derived(() => {
    const { total, contextWindow } = contextBreakdown();
    return contextWindow > 0 ? Math.min(100, (total / contextWindow) * 100) : 0;
  });

  let usageLevel = $derived(() => {
    const { total, contextWindow } = contextBreakdown();
    return contextUsageLevel(total, contextBudgetLimit(contextWindow));
  });

  let overflowWarningDismissed = $state(false);
  let lastDismissedAtLevel = $state<"critical" | null>(null);
  $effect(() => {
    const level = usageLevel();
    if (level !== "critical") {
      lastDismissedAtLevel = null;
      overflowWarningDismissed = false;
    } else if (lastDismissedAtLevel !== "critical") {
      overflowWarningDismissed = false;
    }
  });

  let footerProfile = $derived(() => chatFooterProfile($settings.chatBackend));

  /** The last user message id that can be undone (only when agent is idle and chat has responses). */
  let lastUndoableUserMessageId = $derived(() => {
    if ($chat.isStreaming || editingUserMessageId) return null;
    const msgs = $activeSession?.messages ?? [];
    // Find the last user message that has at least one subsequent message
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i]?.role === "user") {
        // There must be something after it (assistant/tool response)
        if (i < msgs.length - 1) return msgs[i]!.id;
        break;
      }
    }
    return null;
  });

  let monthlyUsageLabel = $derived(() => {
    const profile = footerProfile();
    if (!profile.showMonthlyUsage) return "";
    const totals = $providerUsage.providers[profile.usageProviderId] ?? {
      inputTokens: 0,
      outputTokens: 0,
    };
    if (footerUsageView === "tokens") {
      return formatMonthlyUsageLabel(totals.inputTokens, totals.outputTokens);
    }
    const backend = $settings.chatBackend;
    if (backend !== "anthropic" && backend !== "deepseek" && backend !== "glm" && backend !== "kimi") {
      return formatMonthlyUsageLabel(totals.inputTokens, totals.outputTokens);
    }
    if (footerBalanceLoading) {
      return formatFooterBalanceLabel(null, backend, "loading");
    }
    return formatFooterBalanceLabel(footerBalance, backend, footerBalanceError);
  });

  let footerUsageTitle = $derived(() => {
    const backend = $settings.chatBackend;
    if (backend !== "anthropic" && backend !== "deepseek" && backend !== "glm" && backend !== "kimi") {
      return "Monthly API token usage (stored locally on this device)";
    }
    return footerUsageToggleTitle(footerUsageView, backend);
  });

  async function refreshFooterBalance(force = false) {
    const backend = get(settings).chatBackend;
    if (backend !== "deepseek") {
      footerBalance = null;
      footerBalanceError = null;
      footerBalanceKey = backend;
      return;
    }
    if (!force && footerBalanceKey === backend && footerBalance && !footerBalanceError) {
      return;
    }
    footerBalanceLoading = true;
    footerBalanceError = null;
    try {
      const apiKey = await getCloudApiKey("deepseek");
      footerBalance = await fetchDeepseekAccountBalance(apiKey);
      footerBalanceKey = backend;
    } catch (err) {
      footerBalance = null;
      footerBalanceError = err instanceof Error ? err.message : String(err);
      footerBalanceKey = backend;
    } finally {
      footerBalanceLoading = false;
    }
  }

  async function toggleFooterUsageView() {
    if (footerUsageView === "tokens") {
      footerUsageView = "balance";
      await refreshFooterBalance(true);
      return;
    }
    footerUsageView = "tokens";
  }

  $effect(() => {
    const backend = $settings.chatBackend;
    footerUsageView = "tokens";
    footerBalance = null;
    footerBalanceError = null;
    footerBalanceKey = null;
  });

  let footerAriaLabel = $derived(() => {
    const profile = footerProfile();
    if (profile.showMonthlyUsage) return "Chat context and monthly API usage";
    if (profile.contextHint === "server") return "Chat context (server-defined limit)";
    return "Estimated context from this chat";
  });

  let contextBarColors = $derived($contextAppearance);

  function getSectionColor(sectionId: string): string {
    return getContextSectionColor(sectionId, contextBarColors);
  }

  function getSectionFilePath(section: { id: string; label: string }): string | null {
    const ws = $files.workspacePath;
    if (!ws) return null;
    const skillEntry = $skills.entries.find((e) => e.title === section.label);
    if (skillEntry) return `${ws}/.sidebar/skills/${skillEntry.id}/skill.md`;
    if (section.id === "system-prompts") {
      const mode = $currentMode;
      const activePrompts = $systemPrompts.entries.filter(
        (e) => e.enabled && (e.modes.length === 0 || e.modes.includes(mode))
      );
      if (activePrompts.length === 1) return promptFilePath(ws, activePrompts[0].filename);
    }
    return null;
  }

  function getActivePromptFiles(): Array<{ filename: string; label: string; path: string }> {
    const ws = $files.workspacePath;
    if (!ws) return [];
    const mode = $currentMode;
    return $systemPrompts.entries
      .filter((e) => e.enabled && (e.modes.length === 0 || e.modes.includes(mode)))
      .map((e) => ({ filename: e.filename, label: e.label, path: promptFilePath(ws, e.filename) }));
  }

  async function openSectionFile(filePath: string): Promise<void> {
    await openWorkspaceFile(filePath);
  }

  function openBuiltinSection(sectionId: string, label: string, text: string): void {
    const ws = $files.workspacePath ?? "";
    const path = `${ws}/.sidebar/context/${sectionId}.md`;
    workbench.openEditorFile({
      path,
      name: label,
      content: text,
      isDirty: false,
      language: "markdown",
      pendingOnDisk: true,
    });
  }

  function openChatHistory(): void {
    const ws = $files.workspacePath ?? "";
    const msgs = $activeSession?.messages ?? [];
    const lines: string[] = [];
    for (const m of msgs) {
      if (m.role === "tool") continue;
      const prefix = m.role === "user" ? "### User" : "### Assistant";
      lines.push(prefix);
      if (m.content.trim()) lines.push(m.content.trim());
      lines.push("");
    }
    workbench.openEditorFile({
      path: `${ws}/.sidebar/context/chat-history.md`,
      name: "Chat history",
      content: lines.join("\n"),
      isDirty: false,
      language: "markdown",
      pendingOnDisk: true,
    });
  }

  function formatTok(n: number): string {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(Math.round(n));
  }

  function formatTokRate(r: number): string {
    if (r >= 100) return String(Math.round(r));
    if (r >= 10) return r.toFixed(1);
    return r.toFixed(2);
  }

  function formatDuration(sec: number): string {
    if (sec < 1) return `${Math.max(1, Math.round(sec * 1000))}ms`;
    if (sec < 10) return `${sec.toFixed(1)}s`;
    return `${Math.round(sec)}s`;
  }

  let compactButtonInactive = $derived(
    !$settings.agentCompaction.enabled ||
      compacting ||
      $chat.isStreaming ||
      !chatHasMessagesForCompaction(
        $activeSession?.messages.length ?? 0,
        $settings.agentCompaction.compactKeepRecentTurns
      )
  );

  let compactButtonTitle = $derived(
    !$settings.agentCompaction.enabled
      ? MANUAL_COMPACTION_DISABLED_TITLE
      : MANUAL_COMPACTION_BUTTON_TITLE
  );

  function showCompactionNotice(message: string) {
    compactionNotice = message;
    if (compactionNoticeTimer) clearTimeout(compactionNoticeTimer);
    compactionNoticeTimer = setTimeout(() => {
      compactionNotice = null;
      compactionNoticeTimer = null;
    }, 8000);
  }

  async function requestManualCompaction() {
    if (compactButtonInactive) return;
    const st = get(settings);
    if (!st.agentCompaction.enabled) {
      showCompactionNotice(MANUAL_COMPACTION_DISABLED_TITLE);
      return;
    }
    const session = get(activeSession);
    if (!session) return;

    compacting = true;
    try {
      const st = get(settings);
      const keepRecent = st.agentCompaction.compactKeepRecentTurns;
      const thresholdPercent = Math.round(contextPct()) || compactionThresholdPercent(st.agentCompaction.compactThreshold);
      const newMessages = await compactChatSession({
        settings: st,
        messages: session.messages,
        keepRecent,
        keepRecentToolMessages: st.agentCompaction.compactKeepRecentToolMessages,
        thresholdPercent,
      });
      chat.applyCompaction(newMessages);
      await persistCurrentProjectState();
      showCompactionNotice(COMPACTION_SUCCESS_NOTICE);
    } catch (err) {
      showCompactionNotice(err instanceof Error ? err.message : String(err));
    } finally {
      compacting = false;
    }
  }

  function clearStreamTiming() {
    streamFirstTokenAt = 0;
    streamWallStartMs = 0;
  }

  function recordLastReplyMetrics(outputTokens: number) {
    const t0 = streamFirstTokenAt || streamWallStartMs;
    if (t0 <= 0 || outputTokens <= 0) return;
    const durationSec = (performance.now() - t0) / 1000;
    if (durationSec <= 0.05) return;
    const tokPerSec = outputTokens / durationSec;
    lastTokPerSec = tokPerSec;
    lastReplyMetrics = { outputTokens, durationSec, tokPerSec };
    clearStreamTiming();
  }

  function deferFinalizeReplyMetrics(content: string) {
    queueMicrotask(() => {
      if (usageRecordedForStream) return;
      usageRecordedForStream = true;
      recordLastReplyMetrics(countTokens(content));
    });
  }

  function lastReplyFooterLabel(): string {
    const m = lastReplyMetrics;
    if (!m) return "— tok/s · — tok · —";
    return `${formatTokRate(m.tokPerSec)} tok/s · ${formatTok(m.outputTokens)} tok · ${formatDuration(m.durationSec)}`;
  }

  $effect(() => {
    const sid = $chat.activeSessionId;
    if (sid !== prevActiveSessionForTok) {
      prevActiveSessionForTok = sid;
      lastReplyMetrics = null;
      lastTokPerSec = null;
    }
  });

  async function refreshOllamaModelsFromHost() {
    try {
      const list = await fetchOllamaModelList(
        get(settings).ollamaEndpoint,
        get(settings).ollamaModels,
        get(settings).ollamaApiKey
      );
      settings.setOllamaModels(list);
      ollamaCatalogStatus = "ok";
    } catch (e) {
      console.warn("Could not list Ollama models:", e);
      ollamaCatalogStatus = "fail";
    }
  }

  async function syncCloudCatalogOnce() {
    const { getCloudApiKey } = await import("$lib/apiSecrets");
    const st = get(settings);
    const anthropicKey = await getCloudApiKey("anthropic");
    if (anthropicKey.length >= 20 && !st.anthropicCatalogFetched) {
      try {
        const rows = await fetchAnthropicModelCatalog(anthropicKey);
        settings.setAnthropicModels(mergeCloudModelCatalog(st.anthropicModels, rows));
      } catch (e) {
        console.warn("Anthropic model catalog:", e);
      }
    }
    const st2 = get(settings);
    const deepseekKey = await getCloudApiKey("deepseek");
    if (deepseekKey.length >= 20 && !st2.deepseekCatalogFetched) {
      try {
        const rows = await fetchDeepseekModelCatalog(deepseekKey);
        settings.setDeepseekModels(mergeCloudModelCatalog(st2.deepseekModels, rows));
      } catch (e) {
        console.warn("DeepSeek model catalog:", e);
      }
    }
    const st3 = get(settings);
    const glmKey = await getCloudApiKey("glm");
    if (glmKey.length >= 10 && !st3.glmCatalogFetched) {
      try {
        const rows = await fetchGlmModelCatalog(glmKey);
        settings.setGlmModels(mergeCloudModelCatalog(st3.glmModels, rows));
      } catch (e) {
        console.warn("GLM model catalog:", e);
      }
    }
    const st4 = get(settings);
    const kimiKey = await getCloudApiKey("kimi");
    if (kimiKey.length >= 10 && !st4.kimiCatalogFetched) {
      try {
        const rows = await fetchKimiModelCatalog(kimiKey);
        settings.setKimiModels(mergeCloudModelCatalog(st4.kimiModels, rows));
      } catch (e) {
        console.warn("Kimi model catalog:", e);
      }
    }
  }

  onMount(async () => {
    void refreshOllamaModelsFromHost();
    void syncCloudCatalogOnce();
    if (isTauriAvailable()) {
      listenFileDrag({
        onOver: (pos) => {
          chatDropActive = dragPointInChatPane(pos);
        },
        onDrop: (paths, pos) => void onNativeFileDrop(paths, pos),
        onLeave: () => {
          chatDropCounter = 0;
          chatDropActive = false;
        },
      })
        .then((un) => (unlistenFileDrag = un))
        .catch(() => {});
    }
    if (isTauriAvailable() && $files.workspacePath) {
      await systemPrompts.load($files.workspacePath);
      await reloadProjectTools($files.workspacePath);
    }
  });

  function onElementSelected(e: Event) {
    const text = (e as CustomEvent<{ text: string }>).detail?.text;
    if (!text) return;
    const tagMatch = text.match(/\[Selected element:\s*([a-z][a-z0-9]*)/i);
    const name = tagMatch?.[1]?.toLowerCase() || "element";
    addAttachment({ kind: "element", name, text });
  }
  window.addEventListener("spacebar:element-selected", onElementSelected);
  onDestroy(() => window.removeEventListener("spacebar:element-selected", onElementSelected));

  $effect(() => {
    const ws = $files.workspacePath;
    if (ws && isTauriAvailable()) {
      void reloadProjectTools(ws);
    }
  });

  onDestroy(() => {
    stopDictation();
    abortController?.abort();
    unlistenFileDrag?.();
    if (compactionNoticeTimer) clearTimeout(compactionNoticeTimer);
  });

  $effect(() => {
    if (modelMenuOpen) void refreshOllamaModelsFromHost();
  });

  function toggleModelMenu() {
    modelMenuOpen = !modelMenuOpen;
    if (modelMenuOpen) {
      contextBudgetMenuOpen = false;
      modeMenuOpen = false;
    }
  }

  function toggleModeMenu() {
    modeMenuOpen = !modeMenuOpen;
    if (modeMenuOpen) {
      modelMenuOpen = false;
      contextBudgetMenuOpen = false;
    }
  }

  function toggleContextBudgetMenu() {
    contextBudgetMenuOpen = !contextBudgetMenuOpen;
    if (contextBudgetMenuOpen) {
      modelMenuOpen = false;
      modeMenuOpen = false;
    }
  }

  function pickContextBudgetOption(opt: number) {
    const st = get(settings);
    if (st.chatBackend === "ollama") {
      const sid = st.selectedModel;
      const next = st.ollamaModels.map((m) => {
        if (m.id !== sid) return m;
        const max = m.contextLimitMax ?? opt;
        return { ...m, contextWindow: pickContextOption(opt, max) };
      });
      settings.setOllamaModels(next);
    } else if (st.chatBackend === "llamacpp") {
      const sid = st.selectedModel;
      settings.setLlamacppModels(
        st.llamacppModels.map((m) => (m.id === sid ? { ...m, contextWindow: opt } : m))
      );
    } else {
      const cap =
        st.anthropicModels.find((m) => m.id === st.selectedModel && m.provider === "anthropic")
          ?.contextWindow ?? 128_000;
      if (opt >= cap) settings.setAnthropicContextBudget(null);
      else settings.setAnthropicContextBudget(opt);
    }
    contextBudgetMenuOpen = false;
  }

  function onDocPointerDown(e: PointerEvent) {
    const t = e.target as Node;
    if (
      modelMenuOpen &&
      modelMenuAnchorEl &&
      !modelMenuAnchorEl.contains(t) &&
      (!modelMenuPopupEl || !modelMenuPopupEl.contains(t))
    ) {
      modelMenuOpen = false;
    }
    if (modeMenuOpen && modeMenuAnchorEl && !modeMenuAnchorEl.contains(t)) {
      modeMenuOpen = false;
    }
    if (contextBudgetMenuOpen && contextBudgetMenuEl && !contextBudgetMenuEl.contains(t)) {
      contextBudgetMenuOpen = false;
    }
    if (toolApprovalMenuOpen && toolApprovalMenuAnchorEl && !toolApprovalMenuAnchorEl.contains(t)) {
      toolApprovalMenuOpen = false;
    }
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }

  async function onAttachChange(ev: Event) {
    const el = ev.currentTarget as HTMLInputElement;
    const file = el.files?.[0];
    el.value = "";
    if (!file) return;

    const gap = getComposerText().trim().length ? "\n\n" : "";

    if (file.type.startsWith("image/")) {
      if (file.size > 150_000) {
        appendTextToComposer(`${gap}[Image "${file.name}" skipped — larger than 150KB]\n`);
        return;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        appendTextToComposer(`${gap}![${file.name}](${dataUrl})\n`);
      } catch {
        appendTextToComposer(`${gap}[Could not read image "${file.name}"]\n`);
      }
      return;
    }

    const textLike =
      /^text\/|application\/(json|xml|javascript|typescript)/.test(file.type) ||
      /\.(txt|md|json|xml|yaml|yml|toml|rs|ts|tsx|jsx|js|mjs|cjs|svelte|css|html|vue|py|go|java|kt|swift|c|h|cpp|hpp)$/i.test(
        file.name
      );

    if (textLike && file.size <= 512_000) {
      try {
        const text = await file.text();
        appendTextToComposer(`${gap}--- ${file.name} ---\n${text}`);
      } catch {
        appendTextToComposer(`${gap}[Could not read "${file.name}"]\n`);
      }
      return;
    }

    appendTextToComposer(`${gap}[File: ${file.name} (${file.type || "unknown"}, ${file.size} bytes) — not inlined]\n`);
  }

  function handleChatDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    chatDropCounter++;
    chatDropActive = true;
  }

  function handleChatDragLeave() {
    chatDropCounter--;
    if (chatDropCounter <= 0) {
      chatDropCounter = 0;
      chatDropActive = false;
    }
  }

  /** Decode `file://` URIs from a drag's uri-list into absolute paths. */
  function pathsFromUriList(dt: DataTransfer): string[] {
    const raw = dt.getData("text/uri-list") || "";
    return raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("#") && s.startsWith("file://"))
      .map((uri) => {
        try {
          return decodeURIComponent(new URL(uri).pathname);
        } catch {
          return "";
        }
      })
      .filter(Boolean);
  }

  /** Add an absolute path as a chip, detecting whether it is a directory. */
  async function addAbsolutePathAttachment(path: string) {
    const norm = normalizeFilePath(path).replace(/\/$/, "");
    if (!norm) return;
    let isDir = false;
    try {
      await listDir(null, norm);
      isDir = true;
    } catch {
      isDir = false;
    }
    const base = norm.split("/").pop() ?? norm;
    addAttachment({ kind: "abs-path", name: isDir ? `${base}/` : base, path: norm, isDir });
  }

  async function handleChatDrop(e: DragEvent) {
    e.preventDefault();
    chatDropCounter = 0;
    chatDropActive = false;

    const dt = e.dataTransfer;
    if (!dt) return;

    const spacebarPath = dt.getData("application/spacebar-path");
    if (spacebarPath) {
      const name = spacebarPath.split("/").pop() ?? spacebarPath;
      addAttachment({ kind: "abs-path", name, path: spacebarPath });
      return;
    }

    // External OS drops are handled by the native Tauri drag-drop listener,
    // which receives real absolute paths (HTML5 only sees portal/FUSE URIs).
    if (isTauriAvailable()) return;

    const uriPaths = pathsFromUriList(dt);
    if (uriPaths.length > 0) {
      for (const p of uriPaths) void addAbsolutePathAttachment(p);
      return;
    }

    const items = Array.from(dt.items ?? []);
    if (items.length > 0) {
      for (const item of items) {
        const entry = item.webkitGetAsEntry?.();
        if (!entry) {
          const file = item.getAsFile?.();
          if (file) addAttachment({ kind: "browser-file", name: file.name, file });
          continue;
        }
        if (entry.isDirectory) {
          addAttachment({ kind: "dir-entry", name: entry.name + "/", entry: entry as FileSystemDirectoryEntry });
        } else {
          const file = item.getAsFile?.();
          if (file) addAttachment({ kind: "browser-file", name: file.name, file });
        }
      }
      return;
    }

    for (const file of Array.from(dt.files ?? [])) {
      addAttachment({ kind: "browser-file", name: file.name, file });
    }
  }

  function dragPointInChatPane(pos: { x: number; y: number }): boolean {
    if (!chatRootEl) return false;
    const scale = window.devicePixelRatio || 1;
    const x = pos.x / scale;
    const y = pos.y / scale;
    const r = chatRootEl.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  async function onNativeFileDrop(paths: string[], pos: { x: number; y: number }) {
    const inside = dragPointInChatPane(pos);
    chatDropCounter = 0;
    chatDropActive = false;
    if (!inside) return;
    for (const p of paths) await addAbsolutePathAttachment(p);
  }

  function removeAttachment(index: number) {
    pendingAttachments = pendingAttachments.filter((_, i) => i !== index);
    focusComposer();
  }

  function getComposerText(): string {
    if (!composerEl) return inputValue;
    let text = "";
    function walk(node: Node) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent ?? "";
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        if (el.tagName === "BR") { text += "\n"; return; }
        if (el.tagName === "DIV" && text.length > 0 && !text.endsWith("\n")) text += "\n";
        for (const child of el.childNodes) walk(child);
      }
    }
    for (const child of composerEl.childNodes) walk(child);
    return text;
  }

  function onComposerInput() {
    inputValue = getComposerText();
  }

  function setComposerText(text: string) {
    if (!composerEl) { inputValue = text; return; }
    composerEl.innerHTML = "";
    pendingAttachments = [];
    if (text) composerEl.appendChild(document.createTextNode(text));
    inputValue = text;
  }

  function clearComposer() {
    if (composerEl) composerEl.innerHTML = "";
    pendingAttachments = [];
    inputValue = "";
  }

  function focusComposer() {
    if (!composerEl) return;
    composerEl.focus();
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(composerEl);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function appendTextToComposer(text: string) {
    if (composerEl) {
      composerEl.appendChild(document.createTextNode(text));
      inputValue = getComposerText();
    } else {
      inputValue += text;
    }
  }

  function attachmentChipLabel(att: PendingAttachment): string {
    const raw = att.name;
    if (att.kind === "dir-entry" || raw.endsWith("/")) {
      return raw.endsWith("/") ? raw : `${raw}/`;
    }
    return raw.split("/").pop() ?? raw;
  }

  type ChipKind = "file" | "dir" | "element" | "image" | "video" | "audio";

  function mediaKindFromName(name: string): "image" | "video" | "audio" | null {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"].includes(ext)) return "image";
    if (["mp4", "webm", "mkv", "mov", "avi", "m4v"].includes(ext)) return "video";
    if (["mp3", "wav", "ogg", "flac", "m4a", "aac"].includes(ext)) return "audio";
    return null;
  }

  function attachmentChipKind(att: PendingAttachment): ChipKind {
    if (att.kind === "element") return "element";
    if (
      att.kind === "dir-entry" ||
      (att.kind === "abs-path" && (att.isDir || att.name.endsWith("/")))
    ) {
      return "dir";
    }
    return mediaKindFromName(att.name) ?? "file";
  }

  function addAttachment(att: PendingAttachment) {
    if (
      att.kind === "abs-path" &&
      pendingAttachments.some((a) => a.kind === "abs-path" && a.path === att.path)
    ) {
      return;
    }
    pendingAttachments = [...pendingAttachments, att];
    focusComposer();
  }

  /** Open the file behind a chip in the editor; for element chips, locate the
   *  source via workspace search and jump to the matching line. */
  async function openAttachmentTarget(att: PendingAttachment) {
    if (att.kind === "element") {
      await openElementSource(att.text);
      return;
    }
    if (att.kind !== "abs-path") return;
    const isDir = att.isDir || att.name.endsWith("/");
    // Folders and media open with the OS (file manager / default viewer);
    // anything text-like opens in the editor.
    if (isDir || mediaKindFromName(att.name)) {
      try {
        await openExternalUrl(`file://${encodeURI(att.path)}`);
      } catch {
        toast.error(`Could not open ${att.name}`);
      }
      return;
    }
    await openPathInEditor(att.path);
  }

  async function openPathInEditor(absPath: string, line?: number) {
    try {
      const content = await readFile(null, absPath);
      const name = absPath.split("/").pop() ?? absPath;
      workbench.openEditorFile({
        path: absPath,
        name,
        content,
        isDirty: false,
        language: getLanguageFromPath(absPath),
      });
      if (line != null) {
        window.dispatchEvent(
          new CustomEvent("sidebar:goto-line", { detail: { path: absPath, line } })
        );
      }
    } catch {
      toast.error(`Could not open ${absPath.split("/").pop() ?? absPath}`);
    }
  }

  /** Best-effort: grep the workspace for the element's text/id/class and open
   *  the first source match at its line. */
  async function openElementSource(elementText: string) {
    const ws = get(files).workspacePath;
    if (!ws || !isTauriAvailable()) return;

    const needles: string[] = [];
    const textMatch = elementText.match(/Text:\s*"([^"\n]+)"/);
    if (textMatch?.[1]) needles.push(textMatch[1].trim());
    const idMatch = elementText.match(/#([A-Za-z][\w-]*)/);
    if (idMatch?.[1]) needles.push(`id="${idMatch[1]}"`);
    const clsMatch = elementText.match(/\[Selected element:\s*[a-z][a-z0-9]*\.([\w-]+)/i);
    if (clsMatch?.[1]) needles.push(clsMatch[1]);

    for (const needle of needles) {
      if (needle.length < 3) continue;
      try {
        const matches = await grepWorkspace(ws, needle);
        const hit = matches[0];
        if (hit) {
          await openPathInEditor(hit.path, hit.line_number);
          return;
        }
      } catch {
        /* try next needle */
      }
    }
    toast.info("Couldn't locate this element's source in the project.");
  }

  async function resolveAttachments(): Promise<string> {
    const parts: string[] = [];
    for (const att of pendingAttachments) {
      if (att.kind === "browser-file") {
        const file = att.file;
        if (file.type.startsWith("image/") && file.size <= 150_000) {
          try { parts.push(`![${file.name}](${await readFileAsDataUrl(file)})`); continue; } catch { /* fall through */ }
        }
        const textLike =
          /^text\/|application\/(json|xml|javascript|typescript)/.test(file.type) ||
          /\.(txt|md|json|xml|yaml|yml|toml|rs|ts|tsx|jsx|js|mjs|cjs|svelte|css|html|vue|py|go|java|kt|swift|c|h|cpp|hpp)$/i.test(file.name);
        if (textLike && file.size <= 200_000) {
          try {
            const ext = file.name.split(".").pop() ?? "";
            parts.push(`\`\`\`${ext}\n// ${file.name}\n${await file.text()}\n\`\`\``);
            continue;
          } catch { /* fall through */ }
        }
        const media = mediaKindFromName(file.name);
        parts.push(
          media
            ? `[${media.charAt(0).toUpperCase() + media.slice(1)}: ${file.name} (${file.type || "unknown"}, ${file.size} bytes)]`
            : `[File: ${file.name} (${file.size} bytes)]`
        );
      } else if (att.kind === "dir-entry") {
        const names = await new Promise<string[]>((res) => {
          att.entry.createReader().readEntries(
            (entries) => res(entries.map((e) => e.name + (e.isDirectory ? "/" : ""))),
            () => res([])
          );
        });
        parts.push(`--- ${att.name} ---\n${names.sort().join("\n") || "(empty)"}`);
      } else if (att.kind === "element") {
        parts.push(att.text);
      } else {
        // Binary media can't be inlined as text — reference the path so the
        // agent can use its tools on it instead.
        const media = mediaKindFromName(att.name);
        if (media && !att.isDir) {
          parts.push(`[${media.charAt(0).toUpperCase() + media.slice(1)} attached: ${att.path}]`);
          continue;
        }
        try {
          const entries = await listDir(null, att.path);
          const names = entries.map((e) => e.name + (e.is_dir ? "/" : "")).sort().join("\n");
          parts.push(`--- ${att.name} ---\n${names || "(empty)"}`);
        } catch {
          try {
            const text = await readFile(null, att.path);
            const ext = att.name.split(".").pop() ?? "";
            parts.push(`\`\`\`${ext}\n// ${att.name}\n${text}\n\`\`\``);
          } catch {
            parts.push(`[Attached file (binary, not inlined): ${att.path}]`);
          }
        }
      }
    }
    return parts.join("\n\n");
  }

  function stopDictation() {
    try {
      speechRec?.stop();
    } catch {
      /* already stopped */
    }
    speechRec = null;
    speechListening = false;
  }

  function toggleDictation() {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: new () => BrowserSpeechRec;
      webkitSpeechRecognition?: new () => BrowserSpeechRec;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;

    if (speechListening) {
      stopDictation();
      return;
    }

    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event: BrowserSpeechResultEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0]?.transcript?.trim();
        if (!t) continue;
        if (composerEl) {
          const cur = getComposerText();
          const sep = cur.length && !/\s$/.test(cur) ? " " : "";
          composerEl.appendChild(document.createTextNode(sep + t));
          inputValue = getComposerText();
        } else {
          const sep = inputValue.length && !/\s$/.test(inputValue) ? " " : "";
          inputValue = `${inputValue}${sep}${t}`;
        }
      }
    };
    rec.onerror = () => {
      speechListening = false;
      speechRec = null;
    };
    rec.onend = () => {
      speechListening = false;
      speechRec = null;
    };
    speechRec = rec;
    speechListening = true;
    try {
      rec.start();
    } catch {
      speechListening = false;
      speechRec = null;
    }
  }

  function markFirstStreamToken() {
    if (!streamFirstTokenAt) streamFirstTokenAt = performance.now();
  }

  function buildSystemPrompt(toolsEnabled: boolean): string {
    const st = get(settings);
    const { prompt } = assembleSystemPrompt({
      mode: get(currentMode),
      workspacePath: get(files).workspacePath,
      includeWorkspaceInChat: st.includeWorkspaceInChat,
      userPromptText: get(activeSystemPromptText),
      toolsEnabled,
      modelSettings: resolveActiveModelSettings(st),
      skillBlocks: activeSkillBlocks(),
    });
    return prompt;
  }

  type ToolExecResult = {
    id: string;
    name: string;
    content: string;
    input: Record<string, unknown>;
    success: boolean;
    paths: string[];
    fileDiffBefore?: string;
  };

  async function maybeNotifyNestedScaffold(
    workspacePath: string,
    toolName: string,
    args: Record<string, unknown>,
    success: boolean,
    notified: Set<string>
  ): Promise<void> {
    if (!success || !workspacePath) return;
    const checkDir = async (dir: string) => {
      if (!dir || notified.has(dir)) return;
      const flagged = await shouldFlagNestedScaffold(workspacePath, dir, async (p) => {
        try {
          return await pathExists(workspacePath, p);
        } catch {
          return false;
        }
      });
      if (!flagged) return;
      notified.add(dir);
      toast.info(nestedScaffoldNoticeMessage(dir), { duration: 10000 });
    };
    if (toolName === "run_shell" && typeof args.command === "string") {
      for (const dir of topLevelDirsFromShellCommand(args.command, workspacePath)) {
        await checkDir(dir);
      }
    }
    if (
      (toolName === "write_file" || toolName === "create_file") &&
      typeof args.path === "string"
    ) {
      try {
        const resolved = resolveWorkspacePath(workspacePath, args.path);
        const dir = topLevelDirFromWritePath(workspacePath, resolved);
        if (dir) await checkDir(dir);
      } catch {
        /* ignore bad paths */
      }
    }
  }

  async function runOneTool(
    tc: StoredToolCall,
    args: Record<string, unknown>,
    workspacePath: string,
    webFetchAllowedHosts: string[],
    readFileMaxLines: number | undefined,
    nestedScaffoldNotified?: Set<string>
  ): Promise<ToolExecResult> {
    patchLiveTurn((t) =>
      upsertLiveTool(t, { id: tc.id, name: tc.name, input: args, status: "running" })
    );
    const st = get(settings);
    const fileDiffBefore = await captureFileDiffBefore(tc.name, args, workspacePath);
    const result = await executeTool(tc.name, args, workspacePath, {
      webFetchAllowedHosts,
      readFileMaxLines,
      onNetworkRetryExhausted: (msg) => toast.error(msg, { duration: 5000 }),
      readOnly: get(workspaceReadOnly),
      lspToolTimeout: st.agentLimits.lspToolTimeout,
      lspWorkspaceSymbolTimeout: st.agentLimits.lspWorkspaceSymbolTimeout,
      onSwitchMode: (mode) => currentMode.setMode(mode),
    });
    await syncUiAfterFilesystemTool(workspacePath, tc.name, args, result.success);
    const toolResult: ToolExecResult = {
      id: tc.id,
      name: tc.name,
      content: result.success ? result.output : `Error: ${result.output}`,
      input: args,
      success: result.success,
      paths: openableFilePaths(tc.name, args, workspacePath, result.success),
      fileDiffBefore,
    };
    patchLiveTurn((t) =>
      upsertLiveTool(t, {
        id: toolResult.id,
        name: toolResult.name,
        input: toolResult.input,
        status: toolResult.success ? "done" : "error",
        content: toolResult.content,
        success: toolResult.success,
        paths: toolResult.paths,
        fileDiffBefore: toolResult.fileDiffBefore,
      })
    );
    if (nestedScaffoldNotified) {
      await maybeNotifyNestedScaffold(
        workspacePath,
        tc.name,
        args,
        toolResult.success,
        nestedScaffoldNotified
      );
    }
    return toolResult;
  }

  async function flushParallelBatch(
    batch: Array<{ tc: StoredToolCall; args: Record<string, unknown> }>,
    workspacePath: string,
    webFetchAllowedHosts: string[],
    readFileMaxLines: number | undefined,
    maxConcurrent: number,
    runCounter: { executed: number },
    limits: AgentLimits,
    nestedScaffoldNotified?: Set<string>
  ): Promise<ToolExecResult[]> {
    if (batch.length === 0) return [];
    const out: ToolExecResult[] = [];
    for (let i = 0; i < batch.length; i += maxConcurrent) {
      const chunk = batch.slice(i, i + maxConcurrent);
      const chunkResults = await Promise.all(
        chunk.map(({ tc, args }) =>
          runOneTool(
            tc,
            args,
            workspacePath,
            webFetchAllowedHosts,
            readFileMaxLines,
            nestedScaffoldNotified
          )
        )
      );
      for (const r of chunkResults) {
        if (toolCountsTowardRunCap(r.name, limits)) runCounter.executed++;
        out.push(r);
      }
    }
    chat.setToolCall(null);
    return out;
  }

  async function executeToolCallsWithApproval(
    toolCalls: StoredToolCall[],
    policy: ToolPolicyState,
    workspacePath: string,
    webFetchAllowedHosts: string[],
    limits: AgentLimits,
    runCounter: { executed: number },
    options?: {
      readFileMaxLines?: number;
      parallelToolCalls?: boolean;
      stallTracker?: StallTracker;
      nestedScaffoldNotified?: Set<string>;
    }
  ): Promise<{
    results: ToolExecResult[];
    hitRunCap: boolean;
    stallAbort?: boolean;
  }> {
    const results: ToolExecResult[] = [];
    let hitRunCap = false;
    const canParallel = limits.parallelExecution && limits.maxConcurrentTools > 1;
    let parallelBatch: Array<{ tc: StoredToolCall; args: Record<string, unknown> }> = [];

    async function flushBatch() {
      if (parallelBatch.length === 0) return;
      const batchResults = await flushParallelBatch(
        parallelBatch,
        workspacePath,
        webFetchAllowedHosts,
        options?.readFileMaxLines,
        limits.maxConcurrentTools,
        runCounter,
        limits,
        options?.nestedScaffoldNotified
      );
      for (const r of batchResults) {
        results.push(r);
        options?.stallTracker?.resetOnProgress(r.name, r.input);
      }
      parallelBatch = [];
    }

    const perTurnCap = perTurnToolCap(limits, toolCalls.length);
    const toRun = toolCalls.slice(0, perTurnCap);
    const skippedPerTurn = toolCalls.slice(perTurnCap);

    for (const tc of skippedPerTurn) {
      results.push({
        id: tc.id,
        name: tc.name,
        content: `Error: Not executed — per-turn tool limit (${limits.maxToolsPerTurn}) reached.`,
        input: {},
        success: false,
        paths: [],
      });
    }

    for (const tc of toRun) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(tc.arguments);
      } catch {
        args = {};
      }

      if (
        isToolRunCapReached(runCounter.executed, limits) &&
        toolCountsTowardRunCap(tc.name, limits)
      ) {
        await flushBatch();
        hitRunCap = true;
        results.push({
          id: tc.id,
          name: tc.name,
          content: `Error: Not executed — maximum tool calls per run (${limits.maxToolCallsPerRun}) reached.`,
          input: args,
          success: false,
          paths: [],
        });
        continue;
      }

      if (toolIsDenied(policy, tc.name, args)) {
        results.push({
          id: tc.id,
          name: tc.name,
          content: `Error: Tool "${tc.name}" is blocked by policy (deny).`,
          input: args,
          success: false,
          paths: [],
        });
        continue;
      }

      if (toolNeedsUserApproval(policy, tc.name, args)) {
        await flushBatch();
        toolApprovalChoice = "allow";
        toolApprovalMenuOpen = false;
        pendingToolApproval = { id: tc.id, tool: tc.name, input: args };
        const approved = await waitForToolApproval();
        pendingToolApproval = null;

        if (!approved) {
          results.push({
            id: tc.id,
            name: tc.name,
            content: `Error: Tool call "${tc.name}" was denied by user.`,
            input: args,
            success: false,
            paths: [],
          });
          continue;
        }
      }

      const stall = options?.stallTracker?.record(tc.name, args);
      if (stall === "abort") {
        await flushBatch();
        const responded = new Set(results.map((r) => r.id));
        for (const tc of toRun) {
          if (!responded.has(tc.id)) {
            results.push({
              id: tc.id,
              name: tc.name,
              content: "Error: Agent stopped — repeated the same tool call without progress.",
              input: {},
              success: false,
              paths: [],
            });
          }
        }
        return { results, hitRunCap: false, stallAbort: true };
      }
      if (stall === "nudge") {
        results.push({
          id: tc.id,
          name: tc.name,
          content: stallNudgeMessage(tc.name),
          input: args,
          success: true,
          paths: [],
        });
        continue;
      }

      if (canParallel && isReadOnlyTool(tc.name)) {
        parallelBatch.push({ tc, args });
      } else {
        await flushBatch();
        chat.setToolCall({ id: tc.id, tool: tc.name, input: args, status: "running" });
        const toolResult = await runOneTool(
          tc,
          args,
          workspacePath,
          webFetchAllowedHosts,
          options?.readFileMaxLines,
          options?.nestedScaffoldNotified
        );
        chat.setToolCall(null);
        if (toolCountsTowardRunCap(tc.name, limits)) runCounter.executed++;
        results.push(toolResult);
        options?.stallTracker?.resetOnProgress(tc.name, args);
      }

      if (
        isToolRunCapReached(runCounter.executed, limits) &&
        toolCountsTowardRunCap(tc.name, limits)
      ) {
        hitRunCap = true;
      }
    }

    await flushBatch();
    return { results, hitRunCap };
  }

  function agentContextWindow(st: SettingsState): number {
    return resolveModelContextWindow({
      chatBackend: st.chatBackend,
      selectedModel: st.selectedModel,
      ollamaModels: st.ollamaModels,
      llamacppModels: st.llamacppModels,
      anthropicModels: st.anthropicModels,
      deepseekModels: st.deepseekModels,
      glmModels: st.glmModels,
      kimiModels: st.kimiModels,
      anthropicContextBudget: st.anthropicContextBudget,
    });
  }

  async function runAgentLoop(stepOverride?: number) {
    const st = get(settings);
    const mode = get(currentMode);
    const modeConfig = MODE_CONFIG[mode];
    const policyState = get(effectiveToolPolicy);
    let tools = getToolsForPolicy(policyState, modeConfig.tools);
    const modelSettings = resolveActiveModelSettings(st);
    const nativeTools = usesNativeToolCalls(modelSettings);
    let systemPromptText = buildSystemPrompt(tools.length > 0);
    const workspacePath = get(files).workspacePath;
    if (!workspacePath?.trim()) {
      chat.addMessage({
        role: "assistant",
        content:
          "Error: No project folder is open. Use the folder icon on the right activity bar to open your workspace, then try again.",
      });
      chat.setStreaming(false);
      return;
    }
    let history = get(activeSession)?.messages ?? [];

    let providerMessages = buildProviderMessages(systemPromptText, history);
    abortController = new AbortController();
    stepLimitNotice = null;
    const agentLimits = stepOverride != null && stepOverride > 0
      ? { ...st.agentLimits, maxAgentSteps: stepOverride }
      : st.agentLimits;
    const toolRunCounter = { executed: 0 };
    const executedToolOutcomes: Array<{ name: string; success: boolean }> = [];
    let deliveredSummary = false;
    let hitRunCap = false;
    let hitStepLimit = false;
    let hitContextLimit = false;
    const contextWindow = agentContextWindow(st);
    const readFileMaxLines = resolveReadFileMaxLines(st.readFileCap, contextWindow);
    const stallTracker = new StallTracker();
    const nestedScaffoldNotified = new Set<string>();
    const streamApiKeys = await cloudApiKeysForStream();
    let parseAttempts = 0;
    let step = 0;
    liveTurn = createLiveTurn();

    const autoCompacted = await maybeAutoCompactBeforeTurn({
      settings: st,
      messages: history,
      providerMessages,
      contextWindow,
      signal: abortController.signal,
    });
    if (autoCompacted) {
      chat.applyCompaction(autoCompacted);
      history = autoCompacted;
      providerMessages = buildProviderMessages(systemPromptText, history);
      await persistCurrentProjectState();
      showCompactionNotice(COMPACTION_SUCCESS_NOTICE);
    }

    try {
      while (shouldContinueAgentStep(step, agentLimits)) {
        if (isAgentContextBudgetExceeded(providerMessages, contextWindow)) {
          hitContextLimit = true;
          break;
        }

        streamingContent = "";
        const agentToolsEnabled = tools.length > 0;
        if (agentToolsEnabled && liveTurn) {
          patchLiveTurn((t) => ({ ...t, planText: "" }));
        }

        const creds = resolveStreamCredentials({
          backend: st.chatBackend,
          apiKeys: streamApiKeys,
          ollamaEndpoint: st.ollamaEndpoint,
          ollamaApiKey: st.ollamaApiKey,
          llamacppEndpoint: st.llamacppEndpoint,
          llamacppApiKey: st.llamacppApiKey,
        });
        const turn = await streamOneTurn({
          backend: st.chatBackend,
          apiKey: creds.apiKey,
          baseUrl: creds.baseUrl,
          model: st.selectedModel,
          systemPrompt: systemPromptText,
          messages: providerMessages,
          tools: nativeTools && tools.length > 0 ? tools : undefined,
          extendedThinking: st.anthropicExtendedThinking,
          signal: abortController.signal,
          inferenceOptions: inferenceOptionsForSettings(st),
          onDelta: (content) => {
            streamingContent = content;
            if (!agentToolsEnabled) {
              patchLiveTurn((t) => ({ ...t, response: content }));
            }
            markFirstStreamToken();
          },
          onThinking: (thinking) => {
            patchLiveTurn((t) => ({ ...t, thinking }));
          },
          onToolCall: (tc) => {
            patchLiveTurn((t) => {
              const next = { ...t, response: "" };
              return upsertLiveTool(next, {
                id: tc.id,
                name: tc.name,
                input: parseToolInput(tc.arguments),
                status: "pending",
              });
            });
          },
        });

        if (turn.usage) {
          usageRecordedForStream = true;
          const profile = chatFooterProfile(st.chatBackend);
          if (profile.showStreamMetrics) {
            recordLastReplyMetrics(turn.usage.completion_tokens);
          }
          if (profile.showMonthlyUsage) {
            providerUsage.record(
              profile.usageProviderId,
              turn.usage.prompt_tokens,
              turn.usage.completion_tokens
            );
          }
        }

        const allowedToolNames = new Set(tools.map((t) => t.function.name));
        let activeToolCalls = turn.toolCalls;
        let turnContent = turn.content;

        if (activeToolCalls.length === 0 && allowedToolNames.size > 0) {
          const recovered = recoverToolCallsFromText(turn.content, allowedToolNames);
          if (recovered.calls.length > 0) {
            activeToolCalls = recovered.calls;
            turnContent = recovered.cleanedText;
            patchLiveTurn((t) => ({ ...t, response: "" }));
            for (const tc of activeToolCalls) {
              patchLiveTurn((t) =>
                upsertLiveTool(t, {
                  id: tc.id,
                  name: tc.name,
                  input: parseToolInput(tc.arguments),
                  status: "pending",
                })
              );
            }
          } else {
            const malformed = findMalformedToolCallFragments(turn.content);
            if (malformed.length > 0) {
              parseAttempts += 1;
              const parseNote = malformed
                .map((raw) => formatToolParseError(raw))
                .join("\n\n");
              chat.addMessage({
                role: "user",
                content: `Tool call parse error — use the API tool_call mechanism, not JSON in text:\n\n${parseNote}`,
              });
              providerMessages = [
                ...providerMessages,
                {
                  role: "user",
                  content: `Tool call parse error — use the API tool_call mechanism, not JSON in text:\n\n${parseNote}`,
                },
              ];
              if (parseAttempts >= 3) {
                showCompactionNotice(
                  "Agent stalled: the model is not producing valid tool calls. Try a different model or simplify the request."
                );
                break;
              }
              step += 1;
              continue;
            }
          }
        }

        if (activeToolCalls.length === 0) {
          const text = turn.content.trim();
          if (text) {
            let body = turn.content;
            if (
              textLooksLikeFakeToolUse(text) &&
              toolRunCounter.executed === 0 &&
              allowedToolNames.size > 0
            ) {
              body = `${turn.content.trim()}

---
⚠️ No tools actually ran. The model described tools in text instead of calling them. Ensure **Agent** mode is selected and your model supports tool calling (Ollama: try llama3.1+, qwen2.5, or mistral). Then ask again.`;
            }
            chat.addMessage({
              role: "assistant",
              content: body,
              thinking: turn.thinking || undefined,
              activityLabel: liveTurn?.statusLabel,
            });
            patchLiveTurn((t) => ({ ...t, response: body }));
            deferFinalizeReplyMetrics(turn.content);
            deliveredSummary = modelDeliveredSubstantiveReply(body);
          }
          break;
        }

        if (activeToolCalls.length > 0 && turnContent.trim()) {
          patchLiveTurn((t) => ({ ...t, planText: turnContent.trim(), response: "" }));
        }

        chat.addMessage({
          role: "assistant",
          content: turnContent,
          thinking: turn.thinking || undefined,
          activityLabel: liveTurn?.statusLabel,
          rawToolCalls: activeToolCalls,
        });

        providerMessages = appendAssistantToolCalls(
          providerMessages,
          turnContent,
          activeToolCalls
        );

        const toolRound = await executeToolCallsWithApproval(
          activeToolCalls,
          policyState,
          workspacePath,
          st.webFetchAllowedHosts,
          agentLimits,
          toolRunCounter,
          {
            readFileMaxLines,
            parallelToolCalls: modelSettings.parallelToolCalls,
            stallTracker,
            nestedScaffoldNotified,
          }
        );
        hitRunCap = toolRound.hitRunCap;

        for (const r of toolRound.results) {
          executedToolOutcomes.push({ name: r.name, success: r.success });
          chat.addMessage({
            role: "tool",
            content: r.content,
            toolCallId: r.id,
            toolName: r.name,
            toolInput: r.input,
            toolSuccess: r.success,
            toolPaths: r.paths,
            fileDiffBefore: r.fileDiffBefore,
          });
        }

        providerMessages = appendToolResults(
          providerMessages,
          toolRound.results,
          activeToolCalls
        );

        if (toolRound.stallAbort) {
          showCompactionNotice(
            "Agent stopped: repeated the same tool call without progress."
          );
          break;
        }

        const modeSwitched = toolRound.results.some(
          (r) => r.name === "switch_mode" && r.success
        );
        if (modeSwitched) {
          const nextMode = get(currentMode);
          const nextModeConfig = MODE_CONFIG[nextMode];
          tools = getToolsForPolicy(policyState, nextModeConfig.tools);
          systemPromptText = buildSystemPrompt(tools.length > 0);
          providerMessages = [
            { role: "system", content: systemPromptText },
            ...providerMessages.slice(1),
          ];
        }

        if (hitRunCap) break;

        step++;
        if (!shouldContinueAgentStep(step, agentLimits)) {
          hitStepLimit = true;
        }
      }

      if (
        shouldRunSynthesis(deliveredSummary, toolRunCounter.executed) &&
        !abortController.signal.aborted &&
        !hitContextLimit &&
        !isAgentContextBudgetExceeded(providerMessages, contextWindow)
      ) {
        streamingContent = "";
        const synthCreds = resolveStreamCredentials({
          backend: st.chatBackend,
          apiKeys: streamApiKeys,
          ollamaEndpoint: st.ollamaEndpoint,
          ollamaApiKey: st.ollamaApiKey,
          llamacppEndpoint: st.llamacppEndpoint,
          llamacppApiKey: st.llamacppApiKey,
        });
        const synthTurn = await streamOneTurn({
          backend: st.chatBackend,
          apiKey: synthCreds.apiKey,
          baseUrl: synthCreds.baseUrl,
          model: st.selectedModel,
          systemPrompt: systemPromptText,
          messages: [...providerMessages, { role: "user", content: SYNTHESIS_NUDGE }],
          extendedThinking: st.anthropicExtendedThinking,
          signal: abortController.signal,
          inferenceOptions: inferenceOptionsForSettings(st),
          onDelta: (content) => {
            streamingContent = content;
            patchLiveTurn((t) => ({ ...t, response: content }));
            markFirstStreamToken();
          },
          onThinking: (thinking) => {
            patchLiveTurn((t) => ({ ...t, thinking }));
          },
        });

        if (synthTurn.usage) {
          usageRecordedForStream = true;
          const profile = chatFooterProfile(st.chatBackend);
          if (profile.showStreamMetrics) {
            recordLastReplyMetrics(synthTurn.usage.completion_tokens);
          }
          if (profile.showMonthlyUsage) {
            providerUsage.record(
              profile.usageProviderId,
              synthTurn.usage.prompt_tokens,
              synthTurn.usage.completion_tokens
            );
          }
        }

        const summary = synthTurn.content.trim();
        chat.addMessage({
          role: "assistant",
          content:
            summary ||
            "I ran the tools above but couldn't produce a summary. Check the tool output for details.",
        });
        deferFinalizeReplyMetrics(summary);
        deliveredSummary = Boolean(summary);
      }

      if (!deliveredSummary && hitContextLimit) {
        const used = estimateProviderMessagesTokens(providerMessages);
        chat.addMessage({
          role: "assistant",
          content: contextBudgetStopMessage(contextWindow, used),
        });
      } else if (!deliveredSummary && hitRunCap) {
        chat.addMessage({
          role: "assistant",
          content: `Stopped: maximum tool calls (${agentLimits.maxToolCallsPerRun}) reached for this turn.`,
        });
      } else if (!deliveredSummary && hitStepLimit) {
        stepLimitNotice = { limit: agentLimits.maxAgentSteps };
      }
    } catch (e) {
      const err = e as Error;
      if (err.name !== "AbortError") {
        chat.addMessage({ role: "assistant", content: `Error: ${err.message}` });
      }
    } finally {
      streamingContent = "";
      // Mark any tool still showing "running" as "stopped" before clearing the live turn.
      if (abortController?.signal.aborted && liveTurn) {
        liveTurn = {
          ...liveTurn,
          tools: liveTurn.tools.map((t) =>
            t.status === "running" ? { ...t, status: "stopped" as const } : t
          ),
        };
      }
      liveTurn = null;
      // Ensure no tool card stays stuck in "running" state after an abort.
      if (abortController?.signal.aborted) {
        const cur = get(chat).currentToolCall;
        if (cur?.status === "running") {
          chat.setToolCall({ ...cur, status: "pending" });
        }
        chat.setToolCall(null);
      }
      chat.setStreaming(false);
      abortController = null;
    }
  }

  let toolApprovalResolve: ((approved: boolean) => void) | null = null;

  function waitForToolApproval(): Promise<boolean> {
    return new Promise((resolve) => {
      toolApprovalResolve = resolve;
    });
  }

  function submitToolDecision(approved: boolean) {
    if (toolApprovalResolve) {
      toolApprovalResolve(approved);
      toolApprovalResolve = null;
    }
    pendingToolApproval = null;
    toolApprovalMenuOpen = false;
  }

  function toggleToolApprovalMenu() {
    toolApprovalMenuOpen = !toolApprovalMenuOpen;
  }

  function pickToolApprovalChoice(choice: Exclude<ToolApprovalDecision, "deny">) {
    if (!pendingToolApproval) return;
    toolApprovalChoice = choice;
    toolApprovalMenuOpen = false;
    if (choice === "allow_always") {
      toolPolicyStore.setToolRule(pendingToolApproval.tool, "allow");
    }
    submitToolDecision(true);
  }

  function denyToolApproval() {
    submitToolDecision(false);
  }

  let pendingToolApprovalTitle = $derived.by(() => {
    if (!pendingToolApproval) return "";
    const desc = getToolDescription(get(effectiveToolPolicy), pendingToolApproval.tool);
    const input = pendingToolApproval.input;
    let argsBlock = "";
    if (input && typeof input === "object" && Object.keys(input as object).length > 0) {
      try {
        argsBlock = `\n\n${JSON.stringify(input, null, 2)}`;
      } catch {
        argsBlock = `\n\n${String(input)}`;
      }
    }
    return `${pendingToolApproval.tool}\n${desc}${argsBlock}`;
  });

  function pickOllamaModel(modelId: string) {
    settings.setSelectedModel(modelId);
    settings.setChatBackend("ollama");
    modelMenuOpen = false;
  }

  function pickAnthropicModelRow(modelId: string) {
    settings.setChatBackend("anthropic");
    settings.setSelectedModel(modelId);
    modelMenuOpen = false;
  }

  function pickDeepseekModelRow(modelId: string) {
    settings.setChatBackend("deepseek");
    settings.setSelectedModel(modelId);
    modelMenuOpen = false;
  }

  function pickGlmModelRow(modelId: string) {
    settings.setChatBackend("glm");
    settings.setSelectedModel(modelId);
    modelMenuOpen = false;
  }

  function pickKimiModelRow(modelId: string) {
    settings.setChatBackend("kimi");
    settings.setSelectedModel(modelId);
    modelMenuOpen = false;
  }

  function pickLlamacppModelRow(modelId: string) {
    settings.setChatBackend("llamacpp");
    settings.setSelectedModel(modelId);
    modelMenuOpen = false;
  }

  function pickMode(mode: ChatMode) {
    currentMode.setMode(mode);
    modeMenuOpen = false;
  }

  async function cancelChatRequest() {
    if (!$chat.isStreaming) return;
    abortController?.abort();
    if (pendingToolApproval) {
      submitToolDecision(false);
    }
    streamingContent = "";
    usageRecordedForStream = false;
    clearStreamTiming();
    chat.setStreaming(false);
  }

  async function undoLastTurn() {
    const id = lastUndoableUserMessageId();
    if (!id || undoingLastTurn) return;
    undoingLastTurn = true;
    try {
      await revertToUserMessage(id);
    } finally {
      undoingLastTurn = false;
    }
  }

  async function revertToUserMessage(messageId: string, composerText?: string) {
    if ($chat.isStreaming) await cancelChatRequest();

    const session = get(activeSession);
    const workspacePath = get(files).workspacePath?.trim();
    const userIndex = session ? indexOfUserMessage(session.messages, messageId) : -1;
    if (userIndex < 0 || !session) return;

    const userMsg = session.messages[userIndex]!;
    const text = (composerText ?? userMessageDraft[messageId] ?? userMsg.content).trim();
    rewindNotice = null;

    if (workspacePath) {
      try {
        const { usedCheckpoint, pathFallbackErrors } = await applyFilesystemRewind(
          workspacePath,
          session.messages,
          userIndex,
          userMsg.checkpointOid
        );
        await restoreWorkspaceAfterRewind(workspacePath);
        if (!userMsg.checkpointOid && !usedCheckpoint) {
          rewindNotice =
            "Chat rewound. No git checkpoint for this message — commit often or use a git repo for file rewind.";
        } else if (pathFallbackErrors.length > 0) {
          rewindNotice = `Chat rewound; could not restore: ${pathFallbackErrors.slice(0, 3).join(", ")}`;
        }
      } catch (err) {
        rewindNotice =
          err instanceof Error ? err.message : "Could not restore workspace files";
      }
    }

    chat.truncateBeforeUserMessage(messageId);
    setComposerText(text);
    userMessageExpanded = {};
    userMessageDraft = {};
    editingUserMessageId = null;
  }

  async function sendUserMessage(message: string) {
    chat.ensureActiveSession();
    const sessionId = get(chat).activeSessionId;
    const workspacePath = get(files).workspacePath?.trim();

    let checkpointOid: string | undefined;
    if (sessionId && workspacePath) {
      checkpointOid = await createCheckpointBeforeUserMessage(workspacePath, sessionId);
    }

    chat.addMessage({ role: "user", content: message, checkpointOid });

    if ($settings.chatBackend === "ollama" && !ollamaChatReady) {
      chat.addMessage({
        role: "assistant",
        content:
          ollamaCatalogStatus === "fail"
            ? "Ollama is not reachable at your configured endpoint. Check that `ollama serve` is running and Settings → Ollama URL matches."
            : "No Ollama model is selected. Install one with `ollama pull <name>` and pick it from the model menu.",
      });
      return;
    }

    usageRecordedForStream = false;
    streamWallStartMs = performance.now();
    streamFirstTokenAt = 0;
    chat.setStreaming(true);

    await runAgentLoop();
  }

  async function resendFromUserMessage(messageId: string) {
    const session = get(activeSession);
    const userMsg = session?.messages.find((m) => m.id === messageId);
    const draft = (userMessageDraft[messageId] ?? userMsg?.content ?? "").trim();
    if (!draft || $chat.isStreaming) return;
    collapseUserMessage(messageId);
    await revertToUserMessage(messageId, draft);
    clearComposer();
    await sendUserMessage(draft);
  }

  async function handleSubmit(e: Event) {
    stopDictation();
    e.preventDefault();
    if ($chat.isStreaming) return;
    stepLimitNotice = null;

    const editingId = editingUserMessageId;
    const typed = editingId
      ? (userMessageDraft[editingId] ?? "").trim()
      : getComposerText().trim();

    if (!typed && pendingAttachments.length === 0) return;

    const attachmentText = pendingAttachments.length > 0 ? await resolveAttachments() : "";
    const message = attachmentText && typed
      ? `${attachmentText}\n\n${typed}`
      : attachmentText || typed;

    if (editingId) {
      clearComposer();
      userMessageExpanded = {};
      userMessageDraft = {};
      editingUserMessageId = null;
      await revertToUserMessage(editingId, message);
      await sendUserMessage(message);
      return;
    }

    clearComposer();
    await sendUserMessage(message);
  }

  function composerCaretAtStart(): boolean {
    const sel = window.getSelection();
    if (!sel?.isCollapsed || !composerEl) return false;
    const { anchorNode, anchorOffset } = sel;
    if (anchorNode === composerEl) return anchorOffset === 0;
    if (anchorNode instanceof Text) {
      if (anchorOffset > 0) return false;
      let prev: Node | null = anchorNode.previousSibling;
      while (prev instanceof Text && prev.textContent === "") prev = prev.previousSibling;
      return prev == null;
    }
    return false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (
      e.key === "Backspace" &&
      !getComposerText() &&
      pendingAttachments.length > 0 &&
      composerCaretAtStart()
    ) {
      e.preventDefault();
      pendingAttachments = pendingAttachments.slice(0, -1);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      handleSubmit(e);
    }
  }

  function formatClosedAt(closedAt: number | undefined): string {
    if (closedAt == null) return "";
    try {
      return new Date(closedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
    } catch {
      return "";
    }
  }

  $effect(() => {
    if (
      messagesContainer &&
      ($activeSession?.messages.length || streamingContent || liveTurn)
    ) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  });

  $effect(() => {
    void liveTurn;
    queueMicrotask(() => {
      if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    });
  });
</script>

<svelte:window onpointerdown={onDocPointerDown} />

<div
  class="chat-pane"
  bind:this={chatRootEl}
  ondragover={handleChatDragOver}
  ondragleave={handleChatDragLeave}
  ondrop={(e) => void handleChatDrop(e)}
>
  {#if chatDropActive}
    <div class="chat-drop-overlay" aria-hidden="true">
      <span class="chat-drop-label">Drop to add as context</span>
    </div>
  {/if}
  <div class="messages" bind:this={messagesContainer}>
    <button
      type="button"
      class="messages-corner-btn"
      disabled={!$chat.historyPickerOpen && $chat.isStreaming}
      title={$chat.historyPickerOpen
        ? "Back to chat"
        : $chat.isStreaming
          ? "Wait for the reply to finish"
          : "Chat history"}
      aria-label={$chat.historyPickerOpen ? "Back to chat" : "Chat history"}
      aria-pressed={$chat.historyPickerOpen}
      onclick={() =>
        $chat.historyPickerOpen ? chat.closeHistoryPicker() : chat.openHistoryPicker()}
    >
      {#if $chat.historyPickerOpen}
        <MessageCircle size={18} strokeWidth={1.75} />
      {:else}
        <AppIcon name="long-arrow-left-down" size={18} />
      {/if}
    </button>
    {#if $chat.historyPickerOpen}
      <div class="history-browser">
        <div class="history-browser__head">
          <h2 class="history-browser__title">Chat history</h2>
        </div>
        {#if [...$chat.history].filter((h) => h.closedAt != null).length === 0}
          <p class="history-browser__empty">
            No closed chats yet. Close a tab with × to save it here.
          </p>
        {:else}
          <ul class="history-browser__list" aria-label="Closed chats">
            {#each [...$chat.history].filter((h) => h.closedAt != null).sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0)) as h (h.id)}
              <li>
                <button
                  type="button"
                  class="history-browser__item"
                  onclick={() => chat.reopenFromHistory(h.id)}
                >
                  <span class="history-browser__item-title">{h.title}</span>
                  {#if h.closedAt}
                    <span class="history-browser__item-meta">{formatClosedAt(h.closedAt)}</span>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {:else if ($activeSession?.messages.length ?? 0) === 0 && !$chat.isStreaming}
      <div class="empty-state">
        {#if $activeSession}
          <p class="start-hint">Start a conversation</p>
          <p class="hint">Ask me to help with your code — use the history button top-right.</p>
        {:else}
          <p class="start-hint">No open chat</p>
          <p class="hint">Use + in the tab bar for a new tab, or history top-right to reopen a closed chat.</p>
        {/if}
      </div>
    {:else}
      {#each groupAgentTurnsForDisplay($activeSession?.messages ?? [], $chat.isStreaming, Boolean(liveTurn)) as block (block.kind === "user" ? block.message.id : block.id)}
        {#if block.kind === "user" && block.message.compactionBoundary}
          {@const archived = $activeSession?.preCompactionMessages ?? []}
          {@const archivedCount = archived.filter(m => m.role === "user" && !m.compactionBoundary).length}
          {#if archiveExpanded && archived.length > 0}
            <div class="archive-messages">
              {#each archived as msg (msg.id)}
                {#if msg.role === "user" && !msg.compactionBoundary}
                  <div class="archive-msg archive-msg--user">{msg.content}</div>
                {:else if msg.role === "assistant" && msg.content}
                  <div class="archive-msg archive-msg--assistant">{msg.content}</div>
                {/if}
              {/each}
            </div>
          {/if}
          <div class="compaction-divider" role="separator">
            <span class="compaction-divider-line"></span>
            <div class="compaction-divider-center">
              {#if archived.length > 0}
                <button
                  type="button"
                  class="compaction-archive-btn"
                  onclick={() => (archiveExpanded = !archiveExpanded)}
                  aria-expanded={archiveExpanded}
                >
                  <span class="compaction-archive-chevron" class:compaction-archive-chevron--open={archiveExpanded}>▶</span>
                  {archivedCount} archived {archivedCount === 1 ? "message" : "messages"}
                </button>
                <span class="compaction-divider-sep">·</span>
                <button
                  type="button"
                  class="compaction-restore-btn"
                  onclick={() => { chat.revertCompaction(); archiveExpanded = false; }}
                >
                  Restore full context
                </button>
              {:else}
                <span class="compaction-divider-label">Context compacted</span>
              {/if}
            </div>
            <span class="compaction-divider-line"></span>
          </div>
        {:else if block.kind === "user"}
          {@const message = block.message}
          {@const expanded = userMessageExpanded[message.id] ?? false}
          <div
            class="message user user-message-slot"
            class:user-message-slot--editing={expanded}
          >
            <div
              class="message-user-composer composer-shell composer-shell--chromed"
              class:composer-shell--editing={expanded}
              data-chrome-state={userMessageChromeState(expanded, message.id)}
              onclick={() => {
                if (!expanded) expandUserMessage(message.id, message.content);
              }}
              onfocusin={() => {
                if (expanded) userMessageFocusId = message.id;
              }}
              onfocusout={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  userMessageFocusId = null;
                }
              }}
            >
              {#if expanded}
                <textarea
                  class="composer-textarea"
                  data-user-edit-id={message.id}
                  rows="3"
                  value={userMessageDraft[message.id] ?? message.content}
                  aria-label="Edit message"
                  onclick={(e) => e.stopPropagation()}
                  oninput={(e) => {
                    userMessageDraft = {
                      ...userMessageDraft,
                      [message.id]: e.currentTarget.value,
                    };
                  }}
                ></textarea>
              {:else}
                <div class="message-user-preview">{message.content}</div>
              {/if}
            </div>
            {#if expanded}
              <div
                class="message-user-actions"
                onclick={(e) => e.stopPropagation()}
                onkeydown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  class="message-ghost-btn"
                  onclick={() => collapseUserMessage(message.id)}
                  title="Collapse preview"
                >
                  Done
                </button>
                <button
                  type="button"
                  class="message-ghost-btn"
                  disabled={$chat.isStreaming || !(userMessageDraft[message.id] ?? message.content).trim()}
                  title="Rewind chat and files to here, then send edited message"
                  onclick={() => void resendFromUserMessage(message.id)}
                >
                  Resend
                </button>
                <span class="message-user-actions-spacer"></span>
                <button
                  type="button"
                  class="message-ghost-btn"
                  disabled={$chat.isStreaming}
                  title="Rewind files and chat to before this message; edit in the composer below"
                  onclick={() => void revertToUserMessage(message.id)}
                >
                  Revert
                </button>
              </div>
            {/if}
          </div>
        {:else}
          <div class="message assistant agent-turn">
            <AgentActivityFeed
              turn={block}
              workspacePath={$files.workspacePath ?? ""}
              thinkingOpen={thinkingOpen[thoughtSectionKey(block.id, "thought")] ?? false}
              planOpen={thinkingOpen[thoughtSectionKey(block.id, "plan")] ?? false}
              responseOpen={isResponseOpen(block.id)}
              isToolOpen={(toolId) => isToolOpen(block.id, toolId)}
              onToggleThinking={() => toggleThoughtSection(block.id, "thought")}
              onTogglePlan={() => toggleThoughtSection(block.id, "plan")}
              onToggleResponse={() => toggleResponseSection(block.id)}
              onToggleTool={(toolId) => toggleTool(block.id, toolId)}
              onOpenFile={(path) => void openToolFile(path)}
              onOpenFileDiff={(relPath, diffBase) => void openToolFileDiff(relPath, diffBase)}
            />
          </div>
        {/if}
      {/each}
    {/if}


    {#if $chat.isStreaming && liveTurn}
      {@const lt = liveTurn}
      <div class="message assistant agent-turn">
        <AgentActivityFeed
          turn={lt}
          workspacePath={$files.workspacePath ?? ""}
          streaming={true}
          thinkingOpen={thinkingOpen[thoughtSectionKey(lt.id, "thought")] ?? false}
          planOpen={thinkingOpen[thoughtSectionKey(lt.id, "plan")] ?? false}
          responseOpen={true}
          isToolOpen={(toolId) => isToolOpen(lt.id, toolId)}
          onToggleThinking={() => toggleThoughtSection(lt.id, "thought")}
          onTogglePlan={() => toggleThoughtSection(lt.id, "plan")}
          onToggleResponse={() => toggleResponseSection(lt.id)}
          onToggleTool={(toolId) => toggleTool(lt.id, toolId)}
          onOpenFile={(path) => void openToolFile(path)}
          onOpenFileDiff={(relPath, diffBase) => void openToolFileDiff(relPath, diffBase)}
        />
      </div>
    {/if}
  </div>

  {#if !$chat.historyPickerOpen}
  {#if pendingToolApproval}
    <div class="tool-approval-slot" role="dialog" aria-label="Tool approval">
      <div class="composer-shell tool-approval-shell">
        <div class="tool-approval-row">
          <span class="tool-approval-name" title={pendingToolApprovalTitle}>
            {pendingToolApproval.tool}
          </span>
          <div class="tool-approval-actions">
            <button type="button" class="tool-approval-deny-btn" onclick={denyToolApproval}>
              Deny
            </button>
            <div class="composer-model-wrap tool-approval-allow-wrap" bind:this={toolApprovalMenuAnchorEl}>
              <div class="tool-approval-allow-split">
                <button
                  type="button"
                  class="tool-approval-allow-main"
                  onclick={() => pickToolApprovalChoice("allow")}
                  title="Allow once"
                >
                  Allow
                </button>
                <button
                  type="button"
                  class="tool-approval-allow-caret"
                  onclick={toggleToolApprovalMenu}
                  aria-expanded={toolApprovalMenuOpen}
                  aria-haspopup="listbox"
                  aria-label="More allow options"
                  title="Allow options"
                >
                  <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
              {#if toolApprovalMenuOpen}
                <div class="model-popup tool-approval-popup" role="listbox" aria-label="Allow options">
                  <button
                    type="button"
                    role="option"
                    class="model-popup-option"
                    onclick={() => pickToolApprovalChoice("allow_always")}
                  >
                    Allow always
                  </button>
                </div>
              {/if}
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}
  {#if editingUserMessageId}
    <p class="rewind-hint" role="status">
      Editing an earlier message — Send rewinds chat and files to that point, then continues from
      your edit.
    </p>
  {/if}
  {#if rewindNotice || compactionNotice}
    <p class="rewind-notice" role="status">{rewindNotice ?? compactionNotice}</p>
  {/if}
  {#if lastUndoableUserMessageId() && !editingUserMessageId}
    <div class="undo-turn-row">
      <button
        type="button"
        class="btn ghost undo-turn-btn"
        disabled={undoingLastTurn}
        onclick={undoLastTurn}
        title="Undo last turn — restores files and puts your message back in the composer"
      >
        {undoingLastTurn ? "Undoing…" : "↩ Undo last turn"}
      </button>
    </div>
  {/if}
  {#if stepLimitNotice && !$chat.isStreaming}
    <div class="step-limit-notice" role="status">
      <span>Agent paused — reached the limit of {stepLimitNotice.limit} steps.</span>
      <button
        type="button"
        class="step-limit-continue"
        onclick={() => {
          const limit = stepLimitNotice!.limit;
          stepLimitNotice = null;
          chat.setStreaming(true);
          void runAgentLoop(limit);
        }}
      >Continue for {stepLimitNotice.limit} more steps</button>
      <button
        type="button"
        class="step-limit-stop"
        onclick={() => { stepLimitNotice = null; }}
      >Stop here</button>
    </div>
  {/if}
  {#if usageLevel() === "critical" && !overflowWarningDismissed}
    <div class="context-overflow-warning" role="alert">
      <span>⚠ Context almost full — consider compacting or starting a new chat.</span>
      <button
        type="button"
        class="compact-now"
        onclick={requestManualCompaction}
        disabled={compactButtonInactive}
        title={compactButtonTitle}
      >{$settings.agentCompaction.enabled ? "Compact now" : "Compaction off"}</button>
      <button
        type="button"
        class="dismiss"
        aria-label="Dismiss"
        onclick={() => { overflowWarningDismissed = true; lastDismissedAtLevel = "critical"; }}
      >×</button>
    </div>
  {/if}
  <form
    class="input-area composer-form"
    onsubmit={handleSubmit}
    onfocusin={() => (composerFocused = true)}
    onfocusout={(e) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
        composerFocused = false;
      }
    }}
  >
    <div
      class="composer-shell composer-shell--chromed"
      data-chrome-state={composerChromeState}
      onpointerdown={collapseAllHistoryEdits}
    >
      {#if pendingAttachments.length > 0}
        <div class="composer-attachments" role="list" aria-label="Attachments">
          {#each pendingAttachments as att, i (i)}
            {@const label = attachmentChipLabel(att)}
            {@const kind = attachmentChipKind(att)}
            <span class="attachment-chip" data-kind={kind} role="listitem">
              <button
                type="button"
                class="attachment-chip-main"
                title={att.name}
                aria-label={`Open ${label}`}
                onclick={() => void openAttachmentTarget(att)}
              >
                <span class="attachment-chip-icon" aria-hidden="true">
                  {#if kind === "element"}
                    <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M5.5 4.5 2 8l3.5 3.5" />
                      <path d="M10.5 4.5 14 8l-3.5 3.5" />
                    </svg>
                  {:else}
                    <FileIcon name={label.replace(/\/$/, "")} isDir={kind === "dir"} size={12} />
                  {/if}
                </span>
                <span class="attachment-chip-name">{label}</span>
              </button>
              <button
                type="button"
                class="attachment-chip-remove"
                aria-label={`Remove ${label}`}
                onclick={(e) => {
                  e.stopPropagation();
                  removeAttachment(i);
                }}
              >×</button>
            </span>
          {/each}
        </div>
      {/if}
      <div
        class="composer-textarea"
        class:composer-textarea--with-attachments={pendingAttachments.length > 0}
        contenteditable="true"
        role="textbox"
        aria-multiline="true"
        aria-label="Message input"
        tabindex="0"
        data-placeholder="Plan, search, build anything…"
        data-empty={!inputValue.trim() ? "true" : undefined}
        bind:this={composerEl}
        oninput={onComposerInput}
        onkeydown={handleKeydown}
        onfocus={collapseAllHistoryEdits}
        onpaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData?.getData("text/plain") ?? "";
          document.execCommand("insertText", false, text);
        }}
      ></div>
      <div class="composer-toolbar">
        <div class="composer-mode-wrap" bind:this={modeMenuAnchorEl}>
          <button
            type="button"
            class="composer-mode-btn"
            class:composer-mode-btn--chat={$currentMode === "chat"}
            class:composer-mode-btn--plan={$currentMode === "plan"}
            class:composer-mode-btn--agent={$currentMode === "agent"}
            onclick={toggleModeMenu}
            aria-expanded={modeMenuOpen}
            aria-haspopup="listbox"
            title="Choose mode"
          >
            <span class="composer-mode-icon" aria-hidden="true">
              {#if $currentMode === "chat"}
                <MessageCircle size={13} strokeWidth={1.75} />
              {:else if $currentMode === "plan"}
                <ListChecks size={13} strokeWidth={1.75} />
              {:else}
                <Bot size={13} strokeWidth={1.75} />
              {/if}
            </span>
            <span class="composer-mode-label">{MODE_CONFIG[$currentMode].label}</span>
            <span class="composer-mode-chevron" aria-hidden="true">
              <ChevronDown size={12} strokeWidth={1.75} />
            </span>
          </button>
          {#if modeMenuOpen}
            <div class="mode-popup" role="listbox" aria-label="Choose mode">
              {#each (["chat", "plan", "agent"] as ChatMode[]) as mode (mode)}
                <button
                  type="button"
                  role="option"
                  class="mode-popup-option"
                  class:mode-popup-option--current={$currentMode === mode}
                  class:mode-popup-option--chat={mode === "chat"}
                  class:mode-popup-option--plan={mode === "plan"}
                  class:mode-popup-option--agent={mode === "agent"}
                  aria-selected={$currentMode === mode}
                  onclick={() => pickMode(mode)}
                >
                  <span class="mode-option-icon" aria-hidden="true">
                    {#if mode === "chat"}
                      <MessageCircle size={14} strokeWidth={1.75} />
                    {:else if mode === "plan"}
                      <ListChecks size={14} strokeWidth={1.75} />
                    {:else}
                      <Bot size={14} strokeWidth={1.75} />
                    {/if}
                  </span>
                  <span class="mode-option-text">
                    <span class="mode-option-label">{MODE_CONFIG[mode].label}</span>
                    <span class="mode-option-desc">{MODE_CONFIG[mode].description}</span>
                  </span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
        <div class="composer-model-wrap" bind:this={modelMenuAnchorEl}>
          <button
            type="button"
            class="composer-model-btn"
            onclick={toggleModelMenu}
            aria-expanded={modelMenuOpen}
            aria-haspopup="listbox"
            title="Choose model"
          >
            <span class="composer-model-label">{modelTriggerLabel}</span>
            <ChevronDown size={12} strokeWidth={1.75} aria-hidden="true" />
          </button>
          {#if modelMenuOpen}
            <div
              class="model-popup"
              role="listbox"
              aria-label="Choose model"
              bind:this={modelMenuPopupEl}
              use:portal
              use:floatingPanel={{ getAnchor: () => modelMenuAnchorEl }}
            >
              <div class="model-popup-section">
                <div class="model-popup-section-head">
                  <span>Ollama</span>
                  <div class="model-popup-actions">
                    <button
                      type="button"
                      class="model-popup-action-btn"
                      onclick={() => refreshOllamaModelsFromHost()}
                      title="Refresh Ollama models"
                      aria-label="Refresh Ollama models"
                    >
                      <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      class="model-popup-action-btn"
                      onclick={() => {
                        modelMenuOpen = false;
                        onOpenSettings?.();
                      }}
                      title="Provider settings"
                      aria-label="Provider settings"
                    >
                      <Settings size={14} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {#if showOllamaInModelMenu && ollamaMenuRows.length > 0}
                  {#each ollamaMenuRows as row (row.id)}
                    <button
                      type="button"
                      role="option"
                      class="model-popup-option"
                      class:model-popup-option--current={$settings.chatBackend === "ollama" &&
                        $settings.selectedModel === row.id}
                      aria-selected={$settings.chatBackend === "ollama" && $settings.selectedModel === row.id}
                      onclick={() => pickOllamaModel(row.id)}
                    >
                      {row.name}
                    </button>
                  {/each}
                {:else}
                  <span class="model-popup-unavailable">No models available</span>
                {/if}
              </div>
              <div class="model-popup-section">
                <div class="model-popup-section-head">
                  <span>llama.cpp</span>
                </div>
                {#if $settings.llamacppModels.length > 0}
                  {#each $settings.llamacppModels as row (row.id)}
                    <button
                      type="button"
                      role="option"
                      class="model-popup-option"
                      class:model-popup-option--current={$settings.chatBackend === "llamacpp" &&
                        $settings.selectedModel === row.id}
                      aria-selected={$settings.chatBackend === "llamacpp" && $settings.selectedModel === row.id}
                      onclick={() => pickLlamacppModelRow(row.id)}
                    >
                      {row.name}
                    </button>
                  {/each}
                {:else}
                  <span class="model-popup-unavailable">No models available</span>
                {/if}
              </div>
              <div class="model-popup-section">
                <div class="model-popup-section-head">
                  <span>Anthropic</span>
                </div>
                {#if showAnthropicInModelMenu && anthropicMenuRows.length > 0}
                  {#each anthropicMenuRows as row (row.id)}
                    <button
                      type="button"
                      role="option"
                      class="model-popup-option"
                      class:model-popup-option--current={$settings.chatBackend === "anthropic" &&
                        $settings.selectedModel === row.id}
                      aria-selected={$settings.chatBackend === "anthropic" && $settings.selectedModel === row.id}
                      onclick={() => pickAnthropicModelRow(row.id)}
                    >
                      {row.name}
                    </button>
                  {/each}
                {:else}
                  <span class="model-popup-unavailable">No models available</span>
                {/if}
              </div>
              <div class="model-popup-section">
                <div class="model-popup-section-head">
                  <span>DeepSeek</span>
                </div>
                {#if showDeepseekInModelMenu && deepseekMenuRows.length > 0}
                  {#each deepseekMenuRows as row (row.id)}
                    <button
                      type="button"
                      role="option"
                      class="model-popup-option"
                      class:model-popup-option--current={$settings.chatBackend === "deepseek" &&
                        $settings.selectedModel === row.id}
                      aria-selected={$settings.chatBackend === "deepseek" && $settings.selectedModel === row.id}
                      onclick={() => pickDeepseekModelRow(row.id)}
                    >
                      {row.name}
                    </button>
                  {/each}
                {:else}
                  <span class="model-popup-unavailable">No models available</span>
                {/if}
              </div>
              <div class="model-popup-section">
                <div class="model-popup-section-head">
                  <span>GLM</span>
                </div>
                {#if showGlmInModelMenu && glmMenuRows.length > 0}
                  {#each glmMenuRows as row (row.id)}
                    <button
                      type="button"
                      role="option"
                      class="model-popup-option"
                      class:model-popup-option--current={$settings.chatBackend === "glm" &&
                        $settings.selectedModel === row.id}
                      aria-selected={$settings.chatBackend === "glm" && $settings.selectedModel === row.id}
                      onclick={() => pickGlmModelRow(row.id)}
                    >
                      {row.name}
                    </button>
                  {/each}
                {:else}
                  <span class="model-popup-unavailable">No models available</span>
                {/if}
              </div>
              <div class="model-popup-section">
                <div class="model-popup-section-head">
                  <span>Kimi</span>
                </div>
                {#if showKimiInModelMenu && kimiMenuRows.length > 0}
                  {#each kimiMenuRows as row (row.id)}
                    <button
                      type="button"
                      role="option"
                      class="model-popup-option"
                      class:model-popup-option--current={$settings.chatBackend === "kimi" &&
                        $settings.selectedModel === row.id}
                      aria-selected={$settings.chatBackend === "kimi" && $settings.selectedModel === row.id}
                      onclick={() => pickKimiModelRow(row.id)}
                    >
                      {row.name}
                    </button>
                  {/each}
                {:else}
                  <span class="model-popup-unavailable">No models available</span>
                {/if}
              </div>
              {#if lastTokPerSec != null && lastTokPerSec > 0}
                <p class="model-popup-foot">
                  Last reply · {lastTokPerSec >= 100
                    ? Math.round(lastTokPerSec)
                    : lastTokPerSec >= 10
                      ? lastTokPerSec.toFixed(1)
                      : lastTokPerSec.toFixed(2)} tok/s
                </p>
              {/if}
            </div>
          {/if}
        </div>
        <span class="composer-toolbar-spacer"></span>
        <div class="composer-tool-cluster">
          {#if $chat.isStreaming}
            <button
              type="button"
              class="composer-tool-btn workbench-icon-btn"
              onclick={() => void cancelChatRequest()}
              title="Stop generating"
              aria-label="Stop generating"
            >
              <AppIcon name="pause" size={17} />
            </button>
          {:else}
            <input
              bind:this={attachInputEl}
              type="file"
              class="composer-file-input"
              onchange={onAttachChange}
            />
            <button
              type="button"
              class="composer-tool-btn workbench-icon-btn"
              onclick={() => attachInputEl?.click()}
              title="Attach file"
              aria-label="Attach file"
            >
              <AppIcon name="attachment" size={17} />
            </button>
            {#if inputValue.trim()}
              <button
                type="submit"
                class="composer-tool-btn workbench-icon-btn"
                disabled={!ollamaChatReady}
                title="Send"
                aria-label="Send message"
              >
                <AppIcon name="arrow-up-circle" size={17} />
              </button>
            {:else}
              <button
                type="button"
                class="composer-tool-btn workbench-icon-btn"
                onclick={toggleDictation}
                title={speechListening ? "Stop dictation" : "Speech to text"}
                aria-label={speechListening ? "Stop dictation" : "Speech to text"}
                aria-pressed={speechListening}
              >
                <AppIcon name="microphone" size={17} />
              </button>
            {/if}
          {/if}
        </div>
      </div>
    </div>
  </form>

  <div class="context-footer" aria-label={footerAriaLabel()}>
    {#if footerProfile().showContextBar}
      {@const bd = contextBreakdown()}
      {@const cw = bd.contextWindow}
      {@const seg = (n: number) => cw > 0 ? Math.min(100, (n / cw) * 100) : 0}
      {@const level = usageLevel()}
      <div
        class="context-bar"
        class:context-bar--warning={level === "warning"}
        class:context-bar--critical={level === "critical"}
        class:context-bar--active={contextPanelOpen}
        role="button"
        tabindex="0"
        aria-label="Context usage breakdown"
        aria-expanded={contextPanelOpen}
        onmouseenter={() => (showBreakdown = true)}
        onmouseleave={() => (showBreakdown = false)}
        onfocus={() => (showBreakdown = true)}
        onblur={() => (showBreakdown = false)}
        onclick={() => (contextPanelOpen = !contextPanelOpen)}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); contextPanelOpen = !contextPanelOpen; } }}
      >
        <div class="context-bar-track">
          {#if level === "healthy"}
            {#each bd.sections.filter(s => s.tokenEstimate > 0) as section (section.id)}
              <div class="context-seg" style="width: {seg(section.tokenEstimate)}%; background: {getSectionColor(section.id)};"></div>
            {/each}
            {#if bd.toolSchemaTokens > 0}
              <div class="context-seg context-seg--tools" style="width: {seg(bd.toolSchemaTokens)}%"></div>
            {/if}
            <div class="context-seg context-seg--history" style="width: {seg(bd.historyTokens)}%"></div>
          {:else}
            <div class="context-bar-fill" style="width: {Math.min(100, contextPct())}%"></div>
          {/if}
        </div>
      </div>
      {#if showBreakdown && !contextPanelOpen}
        <div class="context-breakdown-popover" role="tooltip">
          <div class="breakdown-title">Context breakdown</div>
          <div class="breakdown-group">
            <div class="breakdown-row breakdown-row--header">
              <span class="breakdown-dot breakdown-dot--system"></span>
              <span class="breakdown-label">System prompt</span>
              <span class="breakdown-tok">{formatTok(bd.systemTokens)} tok</span>
            </div>
            {#each bd.sections.filter(s => s.tokenEstimate > 0) as section (section.id)}
              <div class="breakdown-row breakdown-row--sub">
                <span class="breakdown-label">{section.label}</span>
                <span class="breakdown-tok">{formatTok(section.tokenEstimate)}</span>
              </div>
            {/each}
          </div>
          {#if bd.toolSchemaTokens > 0}
            <div class="breakdown-group">
              <div class="breakdown-row breakdown-row--header">
                <span class="breakdown-dot breakdown-dot--tools"></span>
                <span class="breakdown-label">Tool schemas</span>
                <span class="breakdown-tok">{formatTok(bd.toolSchemaTokens)} tok</span>
              </div>
            </div>
          {/if}
          <div class="breakdown-group">
            <div class="breakdown-row breakdown-row--header">
              <span class="breakdown-dot breakdown-dot--history"></span>
              <span class="breakdown-label">Chat history</span>
              <span class="breakdown-tok">{formatTok(bd.historyTokens)} tok</span>
            </div>
          </div>
          <div class="breakdown-divider"></div>
          <div class="breakdown-row breakdown-row--total">
            <span class="breakdown-label">Used</span>
            <span class="breakdown-tok">~{formatTok(bd.total)} / {formatTok(cw)} tok</span>
          </div>
          <div class="breakdown-row breakdown-row--reserve">
            <span class="breakdown-label">Reply reserve</span>
            <span class="breakdown-tok">{formatTok(bd.reserveTokens)} tok</span>
          </div>
        </div>
      {/if}
      {#if contextPanelOpen}
        {@const bd = contextBreakdown()}
        {@const cw = bd.contextWindow}
        <div class="context-panel" role="dialog" aria-label="Context breakdown">
          <div class="context-panel-header">
            <button
              class="context-panel-close"
              onclick={() => (contextPanelOpen = false)}
              aria-label="Close context panel"
            >×</button>
            <span class="context-panel-title">Context</span>
            <span class="context-panel-usage">~{formatTok(bd.total)} / {formatTok(cw)} tok</span>
          </div>
          <div class="context-panel-body">
            <div class="cpanel-group">
              <div class="cpanel-row cpanel-row--header">
                <span class="cpanel-label">System prompt</span>
                <span class="cpanel-tok">{formatTok(bd.systemTokens)} tok</span>
              </div>
              {#each bd.sections.filter(s => s.tokenEstimate > 0) as section (section.id)}
                {@const filePath = getSectionFilePath(section)}
                {@const promptFiles = section.id === 'system-prompts' ? getActivePromptFiles() : null}
                {@const isDropdown = promptFiles !== null && promptFiles.length > 1}
                {@const isExpanded = expandedSectionId === section.id}
                <button
                  type="button"
                  class="cpanel-row cpanel-row--sub cpanel-row--clickable"
                  onclick={() => {
                    if (isDropdown) {
                      expandedSectionId = isExpanded ? null : section.id;
                    } else if (filePath) {
                      void openSectionFile(filePath);
                    } else {
                      openBuiltinSection(section.id, section.label, section.text);
                    }
                  }}
                >
                  <span class="cpanel-dot" style="background: {getSectionColor(section.id)}" aria-hidden="true"></span>
                  <span class="cpanel-label">{section.label}</span>
                  <span class="cpanel-tok">{formatTok(section.tokenEstimate)} tok</span>
                  {#if isDropdown}
                    <span class="cpanel-chevron" aria-hidden="true">{isExpanded ? '▾' : '▸'}</span>
                  {:else}
                    <span class="cpanel-open-icon" aria-hidden="true">→</span>
                  {/if}
                </button>
                {#if isExpanded && isDropdown && promptFiles}
                  {#each promptFiles as pf (pf.filename)}
                    <button
                      type="button"
                      class="cpanel-row cpanel-row--file"
                      onclick={() => void openSectionFile(pf.path)}
                    >
                      <span class="cpanel-label">{pf.label}</span>
                      <span class="cpanel-open-icon cpanel-open-icon--show" aria-hidden="true">→</span>
                    </button>
                  {/each}
                {/if}
              {/each}
            </div>
            {#if bd.toolSchemaTokens > 0}
              <div class="cpanel-group">
                <div class="cpanel-row cpanel-row--header">
                  <span class="cpanel-dot" style="background: {contextBarColors.toolSchemas}" aria-hidden="true"></span>
                  <span class="cpanel-label">Tool schemas</span>
                  <span class="cpanel-tok">{formatTok(bd.toolSchemaTokens)} tok</span>
                </div>
              </div>
            {/if}
            <div class="cpanel-group">
              <button
                type="button"
                class="cpanel-row cpanel-row--header cpanel-row--clickable"
                onclick={openChatHistory}
              >
                <span class="cpanel-dot" style="background: {contextBarColors.chatHistory}" aria-hidden="true"></span>
                <span class="cpanel-label">Chat history</span>
                <span class="cpanel-tok">{formatTok(bd.historyTokens)} tok</span>
                <span class="cpanel-open-icon" aria-hidden="true">→</span>
              </button>
            </div>
            <div class="cpanel-divider"></div>
            <div class="cpanel-row cpanel-row--total">
              <span class="cpanel-label">Used</span>
              <span class="cpanel-tok">~{formatTok(bd.total)} / {formatTok(cw)} tok</span>
            </div>
            <div class="cpanel-row cpanel-row--reserve">
              <span class="cpanel-label">Reply reserve</span>
              <span class="cpanel-tok">{formatTok(bd.reserveTokens)} tok</span>
            </div>
          </div>
        </div>
      {/if}
    {/if}
    <div class="context-meta">
      <div class="context-meta-start">
        {#if footerProfile().showMonthlyUsage}
          <button
            type="button"
            class="context-monthly-usage"
            class:context-monthly-usage--balance={footerUsageView === "balance"}
            title={footerUsageTitle()}
            aria-pressed={footerUsageView === "balance"}
            onclick={() => void toggleFooterUsageView()}
          >
            {monthlyUsageLabel()}
          </button>
        {/if}
        {#if footerProfile().showStreamMetrics}
          <span
            class="context-chat-tok"
            title="Output speed, token count, and duration for the last completed reply"
            aria-label="Last reply: tokens per second, output tokens, and completion time"
          >
            {lastReplyFooterLabel()}
          </span>
        {/if}
      </div>
      <div class="context-budget-row">
        <div class="context-budget-wrap" bind:this={contextBudgetMenuEl}>
          {#if footerProfile().contextBudgetEditable}
            <button
              type="button"
              class="context-numbers"
              class:context-numbers--warning={usageLevel() === "warning"}
              class:context-numbers--critical={usageLevel() === "critical"}
              onclick={toggleContextBudgetMenu}
              aria-expanded={contextBudgetMenuOpen}
              aria-haspopup="listbox"
            title={footerProfile().showMonthlyUsage
              ? cloudContextBudgetTitle(maxContextTokens(), $settings.chatBackend)
              : contextBudgetTitle(footerProfile(), $settings.chatBackend)}
          >
            <span class="context-numbers-text"
              >~{formatTok(contextUsed())} / {formatTok(maxContextTokens())} tok</span
            >
            </button>
            {#if contextBudgetMenuOpen}
              <div class="context-budget-menu" role="listbox" aria-label="Context budget">
                {#each contextBudgetOptions() as opt (opt)}
                  <button
                    type="button"
                    role="option"
                    class="context-budget-option"
                    class:current={opt === maxContextTokens()}
                    aria-selected={opt === maxContextTokens()}
                    onclick={() => pickContextBudgetOption(opt)}
                  >
                    {formatTok(opt)} tok
                  </button>
                {/each}
              </div>
            {/if}
          {:else}
            <span
              class="context-numbers context-numbers--static"
              class:context-numbers--warning={usageLevel() === "warning"}
              class:context-numbers--critical={usageLevel() === "critical"}
            title={footerProfile().showMonthlyUsage
              ? cloudContextBudgetTitle(maxContextTokens(), $settings.chatBackend)
              : contextBudgetTitle(footerProfile(), $settings.chatBackend)}
          >
            <span class="context-numbers-text">
              ~{formatTok(contextUsed())} / {formatTok(maxContextTokens())} tok{#if footerProfile().contextHint}
                  <span class="context-hint"> · {footerProfile().contextHint}</span>{/if}
              </span>
            </span>
          {/if}
        </div>
        <button
          type="button"
          class="context-compact-btn"
          class:context-compact-btn--inactive={compactButtonInactive}
          aria-disabled={compactButtonInactive}
          title={compactButtonTitle}
          aria-label={compactButtonTitle}
          onclick={() => requestManualCompaction()}
        >
          <AppIcon name="circle-spark" size={14} />
        </button>
      </div>
    </div>
  </div>
  {/if}
</div>

<style>
  .chat-pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    border-radius: inherit;
    background: var(--workbench-panel-bg, var(--chat-panel-bg, var(--sidebar)));
    position: relative;
  }

  .chat-drop-overlay {
    position: absolute;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.45);
    border: 2px dashed rgba(255, 255, 255, 0.25);
    border-radius: inherit;
    pointer-events: none;
  }

  .chat-drop-label {
    font-size: 14px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.75);
    letter-spacing: 0.01em;
  }

  .tool-approval-slot {
    flex-shrink: 0;
    padding: 0 10px 6px;
    position: relative;
    overflow: visible;
  }

  .tool-approval-shell {
    border-color: #007acc;
  }

  .tool-approval-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    min-height: 30px;
  }

  .tool-approval-name {
    flex: 1;
    min-width: 0;
    font-size: 11px;
    font-weight: 500;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: #d4d4d4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tool-approval-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .tool-approval-deny-btn {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border: none;
    border-radius: 6px;
    background: rgba(244, 135, 113, 0.15);
    color: #f48771;
    font-size: 11px;
    font-weight: 500;
    line-height: 1.2;
    cursor: pointer;
    white-space: nowrap;
  }

  .tool-approval-deny-btn:hover {
    background: rgba(244, 135, 113, 0.28);
  }

  .tool-approval-allow-wrap {
    max-width: none;
  }

  .tool-approval-allow-split {
    display: inline-flex;
    align-items: stretch;
    border-radius: 6px;
    overflow: hidden;
    background: rgba(78, 201, 176, 0.15);
  }

  .tool-approval-allow-main,
  .tool-approval-allow-caret {
    display: inline-flex;
    align-items: center;
    border: none;
    background: transparent;
    color: #4ec9b0;
    font-size: 11px;
    font-weight: 500;
    line-height: 1.2;
    cursor: pointer;
  }

  .tool-approval-allow-main {
    padding: 3px 10px 3px 8px;
    white-space: nowrap;
  }

  .tool-approval-allow-main:hover {
    background: rgba(78, 201, 176, 0.22);
    color: #6dd4bf;
  }

  .tool-approval-allow-caret {
    padding: 3px 6px;
    border-left: 1px solid rgba(78, 201, 176, 0.35);
  }

  .tool-approval-allow-caret:hover {
    background: rgba(78, 201, 176, 0.28);
    color: #6dd4bf;
  }

  .tool-approval-allow-caret :global(svg) {
    width: 11px;
    height: 11px;
  }

  .tool-approval-popup {
    bottom: calc(100% + 6px);
    top: auto;
    right: 0;
    left: auto;
    min-width: 140px;
  }

  .messages {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 16px;
    min-height: 0;
    min-width: 0;
    align-items: stretch;
  }

  .messages-corner-btn {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 3;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--workbench-icon-btn-size, 32px);
    height: var(--workbench-icon-btn-size, 32px);
    padding: 0;
    border: none;
    border-radius: 9999px;
    background: var(--secondary);
    color: var(--muted-foreground);
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  }

  .messages-corner-btn:hover:not(:disabled) {
    background: var(--muted);
    color: var(--foreground);
  }

  .messages-corner-btn[aria-pressed="true"] {
    background: var(--muted);
    color: var(--foreground);
  }

  .messages-corner-btn :global(svg) {
    width: var(--workbench-icon-btn-icon-size, 18px);
    height: var(--workbench-icon-btn-icon-size, 18px);
  }

  .messages-corner-btn:focus-visible {
    outline: 1px solid var(--ring);
    outline-offset: 1px;
  }

  .messages-corner-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .history-browser {
    display: flex;
    flex-direction: column;
    align-self: center;
    gap: 12px;
    height: 100%;
    min-height: 0;
    max-width: 36rem;
    width: 100%;
    text-align: left;
  }

  .history-browser__head {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 12px;
    flex-shrink: 0;
    padding-right: 28px;
  }

  .history-browser__title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--foreground);
  }

  .history-browser__empty {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--muted-foreground);
  }

  .history-browser__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
    min-height: 0;
    flex: 1;
  }

  .history-browser__item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    width: 100%;
    padding: 10px 12px;
    text-align: left;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--secondary);
    color: var(--foreground);
    font-size: 13px;
    cursor: pointer;
  }

  .history-browser__item:hover {
    background: var(--muted);
  }

  .history-browser__item-title {
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }

  .history-browser__item-meta {
    font-size: 11px;
    color: var(--muted-foreground);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-self: center;
    align-items: stretch;
    justify-content: center;
    height: 100%;
    min-height: 120px;
    color: #808080;
    text-align: center;
    gap: 16px;
    max-width: 320px;
    width: 100%;
  }

  .start-hint {
    font-size: 14px;
    color: #a0a0a0;
    margin: 0;
  }

  .empty-state .hint {
    font-size: 12px;
    margin: 0;
    color: #707070;
  }

  .message {
    position: relative;
    margin-bottom: 8px;
    border-radius: 6px;
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
  }

  .compaction-divider {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    margin: 14px 0;
    user-select: none;
  }

  .compaction-divider-line {
    flex: 1;
    height: 1px;
    background: color-mix(in srgb, var(--border, #4c4c4c) 70%, transparent);
  }

  .compaction-divider-center {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .compaction-divider-label {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.02em;
    color: var(--muted-foreground, #808080);
  }

  .compaction-divider-sep {
    font-size: 11px;
    color: var(--muted-foreground, #808080);
  }

  .compaction-archive-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    border: none;
    background: none;
    font-size: 11px;
    font-weight: 500;
    color: var(--muted-foreground, #808080);
    cursor: pointer;
    letter-spacing: 0.02em;
  }

  .compaction-archive-btn:hover {
    color: var(--foreground);
  }

  .compaction-archive-chevron {
    font-size: 8px;
    display: inline-block;
    transition: transform 0.15s ease;
  }

  .compaction-archive-chevron--open {
    transform: rotate(90deg);
  }

  .compaction-restore-btn {
    padding: 0;
    border: none;
    background: none;
    font-size: 11px;
    font-weight: 500;
    color: #569cd6;
    cursor: pointer;
    letter-spacing: 0.02em;
  }

  .compaction-restore-btn:hover {
    color: #9cdcfe;
  }

  .archive-messages {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 0;
    opacity: 0.45;
    pointer-events: none;
    user-select: text;
  }

  .archive-msg {
    font-size: 12px;
    line-height: 1.5;
    padding: 4px 10px;
    border-radius: 6px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .archive-msg--user {
    align-self: flex-end;
    background: color-mix(in srgb, var(--foreground, #d4d4d4) 8%, transparent);
    max-width: 85%;
  }

  .archive-msg--assistant {
    align-self: flex-start;
    color: var(--muted-foreground, #808080);
    max-width: 90%;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
  }

  .message.user-message-slot {
    align-self: stretch;
    width: 100%;
    padding: 0;
    background: transparent;
    border: none;
    outline: none;
  }

  .message.user-message-slot--editing {
    padding-bottom: 28px;
  }

  .message-user-composer.composer-shell--chromed {
    width: 100%;
    cursor: pointer;
  }

  .message-user-composer.composer-shell--editing {
    cursor: text;
  }

  .message-user-composer:not(.composer-shell--editing):focus,
  .message-user-composer:not(.composer-shell--editing):focus-visible {
    outline: none;
  }

  .message-user-preview {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    overflow: hidden;
    box-sizing: border-box;
    width: 100%;
    margin: 0;
    padding: 10px 12px 8px;
    font-family: inherit;
    font-size: 12px;
    line-height: 1.45;
    color: #d4d4d4;
    white-space: pre-wrap;
    word-break: break-word;
    pointer-events: none;
    user-select: none;
  }

  .message-user-composer.composer-shell {
    min-height: 4.25rem;
  }

  .message-user-composer .composer-textarea {
    resize: none;
  }

  .message-user-actions {
    position: absolute;
    bottom: 6px;
    left: 10px;
    right: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .message-user-actions-spacer {
    flex: 1;
    min-width: 0;
  }

  .message-ghost-btn {
    flex-shrink: 0;
    padding: 0;
    margin: 0;
    border: none;
    background: transparent;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.02em;
    color: var(--muted-foreground);
    cursor: pointer;
    text-decoration: none;
  }

  .message-ghost-btn:disabled {
    opacity: 0.85;
    cursor: default;
  }

  .message.agent-turn {
    align-self: stretch;
    padding: 8px 10px;
    background: transparent;
    border: none;
  }

  .message.agent-turn:has(.activity-waiting) {
    padding: 0;
    margin-bottom: 4px;
  }

  .message.assistant.tool-only-round {
    padding: 4px 0;
    background: transparent;
    border: none;
  }

  .message.tool {
    margin-bottom: 6px;
    padding: 0;
    background: transparent;
    border: none;
  }

  .tool-round-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 2px 0;
  }

  .tool-call-chip {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 10px;
    color: #4ec9b0;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, #4ec9b0 35%, var(--border));
    background: color-mix(in srgb, #4ec9b0 8%, var(--background));
  }

  .message.assistant .message-content {
    font-size: 11px;
    line-height: 1.45;
    color: var(--foreground);
  }

  .message-content {
    display: block;
    max-width: 100%;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .tool-call {
    margin-top: 6px;
    padding: 6px 8px;
    background: var(--background);
    border-radius: 4px;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 10px;
    min-width: 0;
    max-width: 100%;
  }

  .tool-result-block {
    margin-top: 4px;
    padding: 8px;
    background: var(--background);
    border-radius: 4px;
    border-left: 2px solid #4ec9b0;
    min-width: 0;
    max-width: 100%;
  }

  .tool-result {
    margin-top: 6px;
    font-size: 11px;
    max-height: 240px;
    overflow: auto;
  }

  .tool-name {
    font-family: monospace;
    color: #4ec9b0;
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .tool-status {
    color: #808080;
  }

  .thinking-live {
    margin: 0 8px 8px;
    border: 1px solid #3c3c3c;
    border-radius: 6px;
    background: #1a1a1b;
    overflow: hidden;
    max-width: 100%;
  }

  .thinking-live-head {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #858585;
    padding: 5px 8px;
    border-bottom: 1px solid #2d2d30;
    background: var(--workbench-panel-bg, var(--chat-panel-bg, var(--sidebar)));
  }

  .thinking-live-body {
    max-height: 120px;
    overflow-y: auto;
    padding: 8px 10px;
    font-size: 11px;
    line-height: 1.45;
    color: #9d9d9d;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  }

  .thinking-archive {
    margin: 4px 0 8px;
    border-radius: 4px;
    border: 1px solid #3c3c3c;
    background: #1e1e1e;
    font-size: 12px;
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
  }

  .thinking-archive-summary {
    cursor: pointer;
    padding: 6px 10px;
    color: #858585;
    font-weight: 500;
    list-style: none;
  }

  .thinking-archive-summary::-webkit-details-marker {
    display: none;
  }

  .thinking-archive-body {
    margin: 0;
    padding: 0 10px 10px;
    max-height: 160px;
    overflow-x: hidden;
    overflow-y: auto;
    font-size: 11px;
    line-height: 1.45;
    color: #a0a0a0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  }

  .rewind-hint,
  .rewind-notice {
    margin: 0;
    padding: 6px 12px 0;
    font-size: 11px;
    line-height: 1.4;
    flex-shrink: 0;
  }

  .rewind-hint {
    color: var(--muted-foreground);
  }

  .rewind-notice {
    color: var(--warning, #e0a060);
  }

  .undo-turn-row {
    display: flex;
    justify-content: flex-start;
    padding: 4px 10px 0;
    flex-shrink: 0;
  }

  .undo-turn-btn {
    font-size: 11px;
    color: var(--muted-foreground);
    padding: 2px 6px;
    border-radius: 4px;
    opacity: 0.7;
    transition: opacity 0.15s;
  }

  .undo-turn-btn:hover:not(:disabled) {
    opacity: 1;
    color: var(--foreground);
  }

  .input-area.composer-form {
    padding: 8px 10px 10px;
    border-top: 1px solid transparent;
    flex-shrink: 0;
    position: relative;
    overflow: visible;
  }

  .composer-shell {
    display: flex;
    flex-direction: column;
    gap: 0;
    border-radius: 8px;
    border: 1px solid transparent;
    background: var(--chat-message-box-bg, var(--workbench-control-bg, var(--secondary)));
    overflow: visible;
  }

  /* Composer chrome: message-box fill + 1px border (idle / focused / streaming rainbow). */
  .composer-shell--chromed {
    --composer-chrome-fill: var(--chat-message-box-bg, var(--workbench-control-bg, #2d2d30));
    position: relative;
    background: var(--composer-chrome-fill);
    border: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .composer-shell--chromed[data-chrome-state="idle"]:hover {
    border-color: color-mix(in srgb, var(--muted-foreground) 45%, var(--border));
  }

  .composer-shell--chromed[data-chrome-state="focused"] {
    border-color: var(--primary, #007acc);
    box-shadow: none;
  }

  .composer-shell--chromed[data-chrome-state="working"] {
    border: 1px solid transparent;
    background:
      linear-gradient(var(--composer-chrome-fill), var(--composer-chrome-fill)) padding-box,
      linear-gradient(
          90deg,
          #ff6b9d,
          #c56cf0,
          #4dabf7,
          #51cf66,
          #ffd43b,
          #ff922b,
          #ff6b9d
        )
        border-box;
    background-size: 100% 100%, 320% 100%;
    animation: composer-rainbow-border 3.5s linear infinite;
  }

  @keyframes composer-rainbow-border {
    to {
      background-position: 0 0, 320% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .composer-shell--chromed[data-chrome-state="working"] {
      animation: none;
      background-size: 100% 100%, 100% 100%;
      border: 1px solid var(--primary, #007acc);
      background: var(--composer-chrome-fill);
      box-shadow: none;
    }
  }

  .composer-model-btn :global(svg) {
    flex-shrink: 0;
    display: block;
    width: 12px;
    height: 12px;
  }

  .composer-tool-cluster .composer-tool-btn :global(svg) {
    width: var(--composer-tool-cluster-icon-size, 18px);
    height: var(--composer-tool-cluster-icon-size, 18px);
  }

  .composer-attachments {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    padding: 8px 12px 0;
  }

  .attachment-chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 18px;
    padding: 0 2px 0 4px;
    border-radius: 4px;
    background: var(--workbench-control-bg, #2a2a2a);
    border: 1px solid #3a3a3a;
    font-size: 10px;
    color: #b8b8b8;
    max-width: 140px;
    line-height: 1;
    flex-shrink: 0;
  }

  .attachment-chip-main {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    line-height: 1;
  }

  .attachment-chip-main:hover .attachment-chip-name {
    text-decoration: underline;
  }

  .attachment-chip-icon {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 12px;
  }

  .attachment-chip-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: ui-monospace, monospace;
    line-height: 1;
  }

  .attachment-chip-remove {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    padding: 0;
    border: none;
    background: none;
    color: #666;
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    border-radius: 2px;
    transition: color 0.1s, background 0.1s;
  }

  .attachment-chip-remove:hover {
    color: #ccc;
    background: rgba(255, 255, 255, 0.08);
  }

  .attachment-chip[data-kind="file"] {
    border-color: rgba(100, 160, 255, 0.5);
    background: rgba(100, 160, 255, 0.06);
  }

  .attachment-chip[data-kind="dir"] {
    border-color: rgba(255, 185, 80, 0.5);
    background: rgba(255, 185, 80, 0.06);
  }

  .attachment-chip[data-kind="element"] {
    border-color: rgba(255, 107, 139, 0.5);
    background: rgba(255, 107, 139, 0.06);
  }

  .attachment-chip[data-kind="image"] {
    border-color: rgba(120, 220, 150, 0.5);
    background: rgba(120, 220, 150, 0.06);
  }

  .attachment-chip[data-kind="video"],
  .attachment-chip[data-kind="audio"] {
    border-color: rgba(190, 130, 255, 0.5);
    background: rgba(190, 130, 255, 0.06);
  }

  .composer-textarea {
    display: block;
    position: relative;
    width: 100%;
    box-sizing: border-box;
    margin: 0;
    border: none;
    border-radius: 0;
    background: transparent;
    color: #d4d4d4;
    padding: 10px 12px 8px;
    font-family: inherit;
    font-size: 12px;
    line-height: 1.45;
    min-height: 4.25rem;
    max-height: 16rem;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
    cursor: text;
  }

  .composer-textarea--with-attachments {
    padding-top: 6px;
    min-height: 3rem;
  }

  .composer-textarea[data-empty="true"]::before {
    content: attr(data-placeholder);
    color: #858585;
    pointer-events: none;
  }

  .composer-textarea:focus {
    outline: none;
  }


  .composer-toolbar {
    --composer-tool-cluster-bg: var(--workbench-control-bg, var(--secondary));
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 6px 7px;
    min-height: 0;
  }

  .composer-mode-wrap,
  .composer-model-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
  }

  .composer-mode-btn,
  .composer-model-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 24px;
    min-height: 24px;
    max-height: 24px;
    padding: 0 8px;
    box-sizing: border-box;
    border: none;
    border-radius: 10px;
    font-family: inherit;
    font-size: 11px;
    font-weight: 500;
    line-height: 1;
    cursor: pointer;
    transition:
      background 0.12s ease,
      color 0.12s ease;
  }

  .composer-mode-btn {
    padding: 0 8px 0 6px;
    background: var(--composer-tool-cluster-bg);
    border: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
    border-radius: 9999px;
  }

  .composer-mode-btn--chat {
    color: #4ec9b0;
  }

  .composer-mode-btn--chat:hover {
    background: color-mix(in srgb, var(--foreground) 8%, var(--composer-tool-cluster-bg));
  }

  .composer-mode-btn--plan {
    color: #dcdcaa;
  }

  .composer-mode-btn--plan:hover {
    background: color-mix(in srgb, var(--foreground) 8%, var(--composer-tool-cluster-bg));
  }

  .composer-mode-btn--agent {
    color: #b0b0b0;
  }

  .composer-mode-btn--agent:hover {
    background: color-mix(in srgb, var(--foreground) 8%, var(--composer-tool-cluster-bg));
  }

  .composer-mode-icon,
  .composer-mode-chevron {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    line-height: 0;
  }

  .composer-mode-icon {
    width: 14px;
    height: 14px;
  }

  .composer-mode-icon :global(svg) {
    display: block;
    width: 13px;
    height: 13px;
    transform: translateY(-0.5px);
  }

  .composer-mode-chevron {
    width: 12px;
    height: 12px;
  }

  .composer-mode-chevron :global(svg) {
    display: block;
    width: 12px;
    height: 12px;
  }

  .composer-mode-label {
    display: block;
    line-height: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mode-popup {
    position: absolute;
    left: 0;
    bottom: calc(100% + 6px);
    z-index: 60;
    min-width: 180px;
    max-width: 240px;
    padding: 4px 0;
    background: var(--workbench-panel-bg, var(--chat-panel-bg, var(--sidebar)));
    border: 1px solid #3c3c3c;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  }

  .mode-popup-option {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 10px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: #d4d4d4;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .mode-option-icon {
    display: flex;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .mode-popup-option--chat .mode-option-icon {
    color: #4ec9b0;
  }

  .mode-popup-option--plan .mode-option-icon {
    color: #dcdcaa;
  }

  .mode-popup-option--agent .mode-option-icon {
    color: #a3a3a3;
  }

  .mode-option-text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-width: 0;
  }

  .mode-popup-option:hover {
    background: #2a2d2e;
  }

  .mode-popup-option--current {
    background: #1a3a52;
  }

  .mode-option-label {
    font-weight: 500;
  }

  .mode-option-desc {
    font-size: 10px;
    color: #858585;
  }

  .composer-model-wrap {
    min-width: 0;
    max-width: min(7.5rem, 32vw);
    flex: 0 1 auto;
  }

  .composer-model-btn {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    padding: 0 6px 0 4px;
    background: transparent;
    color: #c8c8c8;
  }

  .composer-model-btn:hover {
    background: transparent;
    color: #f0f0f0;
  }

  .composer-model-label {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .composer-toolbar-spacer {
    flex: 1;
    min-width: 4px;
  }

  .composer-file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /** Attach / mic|send / stop — pill matches messages pane background. */
  .composer-tool-cluster {
    --composer-tool-cluster-size: 28px;
    --composer-tool-cluster-icon-size: 17px;
    display: inline-flex;
    align-items: center;
    gap: 0;
    flex-shrink: 0;
    padding: 2px;
    border-radius: 9999px;
    background: var(--composer-tool-cluster-bg);
    border: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  }

  .composer-tool-cluster .composer-tool-btn.workbench-icon-btn {
    width: var(--composer-tool-cluster-size);
    height: var(--composer-tool-cluster-size);
    border-radius: 9999px;
    background: transparent;
    color: var(--muted-foreground);
    --workbench-icon-btn-bg-hover: color-mix(in srgb, var(--foreground) 10%, transparent);
    --workbench-icon-btn-bg-active: color-mix(in srgb, var(--foreground) 14%, transparent);
  }

  .model-popup {
    min-width: 220px;
    width: max(260px, 12rem);
    max-width: min(96vw, 360px);
    max-height: min(56vh, 360px);
    overflow-y: auto;
    overflow-x: hidden;
    padding: 4px 0;
    background: var(--workbench-panel-bg, var(--chat-panel-bg, var(--sidebar)));
    border: 1px solid #3c3c3c;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  }

  .model-popup-section {
    padding: 2px 0 0;
  }

  .model-popup-section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px 4px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #888;
  }

  .model-popup-actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .model-popup-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: #3794ff;
    cursor: pointer;
  }

  .model-popup-action-btn:hover {
    background: rgba(55, 148, 255, 0.12);
    color: #5cb3ff;
  }

  .model-popup-action-btn :global(svg) {
    width: 12px;
    height: 12px;
  }

  .model-popup-option {
    display: block;
    width: 100%;
    padding: 6px 12px;
    border: none;
    background: transparent;
    color: #d4d4d4;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .model-popup-option:hover {
    background: #2a2d2e;
  }

  .model-popup-option--current {
    background: #1a3a52;
    color: #e0e0e0;
  }

  .model-popup-empty {
    margin: 0;
    padding: 6px 12px 4px;
    font-size: 12px;
    color: #b0b0b0;
    line-height: 1.45;
  }

  .model-popup-empty .inline-code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    background: #1e1e1e;
    padding: 1px 5px;
    border-radius: 4px;
  }

  .model-popup-foot {
    margin: 0;
    padding: 6px 12px 4px;
    font-size: 10px;
    color: #858585;
    font-variant-numeric: tabular-nums;
  }

  .model-popup-unavailable {
    display: block;
    padding: 4px 12px 6px;
    font-size: 11px;
    color: #5a5a5a;
    font-style: italic;
  }

  .context-footer {
    flex-shrink: 0;
    padding: 8px 10px 10px;
    border-top: 1px solid transparent;
    background: var(--workbench-panel-bg, var(--chat-panel-bg, var(--sidebar)));
    overflow: visible;
    position: relative;
    z-index: 1;
  }

  .context-bar {
    padding: 10px 0;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    cursor: pointer;
  }

  .context-bar-track {
    width: 100%;
    height: 3px;
    background: #3c3c3c;
    border-radius: 2px;
    overflow: hidden;
    display: flex;
    gap: 1px;
  }

  .context-bar--warning .context-bar-track { background: #3c3c3c; }
  .context-bar--critical .context-bar-track { background: #3c3c3c; }

  .context-bar-fill {
    height: 100%;
    flex-shrink: 0;
    transition: width 0.2s ease;
  }

  .context-bar--warning .context-bar-fill { background: #d4a017; }
  .context-bar--critical .context-bar-fill { background: #f44747; }

  .step-limit-notice {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 6px 12px;
    background: rgba(86, 156, 214, 0.08);
    border-top: 1px solid rgba(86, 156, 214, 0.2);
    font-size: 12px;
    color: #a3a3a3;
    flex-shrink: 0;
  }

  .step-limit-continue {
    margin-left: auto;
    font-size: 11px;
    padding: 2px 8px;
    border: 1px solid rgba(86, 156, 214, 0.4);
    border-radius: 3px;
    background: transparent;
    color: #569cd6;
    cursor: pointer;
    white-space: nowrap;
  }

  .step-limit-continue:hover {
    background: rgba(86, 156, 214, 0.1);
  }

  .step-limit-stop {
    font-size: 11px;
    padding: 2px 8px;
    border: 1px solid #404040;
    border-radius: 3px;
    background: transparent;
    color: #707070;
    cursor: pointer;
    white-space: nowrap;
  }

  .step-limit-stop:hover {
    color: #a3a3a3;
    border-color: #555;
  }

  .context-overflow-warning {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: rgba(244, 71, 71, 0.08);
    border-top: 1px solid rgba(244, 71, 71, 0.25);
    font-size: 12px;
    color: #f44747;
    flex-shrink: 0;
  }

  .context-overflow-warning .compact-now {
    margin-left: auto;
    font-size: 11px;
    padding: 2px 8px;
    border: 1px solid rgba(244, 71, 71, 0.4);
    border-radius: 3px;
    background: transparent;
    color: #f44747;
    cursor: pointer;
    white-space: nowrap;
  }

  .context-overflow-warning .compact-now:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .context-overflow-warning .dismiss {
    margin-left: 4px;
    font-size: 16px;
    line-height: 1;
    opacity: 0.6;
    cursor: pointer;
    border: none;
    background: none;
    color: inherit;
    padding: 0;
  }

  .context-seg {
    height: 100%;
    transition: width 0.2s ease;
    flex-shrink: 0;
  }

  .context-seg--system { background: var(--context-system-prompts); }
  .context-seg--tools  { background: var(--context-tool-schemas); }
  .context-seg--history { background: var(--context-chat-history); }

  .context-bar--active .context-bar-track {
    opacity: 0.6;
  }

  .context-panel {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    min-width: 240px;
    max-height: 60vh;
    overflow-y: auto;
    background: #1e1e1e;
    border: 1px solid #3c3c3c;
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 11px;
    line-height: 1.5;
    color: var(--foreground, #d4d4d4);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    z-index: 100;
  }

  .context-panel-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
  }

  .context-panel-close {
    font-size: 13px;
    line-height: 1;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: #606060;
    cursor: pointer;
    border-radius: 3px;
    padding: 0;
    flex-shrink: 0;
  }

  .context-panel-close:hover { color: #d4d4d4; }

  .context-panel-title {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #808080;
  }

  .context-panel-body { }

  .cpanel-group {
    margin-bottom: 4px;
  }

  .cpanel-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 18px;
    border-radius: 3px;
  }

  .cpanel-row--header {
    font-weight: 500;
    color: var(--foreground, #d4d4d4);
    border: none;
    background: transparent;
    width: 100%;
    text-align: left;
    font-family: inherit;
    font-size: inherit;
  }

  .cpanel-row--sub {
    padding-left: 16px;
    color: #808080;
    font-size: 10.5px;
    border: none;
    background: transparent;
    width: 100%;
    text-align: left;
    font-family: inherit;
  }

  .cpanel-row--clickable { cursor: pointer; }

  .cpanel-row--clickable:hover {
    background: rgba(255, 255, 255, 0.05);
    color: var(--foreground, #d4d4d4);
  }

  .cpanel-row--clickable:focus-visible {
    outline: 1px solid var(--ring, #569cd6);
    outline-offset: -1px;
  }

  .cpanel-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .cpanel-label { flex: 1; }

  .cpanel-tok {
    font-variant-numeric: tabular-nums;
    color: var(--muted-foreground, #808080);
    flex-shrink: 0;
  }

  .cpanel-row--header .cpanel-tok { color: var(--foreground, #d4d4d4); }

  .cpanel-open-icon {
    font-size: 10px;
    color: #569cd6;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.1s;
  }

  .cpanel-open-icon--show { opacity: 1; }

  .cpanel-row--clickable:hover .cpanel-open-icon { opacity: 1; }

  .cpanel-chevron {
    font-size: 9px;
    color: #808080;
    flex-shrink: 0;
  }

  .cpanel-row--file {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-left: 24px;
    min-height: 18px;
    width: 100%;
    border: none;
    background: transparent;
    color: #808080;
    font-size: 10.5px;
    text-align: left;
    cursor: pointer;
    border-radius: 3px;
    font-family: inherit;
  }

  .cpanel-row--file:hover {
    background: rgba(255, 255, 255, 0.05);
    color: var(--foreground, #d4d4d4);
  }

  .cpanel-row--file:hover .cpanel-open-icon { opacity: 1; }

  .cpanel-row--file:focus-visible {
    outline: 1px solid var(--ring, #569cd6);
    outline-offset: -1px;
  }

  .cpanel-divider {
    height: 1px;
    background: #3c3c3c;
    margin: 6px 0;
  }

  .cpanel-row--total {
    font-weight: 500;
    color: var(--foreground, #d4d4d4);
  }

  .cpanel-row--reserve { color: #606060; }

  .context-breakdown-popover {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    min-width: 240px;
    background: #1e1e1e;
    border: 1px solid #3c3c3c;
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 11px;
    line-height: 1.5;
    color: var(--foreground, #d4d4d4);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    z-index: 100;
    pointer-events: none;
  }

  .breakdown-title {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #808080;
    margin-bottom: 8px;
  }

  .breakdown-group {
    margin-bottom: 4px;
  }

  .breakdown-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 18px;
  }

  .breakdown-row--header { font-weight: 500; }

  .breakdown-row--sub {
    padding-left: 16px;
    color: #808080;
    font-size: 10.5px;
  }

  .breakdown-row--total { font-weight: 500; margin-top: 2px; }
  .breakdown-row--reserve { color: #606060; }

  .breakdown-label { flex: 1; }

  .breakdown-tok {
    font-variant-numeric: tabular-nums;
    color: var(--muted-foreground, #808080);
    flex-shrink: 0;
  }

  .breakdown-row--header .breakdown-tok,
  .breakdown-row--total .breakdown-tok { color: var(--foreground, #d4d4d4); }

  .breakdown-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .breakdown-dot--system  { background: var(--context-system-prompts); }
  .breakdown-dot--tools   { background: var(--context-tool-schemas); }
  .breakdown-dot--history { background: var(--context-chat-history); }

  .breakdown-divider {
    height: 1px;
    background: #3c3c3c;
    margin: 6px 0;
  }

  .context-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    min-height: 22px;
    font-size: 10px;
    line-height: 14px;
    color: var(--muted-foreground);
  }

  .context-meta-start {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .context-monthly-usage,
  .context-chat-tok {
    display: inline-flex;
    align-items: center;
    min-height: 14px;
    min-width: 0;
    text-align: left;
    font-variant-numeric: tabular-nums;
    line-height: 14px;
    user-select: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .context-monthly-usage {
    color: #9cdcfe;
    border: none;
    background: transparent;
    padding: 0;
    margin: 0;
    font: inherit;
    cursor: pointer;
    transition:
      color var(--motion-fast, 140ms),
      background-color var(--motion-fast, 140ms);
  }

  .context-monthly-usage:hover {
    color: #b8e6ff;
    background: color-mix(in srgb, var(--foreground) 6%, transparent);
    border-radius: 4px;
  }

  .context-monthly-usage--balance {
    color: #c5e478;
  }

  .context-monthly-usage--balance:hover {
    color: #d4f088;
  }

  .context-budget-row {
    display: inline-flex;
    align-items: center;
    align-self: center;
    gap: 2px;
    flex-shrink: 0;
    min-height: 22px;
  }

  .context-budget-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .context-compact-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    margin: 0;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: #a3a3a3;
    cursor: pointer;
    flex-shrink: 0;
  }

  .context-compact-btn:hover {
    color: #e8e8e8;
    background: rgba(255, 255, 255, 0.08);
  }

  .context-compact-btn:focus-visible {
    outline: 1px solid var(--ring);
    outline-offset: 2px;
  }

  .context-compact-btn--inactive {
    opacity: 0.4;
    cursor: default;
  }

  .context-compact-btn--inactive:hover {
    color: #a3a3a3;
    background: transparent;
  }

  .context-numbers {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    min-height: 14px;
    line-height: 14px;
    gap: 0;
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
    font: inherit;
    font-size: inherit;
    font-variant-numeric: tabular-nums;
    color: inherit;
    cursor: pointer;
    text-align: right;
    text-decoration: none;
    border-radius: 0;
    box-shadow: none;
    appearance: none;
    -webkit-appearance: none;
  }

  .context-numbers-text {
    display: inline-flex;
    align-items: center;
    min-height: 14px;
    line-height: 14px;
    min-width: 0;
  }

  .context-numbers--static {
    display: inline-flex;
    align-items: center;
    min-height: 14px;
    line-height: 14px;
    cursor: default;
    pointer-events: none;
  }

  .context-numbers--warning { color: #d4a017; }
  .context-numbers--critical { color: #f44747; }

  .context-hint {
    color: #858585;
  }

  .context-numbers:hover {
    color: var(--foreground);
  }

  .context-numbers:focus-visible {
    outline: 1px solid var(--ring);
    outline-offset: 2px;
  }

  .context-budget-menu {
    position: absolute;
    right: 0;
    bottom: calc(100% + 6px);
    z-index: 70;
    min-width: 140px;
    max-height: 220px;
    overflow-y: auto;
    padding: 4px 0;
    background: var(--workbench-panel-bg, var(--chat-panel-bg, var(--sidebar)));
    border: 1px solid #3c3c3c;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  }

  .context-budget-option {
    display: block;
    width: 100%;
    padding: 6px 12px;
    border: none;
    background: transparent;
    color: #d4d4d4;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .context-budget-option:hover {
    background: #2a2d2e;
  }

  .context-budget-option.current {
    background: #1a3a52;
    color: #e0e0e0;
  }
</style>
