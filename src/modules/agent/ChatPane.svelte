<script lang="ts">
  import { get } from "svelte/store";
  import { chat, activeSession } from "$lib/stores/chat";
  import { settings, AVAILABLE_MODELS, type ModelConfig } from "$lib/stores/settings";
  import { toolPolicy as toolPolicyStore } from "$lib/stores/toolPolicy";
  import { files } from "$lib/stores/files";
  import { estimateChatContextTokens } from "$lib/chatContext";
  import {
    fetchOllamaModelList,
    RECOMMENDED_OLLAMA_MODELS,
    pickContextOption,
    contextOptionsUpTo,
  } from "$lib/ollamaClient";
  import { reduceHarnessStreamDisplay } from "$lib/harnessStreamDisplay";
  import { onMount, onDestroy } from "svelte";
  import {
    startHarness,
    sendToHarness,
    listenHarnessEvents,
    isTauriAvailable,
    type HarnessEvent,
  } from "$lib/ipc";
  import { Button } from "$lib/components/ui/button/index.js";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import History from "@lucide/svelte/icons/history";
  import ImagePlus from "@lucide/svelte/icons/image-plus";
  import MessageSquare from "@lucide/svelte/icons/message-square";
  import Mic from "@lucide/svelte/icons/mic";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Square from "@lucide/svelte/icons/square";

  /** Narrow surface for `SpeechRecognition` (Chromium) without relying on full DOM lib types. */
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
  /** User bubble expanded to full textarea (draft not persisted yet). */
  let userMessageExpanded = $state<Record<string, boolean>>({});
  let userMessageDraft = $state<Record<string, string>>({});
  let messagesContainer: HTMLDivElement;

  function expandUserMessage(id: string, content: string) {
    userMessageDraft = { ...userMessageDraft, [id]: content };
    userMessageExpanded = { ...userMessageExpanded, [id]: true };
  }

  function collapseUserMessage(id: string) {
    userMessageExpanded = { ...userMessageExpanded, [id]: false };
  }
  let sidecarSpawned = $state(false);
  let unlisten: (() => void) | null = null;
  let streamingContent = $state("");
  /** Claude extended thinking (streams via sidecar `thinking` events). */
  let streamingThinking = $state("");
  let thinkingPanelEl = $state<HTMLDivElement | undefined>(undefined);
  /** Wall-clock start of current assistant stream (first RPC token may arrive later). */
  let streamWallStartMs = 0;
  /** First assistant/thinking delta timestamp — preferred for tok/s. */
  let streamFirstTokenAt = 0;
  /** Rolling average output tokens/sec from the last completed reply (usage-based). */
  let lastTokPerSec = $state<number | null>(null);
  /** Per-reply output tok/s samples for the active chat (from `usage` events), capped for a simple session average. */
  const SESSION_TOK_RATE_SAMPLES_MAX = 32;
  let sessionTokRateSamples = $state<number[]>([]);
  let prevActiveSessionForTok = $state<string | null>(null);
  let pendingToolApproval = $state<{ id: string; tool: string; input: unknown } | null>(null);
  let modelMenuOpen = $state(false);
  let modelMenuAnchorEl: HTMLDivElement | undefined = $state();
  let contextBudgetMenuOpen = $state(false);
  let contextBudgetMenuEl: HTMLDivElement | undefined = $state();
  let attachInputEl = $state<HTMLInputElement | undefined>(undefined);
  let speechListening = $state(false);
  let speechRec: BrowserSpeechRec | null = null;
  /** First successful `/api/tags` this session vs unreachable host. */
  let ollamaCatalogStatus = $state<"idle" | "ok" | "fail">("idle");

  type OllamaMenuRow = { id: string; name: string };

  function buildOllamaMenuRows(installed: ModelConfig[]): OllamaMenuRow[] {
    return [...installed]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((m) => ({ id: m.id, name: m.name }));
  }

  let ollamaMenuRows = $derived(buildOllamaMenuRows($settings.ollamaModels));

  let anthropicMenuRows = $derived(
    AVAILABLE_MODELS.filter((m) => m.provider === "anthropic").map((m) => ({
      id: m.id,
      name: m.name,
    }))
  );

  let ollamaChatReady = $derived(
    $settings.chatBackend !== "ollama" ||
      (ollamaCatalogStatus === "ok" &&
        $settings.ollamaModels.some((m) => m.id === $settings.selectedModel))
  );

  /** User-selected `num_ctx` cap (saved row, else recommended defaults). */
  function effectiveOllamaContextWindow(selectedId: string, models: ModelConfig[]): number {
    const row = models.find((m) => m.id === selectedId);
    if (row) return row.contextWindow;
    const rec = RECOMMENDED_OLLAMA_MODELS.find((r) => r.id === selectedId);
    if (rec) return pickContextOption(rec.contextWindow, rec.contextLimitMax ?? rec.contextWindow);
    return 8192;
  }

  function anthropicModelCap(): number {
    const m = AVAILABLE_MODELS.find(
      (x) => x.id === $settings.selectedModel && x.provider === "anthropic"
    );
    return m?.contextWindow ?? 128000;
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
    return anthropicModelCap();
  }

  let contextBudgetOptions = $derived(() => contextOptionsUpTo(contextBudgetCeiling()));

  let maxContextTokens = $derived(() => {
    if ($settings.chatBackend === "llamacpp") {
      const m = $settings.llamacppModels.find((x) => x.id === $settings.selectedModel);
      return m?.contextWindow ?? 8192;
    }
    if ($settings.chatBackend === "ollama") {
      return effectiveOllamaContextWindow($settings.selectedModel, $settings.ollamaModels);
    }
    const cap = anthropicModelCap();
    const b = $settings.anthropicContextBudget;
    return b != null ? Math.min(b, cap) : cap;
  });

  let modelTriggerLabel = $derived(
    $settings.chatBackend === "ollama"
      ? ollamaCatalogStatus === "fail"
        ? "Unavailable"
        : ($settings.ollamaModels.find((x) => x.id === $settings.selectedModel)?.name ??
            (ollamaCatalogStatus === "ok" ? "Unavailable" : "…"))
      : $settings.chatBackend === "llamacpp"
        ? ($settings.llamacppModels.find((x) => x.id === $settings.selectedModel)?.name ??
            $settings.selectedModel)
        : (AVAILABLE_MODELS.find((x) => x.id === $settings.selectedModel)?.name ?? "Anthropic")
  );

  let contextUsed = $derived(() => {
    const msgs = $activeSession?.messages ?? [];
    const extras: string[] = [];
    if (streamingContent) extras.push(streamingContent);
    if (streamingThinking) extras.push(streamingThinking);
    const d = inputValue.trim();
    if (d) extras.push(d);
    return estimateChatContextTokens(
      msgs.map((m) => ({ role: m.role, content: m.content })),
      extras.join("\n\n")
    );
  });

  let contextPct = $derived(() => {
    const max = maxContextTokens();
    return max > 0 ? Math.min(100, (contextUsed() / max) * 100) : 0;
  });

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

  let chatAvgTokPerSec = $derived(() => {
    const xs = sessionTokRateSamples;
    if (xs.length === 0) return null;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  });

  function chatAvgTokFooterLabel(): string {
    const v = chatAvgTokPerSec();
    if (v == null) return "— tok/s avg";
    return `${formatTokRate(v)} tok/s avg`;
  }

  $effect(() => {
    const sid = $chat.activeSessionId;
    if (sid !== prevActiveSessionForTok) {
      prevActiveSessionForTok = sid;
      sessionTokRateSamples = [];
    }
  });

  async function refreshOllamaModelsFromHost() {
    try {
      const list = await fetchOllamaModelList(get(settings).ollamaEndpoint, get(settings).ollamaModels);
      settings.setOllamaModels(list);
      ollamaCatalogStatus = "ok";
    } catch (e) {
      console.warn("Could not list Ollama models:", e);
      ollamaCatalogStatus = "fail";
    }
  }

  onMount(async () => {
    void refreshOllamaModelsFromHost();
    if (!isTauriAvailable()) return;
    try {
      unlisten = await listenHarnessEvents(handleHarnessEvent);
    } catch (e) {
      console.warn("Harness event listener unavailable:", e);
    }
  });

  onDestroy(() => {
    if (unlisten) unlisten();
    stopDictation();
  });

  $effect(() => {
    if (modelMenuOpen) void refreshOllamaModelsFromHost();
  });

  function toggleModelMenu() {
    modelMenuOpen = !modelMenuOpen;
    if (modelMenuOpen) contextBudgetMenuOpen = false;
  }

  function toggleContextBudgetMenu() {
    contextBudgetMenuOpen = !contextBudgetMenuOpen;
    if (contextBudgetMenuOpen) modelMenuOpen = false;
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
        AVAILABLE_MODELS.find((m) => m.id === st.selectedModel && m.provider === "anthropic")
          ?.contextWindow ?? 128_000;
      if (opt >= cap) settings.setAnthropicContextBudget(null);
      else settings.setAnthropicContextBudget(opt);
    }
    contextBudgetMenuOpen = false;
  }

  function onDocPointerDown(e: PointerEvent) {
    const t = e.target as Node;
    if (modelMenuOpen && modelMenuAnchorEl && !modelMenuAnchorEl.contains(t)) {
      modelMenuOpen = false;
    }
    if (contextBudgetMenuOpen && contextBudgetMenuEl && !contextBudgetMenuEl.contains(t)) {
      contextBudgetMenuOpen = false;
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

    const gap = inputValue.trim().length ? "\n\n" : "";

    if (file.type.startsWith("image/")) {
      if (file.size > 150_000) {
        inputValue += `${gap}[Image "${file.name}" skipped — larger than 150KB]\n`;
        return;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        inputValue += `${gap}![${file.name}](${dataUrl})\n`;
      } catch {
        inputValue += `${gap}[Could not read image "${file.name}"]\n`;
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
        inputValue += `${gap}--- ${file.name} ---\n${text}`;
      } catch {
        inputValue += `${gap}[Could not read "${file.name}"]\n`;
      }
      return;
    }

    inputValue += `${gap}[File: ${file.name} (${file.type || "unknown"}, ${file.size} bytes) — not inlined]\n`;
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
        const sep = inputValue.length && !/\s$/.test(inputValue) ? " " : "";
        inputValue = `${inputValue}${sep}${t}`;
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

  function handleHarnessEvent(event: HarnessEvent) {
    const { event: eventType, data } = event;

    if (eventType === "ready") {
      return;
    }

    if (eventType === "started") {
      const d = data as { piPackageVersion?: string };
      if (d.piPackageVersion) {
        settings.setLastBundledPiSdkVersion(d.piPackageVersion);
      }
      return;
    }

    if (eventType === "usage") {
      const u = data as { inputTokens?: number; outputTokens?: number };
      const outTok = u.outputTokens ?? 0;
      const t0 = streamFirstTokenAt || streamWallStartMs;
      if (t0 > 0 && outTok > 0) {
        const elapsedSec = (performance.now() - t0) / 1000;
        if (elapsedSec > 0.05) {
          const rate = outTok / elapsedSec;
          lastTokPerSec = rate;
          sessionTokRateSamples = [...sessionTokRateSamples, rate].slice(-SESSION_TOK_RATE_SAMPLES_MAX);
        }
      }
      return;
    }

    if (eventType === "tool_decision" || eventType === "tool_start" || eventType === "tool_end") {
      pendingToolApproval = null;
    }

    if (eventType === "tool_approval_needed") {
      const d = data as { id?: string; tool?: string; input?: unknown };
      if (d.id && d.tool) {
        pendingToolApproval = { id: d.id, tool: d.tool, input: d.input };
      }
      return;
    }

    if (eventType === "stopped") {
      pendingToolApproval = null;
      streamingContent = "";
      streamingThinking = "";
      streamFirstTokenAt = 0;
      streamWallStartMs = 0;
      chat.setStreaming(false);
      return;
    }

    if (eventType === "thinking") {
      const act = reduceHarnessStreamDisplay(
        { streamingContent, streamingThinking },
        eventType,
        data
      );
      if (act.kind === "set-stream") {
        streamingThinking = act.view.streamingThinking;
        if (streamingThinking.length > 0) markFirstStreamToken();
      }
      return;
    }

    if (eventType === "error") {
      const act = reduceHarnessStreamDisplay(
        { streamingContent, streamingThinking },
        eventType,
        data
      );
      if (act.kind === "error-assistant") {
        pendingToolApproval = null;
        chat.addMessage({ role: "assistant", content: `Error: ${act.message}` });
        chat.setStreaming(false);
        streamingThinking = "";
        streamFirstTokenAt = 0;
        streamWallStartMs = 0;
      }
      return;
    }

    if (eventType === "message") {
      const act = reduceHarnessStreamDisplay(
        { streamingContent, streamingThinking },
        eventType,
        data
      );
      if (act.kind === "set-stream") {
        streamingContent = act.view.streamingContent;
        if (streamingContent.length > 0) markFirstStreamToken();
      } else if (act.kind === "commit-assistant") {
        streamingContent = act.view.streamingContent;
        streamingThinking = act.view.streamingThinking;
        chat.addMessage({
          role: "assistant",
          content: act.content,
          ...(act.thinking ? { thinking: act.thinking } : {}),
        });
        chat.setStreaming(false);
        streamFirstTokenAt = 0;
        streamWallStartMs = 0;
      }
    }

    if (eventType === "tool_start") {
      const toolData = data as { id: string; tool: string; input: unknown };
      chat.setToolCall({
        id: toolData.id,
        tool: toolData.tool,
        input: toolData.input,
        status: "running",
      });
    }

    if (eventType === "tool_end") {
      chat.setToolCall(null);
    }
  }

  async function ensureSidecarAndConfigure(): Promise<void> {
    try {
      if (!sidecarSpawned) {
        await startHarness();
        sidecarSpawned = true;
      }
      const provider =
        $settings.chatBackend === "ollama"
          ? "ollama"
          : $settings.chatBackend === "llamacpp"
            ? "llamacpp"
            : "anthropic";
      await sendToHarness("start", {
        harnessKind: $settings.harnessKind,
        model: $settings.selectedModel,
        provider,
        apiKey: provider === "anthropic" ? $settings.apiKeys.anthropic : undefined,
        anthropicExtendedThinking: $settings.anthropicExtendedThinking,
        ollamaEndpoint: $settings.ollamaEndpoint,
        ollamaNumCtx:
          provider === "ollama"
            ? effectiveOllamaContextWindow($settings.selectedModel, $settings.ollamaModels)
            : undefined,
        llamacppEndpoint: $settings.llamacppEndpoint,
        llamacppApiKey: $settings.llamacppApiKey,
        workspacePath: $files.workspacePath ?? "/",
        toolPolicy: {
          mode: $toolPolicyStore.mode,
          whitelist: $toolPolicyStore.whitelist,
        },
      });
    } catch (e) {
      console.error("Failed to configure harness:", e);
      chat.addMessage({
        role: "assistant",
        content: `Failed to configure harness: ${e}`,
      });
      throw e;
    }
  }

  async function submitToolDecision(approved: boolean) {
    const p = pendingToolApproval;
    if (!p) return;
    pendingToolApproval = null;
    try {
      await sendToHarness("approve_tool", { callId: p.id, approved });
    } catch (e) {
      console.error(e);
    }
  }

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

  function pickLlamacppModelRow(modelId: string) {
    settings.setChatBackend("llamacpp");
    settings.setSelectedModel(modelId);
    modelMenuOpen = false;
  }

  async function cancelChatRequest() {
    if (!isTauriAvailable() || !$chat.isStreaming) return;
    pendingToolApproval = null;
    streamingContent = "";
    streamingThinking = "";
    streamFirstTokenAt = 0;
    streamWallStartMs = 0;
    chat.setStreaming(false);
    try {
      await sendToHarness("stop", {});
    } catch (e) {
      console.error("Cancel failed:", e);
    }
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!inputValue.trim() || $chat.isStreaming) return;

    chat.ensureActiveSession();

    const message = inputValue.trim();
    inputValue = "";

    chat.addMessage({ role: "user", content: message });

    if (!isTauriAvailable()) {
      chat.addMessage({
        role: "assistant",
        content: "Run with `npm run tauri dev` to enable chat.",
      });
      return;
    }

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

    const history = ($activeSession?.messages ?? [])
      .slice(0, -1)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    streamingThinking = "";
    streamWallStartMs = performance.now();
    streamFirstTokenAt = 0;
    chat.setStreaming(true);

    try {
      await ensureSidecarAndConfigure();
      await sendToHarness("chat", { message, history });
    } catch (e) {
      console.error("Failed to send message:", e);
      chat.addMessage({
        role: "assistant",
        content: `Failed to send message: ${e}`,
      });
      chat.setStreaming(false);
      streamingThinking = "";
      streamFirstTokenAt = 0;
      streamWallStartMs = 0;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
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
      ($activeSession?.messages.length || streamingContent || streamingThinking)
    ) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  });

  $effect(() => {
    void streamingThinking;
    queueMicrotask(() => {
      if (thinkingPanelEl) {
        thinkingPanelEl.scrollTop = thinkingPanelEl.scrollHeight;
      }
    });
  });
</script>

<svelte:window onpointerdown={onDocPointerDown} />

<div class="chat-pane">
  {#if pendingToolApproval}
    <div class="approval-banner" role="alert">
      <div class="approval-text">
        <strong>{pendingToolApproval.tool}</strong>
        <span class="approval-sub">Allow this tool for the current request?</span>
      </div>
      <div class="approval-actions">
        <Button variant="outline" size="sm" onclick={() => submitToolDecision(false)}>Deny</Button>
        <Button variant="default" size="sm" onclick={() => submitToolDecision(true)}>Allow</Button>
      </div>
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
        <MessageSquare />
      {:else}
        <History />
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
      {#each $activeSession?.messages ?? [] as message (message.id)}
        <div class="message {message.role}">
          {#if message.role === "assistant" && message.thinking}
            <details class="thinking-archive">
              <summary class="thinking-archive-summary">Thinking</summary>
              <pre class="thinking-archive-body">{message.thinking}</pre>
            </details>
          {/if}
          {#if message.role === "user"}
            {#if userMessageExpanded[message.id]}
              <textarea
                class="message-user-edit"
                rows="6"
                value={userMessageDraft[message.id] ?? message.content}
                aria-label="Edit message"
                oninput={(e) => {
                  userMessageDraft = { ...userMessageDraft, [message.id]: e.currentTarget.value };
                }}
              ></textarea>
            {:else}
              <button
                type="button"
                class="message-content message-content--user-clamped"
                onclick={() => expandUserMessage(message.id, message.content)}
              >
                {message.content}
              </button>
            {/if}
          {:else}
            <div class="message-content">
              {message.content}
            </div>
          {/if}
          {#if message.toolCalls}
            {#each message.toolCalls as toolCall}
              <div class="tool-call {toolCall.status}">
                <span class="tool-name">{toolCall.tool}</span>
                <span class="tool-status">{toolCall.status}</span>
              </div>
            {/each}
          {/if}
          {#if message.role === "user"}
            <div class="message-user-actions">
              {#if userMessageExpanded[message.id]}
                <button
                  type="button"
                  class="message-ghost-btn"
                  onclick={() => collapseUserMessage(message.id)}
                  title="Collapse preview"
                >
                  Done
                </button>
              {/if}
              <span class="message-user-actions-spacer"></span>
              <button type="button" class="message-ghost-btn" disabled title="Edit (coming soon)">Edit</button>
              <button
                type="button"
                class="message-ghost-btn"
                disabled
                title="Revert all code to how it was before this message (coming soon)"
              >
                Revert
              </button>
            </div>
          {/if}
        </div>
      {/each}
    {/if}

    {#if $chat.isStreaming}
      {#if streamingThinking}
        <div class="thinking-live" aria-label="Model thinking stream">
          <div class="thinking-live-head">Thinking</div>
          <div class="thinking-live-body" bind:this={thinkingPanelEl}>
            {streamingThinking}
          </div>
        </div>
      {/if}
      {#if streamingContent}
        <div class="message assistant streaming">
          <div class="message-content">
            {streamingContent}
          </div>
        </div>
      {/if}
      {#if !streamingContent}
        <div class="streaming-indicator">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
      {/if}
    {/if}
  </div>

  {#if !$chat.historyPickerOpen}
  <form class="input-area composer-form" onsubmit={handleSubmit}>
    <div class="composer-shell">
      <textarea
        class="composer-textarea"
        bind:value={inputValue}
        placeholder="Plan, search, build anything…"
        rows="3"
        onkeydown={handleKeydown}
      ></textarea>
      <div class="composer-toolbar">
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
            <ChevronDown aria-hidden="true" />
          </button>
          {#if modelMenuOpen}
            <div class="model-popup" role="listbox" aria-label="Choose model">
              <div class="model-popup-section">
                <div class="model-popup-section-head">
                  <span>Ollama</span>
                  <button
                    type="button"
                    class="model-popup-refresh"
                    onclick={() => refreshOllamaModelsFromHost()}
                    title="Refresh Ollama models"
                    aria-label="Refresh Ollama models"
                  >
                    <RefreshCw aria-hidden="true" />
                  </button>
                </div>
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
                {:else}
                  <p class="model-popup-empty">
                    {#if ollamaCatalogStatus === "fail"}
                      Unreachable — check <code class="inline-code">ollama serve</code> and Settings → Ollama URL.
                    {:else}
                      No models. Try <code class="inline-code">ollama pull llama3.2:1b</code>
                    {/if}
                  </p>
                {/each}
              </div>
              <div class="model-popup-section">
                <div class="model-popup-section-head">
                  <span>Anthropic</span>
                </div>
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
              </div>
              {#if $settings.llamacppModels.length > 0}
                <div class="model-popup-section">
                  <div class="model-popup-section-head">
                    <span>llama.cpp</span>
                  </div>
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
                </div>
              {/if}
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
        {#if $chat.isStreaming}
          <button
            type="button"
            class="composer-stop-btn"
            onclick={() => void cancelChatRequest()}
            title="Stop generating"
            aria-label="Stop generating"
          >
            <Square aria-hidden="true" />
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
            class="composer-tool-btn"
            onclick={() => attachInputEl?.click()}
            title="Attach file"
            aria-label="Attach file"
          >
            <ImagePlus aria-hidden="true" />
          </button>
          <button
            type="button"
            class="composer-tool-btn"
            class:composer-tool-btn--active={speechListening}
            onclick={toggleDictation}
            title={speechListening ? "Stop dictation" : "Speech to text"}
            aria-label={speechListening ? "Stop dictation" : "Speech to text"}
            aria-pressed={speechListening}
          >
            <Mic aria-hidden="true" />
          </button>
          {#if inputValue.trim()}
            <button
              type="submit"
              class="composer-send-minimal"
              disabled={!ollamaChatReady}
              title="Send"
              aria-label="Send message"
            >
              <ArrowUp aria-hidden="true" />
            </button>
          {/if}
        {/if}
      </div>
    </div>
  </form>

  <div class="context-footer" aria-label="Estimated context from this chat">
    <div class="context-bar">
      <div class="context-fill" style="width: {contextPct()}%"></div>
    </div>
    <div class="context-meta">
      <span
        class="context-chat-tok"
        title="Average output tokens/sec across completed replies in this chat (from provider usage)"
        aria-label="Average output tokens per second for this chat, from usage on completed replies"
      >
        {chatAvgTokFooterLabel()}
      </span>
      <div class="context-budget-wrap" bind:this={contextBudgetMenuEl}>
        <button
          type="button"
          class="context-numbers"
          onclick={toggleContextBudgetMenu}
          aria-expanded={contextBudgetMenuOpen}
          aria-haspopup="listbox"
          title="Change context budget for this model"
        >
          <span class="context-numbers-text"
            >~{formatTok(contextUsed())} / {formatTok(maxContextTokens())} tok</span>
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
  }

  .approval-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    background: #3a2f1a;
    border-bottom: 1px solid #8b6914;
    flex-shrink: 0;
  }

  .approval-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    color: #e0e0e0;
    min-width: 0;
  }

  .approval-sub {
    color: #b0b0b0;
    font-weight: 400;
  }

  .approval-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }

  .approval-actions .btn {
    padding: 6px 12px;
    font-size: 12px;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid transparent;
  }

  .approval-actions .btn.allow {
    background: #0e639c;
    color: #fff;
  }

  .approval-actions .btn.deny {
    background: #3c3c3c;
    color: #ddd;
    border-color: #555;
  }

  .messages {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    min-height: 0;
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
    width: 22px;
    height: 22px;
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
    width: 10px;
    height: 10px;
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
  }

  .message.user {
    align-self: stretch;
    width: 100%;
    padding: 6px 10px 12px;
    background: var(--secondary);
    border: 1px solid var(--border);
    box-sizing: border-box;
  }

  .message-content--user-clamped {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    overflow: hidden;
    width: 100%;
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
    font: inherit;
    font-size: 11px;
    line-height: 1.45;
    color: var(--foreground);
    text-align: left;
    white-space: pre-wrap;
    word-break: break-word;
    cursor: pointer;
    border-radius: 2px;
  }

  .message-content--user-clamped:hover {
    background: color-mix(in oklch, var(--foreground) 6%, transparent);
  }

  .message-user-edit {
    display: block;
    width: 100%;
    box-sizing: border-box;
    margin: 0 0 2px;
    padding: 4px 6px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--background);
    color: var(--foreground);
    font-family: inherit;
    font-size: 11px;
    line-height: 1.45;
    resize: vertical;
    min-height: 4.5rem;
  }

  .message-user-actions {
    position: absolute;
    bottom: 2px;
    left: 6px;
    right: 6px;
    display: flex;
    align-items: center;
    gap: 8px;
    opacity: 0;
    transition: opacity 0.12s ease;
    pointer-events: none;
  }

  .message-user-actions-spacer {
    flex: 1;
    min-width: 0;
  }

  .message.user:hover .message-user-actions,
  .message.user:focus-within .message-user-actions,
  .message.user:has(.message-user-edit) .message-user-actions {
    opacity: 1;
    pointer-events: auto;
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

  .message.assistant {
    align-self: stretch;
    padding: 8px 10px;
    background: var(--muted);
    border: 1px solid var(--border);
  }

  .message.assistant .message-content {
    font-size: 11px;
    line-height: 1.45;
    color: var(--foreground);
  }

  .message.assistant.streaming {
    border-left: 2px solid var(--primary);
  }

  .message-content {
    white-space: pre-wrap;
  }

  .tool-call {
    margin-top: 6px;
    padding: 6px 8px;
    background: var(--background);
    border-radius: 4px;
    display: flex;
    justify-content: space-between;
    font-size: 10px;
  }

  .tool-name {
    font-family: monospace;
    color: #4ec9b0;
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
    background: #252526;
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
    overflow-y: auto;
    font-size: 11px;
    line-height: 1.45;
    color: #a0a0a0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  }

  .streaming-indicator {
    display: flex;
    gap: 4px;
    padding: 12px;
  }

  .dot {
    width: 8px;
    height: 8px;
    background: #007acc;
    border-radius: 50%;
    animation: pulse 1.4s infinite ease-in-out;
  }

  .dot:nth-child(2) {
    animation-delay: 0.2s;
  }

  .dot:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes pulse {
    0%,
    80%,
    100% {
      opacity: 0.3;
    }
    40% {
      opacity: 1;
    }
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
    background: #2d2d30;
    /* allow model popup to extend above the shell (same as former context menu) */
    overflow: visible;
  }

  /** Default Lucide size in composer; tool row overrides below. */
  .composer-shell :global(svg) {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }

  .composer-model-btn :global(svg) {
    width: 11px;
    height: 11px;
  }

  .composer-tool-btn :global(svg),
  .composer-stop-btn :global(svg),
  .composer-send-minimal :global(svg) {
    width: 17px;
    height: 17px;
  }

  .composer-textarea {
    display: block;
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
    resize: none;
    min-height: 4.25rem;
    field-sizing: content;
  }

  .composer-textarea::placeholder {
    color: #858585;
  }

  .composer-textarea:focus {
    outline: none;
  }

  .composer-shell:focus-within {
    border-color: #007acc;
  }

  .composer-toolbar {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 5px 6px 7px;
    min-height: 0;
  }

  .composer-model-wrap {
    position: relative;
    align-self: center;
    max-width: min(168px, 52vw);
    flex-shrink: 0;
  }

  .composer-model-btn {
    display: inline-flex;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    align-items: center;
    gap: 4px;
    padding: 3px 8px 3px 6px;
    border: none;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.06);
    color: #c8c8c8;
    font-size: 11px;
    line-height: 1.2;
    cursor: pointer;
    box-sizing: border-box;
  }

  .composer-model-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #f0f0f0;
  }

  .composer-model-label {
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

  .composer-tool-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #a8a8a8;
    cursor: pointer;
  }

  .composer-tool-btn:hover {
    color: #e8e8e8;
    background: rgba(255, 255, 255, 0.06);
  }

  .composer-tool-btn--active {
    color: #0e639c;
    background: rgba(14, 99, 156, 0.2);
  }

  .composer-stop-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: rgba(180, 60, 60, 0.25);
    color: #f48771;
    cursor: pointer;
  }

  .composer-stop-btn:hover {
    background: rgba(180, 60, 60, 0.4);
  }

  .composer-send-minimal {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: #007acc;
    color: #fff;
    cursor: pointer;
  }

  .composer-send-minimal:hover:not(:disabled) {
    background: #0098ff;
  }

  .composer-send-minimal:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  /**
   * Anchored model list — same visual language as the former context-budget popup
   * (absolute panel, #252526, 1px border, soft shadow, monospace-ish rows).
   */
  .model-popup {
    position: absolute;
    left: 0;
    bottom: calc(100% + 6px);
    z-index: 60;
    min-width: min(100%, 220px);
    width: max(100%, 260px);
    max-width: min(92vw, 320px);
    max-height: min(56vh, 360px);
    overflow-y: auto;
    overflow-x: hidden;
    padding: 4px 0;
    background: #252526;
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

  .model-popup-refresh {
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

  .model-popup-refresh:hover {
    background: rgba(55, 148, 255, 0.12);
    color: #5cb3ff;
  }

  .model-popup-refresh :global(svg) {
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

  .context-footer {
    flex-shrink: 0;
    padding: 8px 10px 10px;
    border-top: 1px solid transparent;
    background: #252526;
    overflow: visible;
    position: relative;
    z-index: 1;
  }

  .context-bar {
    height: 3px;
    background: #3c3c3c;
    border-radius: 2px;
    overflow: hidden;
    margin-bottom: 4px;
  }

  .context-fill {
    height: 100%;
    background: linear-gradient(90deg, #4ec9b0, #569cd6);
    max-width: 100%;
    transition: width 0.2s ease;
  }

  .context-meta {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
    font-size: 10px;
    color: var(--muted-foreground);
  }

  .context-chat-tok {
    flex: 1;
    min-width: 0;
    text-align: left;
    font-variant-numeric: tabular-nums;
    user-select: none;
    white-space: nowrap;
  }

  .context-budget-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .context-numbers {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
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
    min-width: 0;
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
    background: #252526;
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
