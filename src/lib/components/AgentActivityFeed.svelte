<script lang="ts">
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import type { AgentTurnBlock, ToolActivityItem } from "$lib/agent/activity";
  import {
    formatThoughtPreview,
    isRedundantToolTurnResponse,
  } from "$lib/agent/activity";
  import {
    formatToolInput,
    formatToolOutput,
    shouldRenderToolOutputAsMarkdown,
    toolOutputDisplayBody,
    toolCompactLabel,
    toolFileLine,
    toolResultIsError,
  } from "$lib/agent/toolDisplay";
  import { chatAppearance } from "$lib/stores/chatAppearance";
  import ChatMarkdown from "$lib/components/ChatMarkdown.svelte";

  let {
    turn,
    workspacePath = "",
    streaming = false,
    thinkingOpen = false,
    planOpen = false,
    responseOpen = true,
    toolsOpen = false,
    onToggleThinking,
    onTogglePlan,
    onToggleResponse,
    onToggleTools,
    onOpenFile,
  }: {
    turn: AgentTurnBlock;
    workspacePath?: string;
    streaming?: boolean;
    thinkingOpen?: boolean;
    planOpen?: boolean;
    responseOpen?: boolean;
    toolsOpen?: boolean;
    onToggleThinking?: () => void;
    onTogglePlan?: () => void;
    onToggleResponse?: () => void;
    onToggleTools?: () => void;
    onOpenFile?: (path: string) => void;
  } = $props();

  let hasThinking = $derived(Boolean(turn.thinking.trim()));
  let hasPlan = $derived(
    Boolean(turn.planText.trim()) &&
      turn.planText.trim() !== turn.response.trim() &&
      turn.planText.trim() !== turn.thinking.trim() &&
      (!streaming || turn.tools.length > 0)
  );
  let planPreview = $derived(formatThoughtPreview(turn.planText));
  let hasTools = $derived(turn.tools.length > 0);
  let hasResponse = $derived(Boolean(turn.response.trim()));
  let showResponse = $derived(hasResponse && !isRedundantToolTurnResponse(turn));
  let responseExpanded = $derived(streaming ? true : responseOpen);
  let toolsExpanded = $derived(toolsOpen);
  let toolsRunning = $derived(
    turn.tools.some((t) => (t.status === "running" || t.status === "pending") && !t.content)
  );
  let showWaiting = $derived(
    streaming && !hasTools && !hasThinking && !hasPlan && !showResponse
  );
  let waitingStyle = $derived($chatAppearance.waitingStyle);
  let showDotsWaiting = $derived(showWaiting && waitingStyle === "dots");
  let showThoughtRow = $derived(
    hasThinking || (showWaiting && waitingStyle === "spinner-row")
  );
  let thoughtRowStreaming = $derived(
    streaming && (showWaiting || (hasThinking && !thinkingOpen))
  );

  let activityLabel = $derived(turn.statusLabel);

  function toolChipState(tool: ToolActivityItem): "running" | "failed" | "success" {
    const failed =
      tool.status === "error" ||
      (tool.content != null && toolResultIsError(tool.content));
    if (failed) return "failed";
    if (tool.status === "running" || tool.status === "pending") return "running";
    return "success";
  }

  function toolOpenPath(tool: ToolActivityItem): string | null {
    return tool.paths?.[0] ?? null;
  }
</script>

<div class="activity-feed">
  {#if showDotsWaiting}
    <p class="activity-waiting" aria-live="polite" aria-busy="true">
      <span class="activity-status-word">{activityLabel}</span>
      <span class="activity-dots" aria-hidden="true">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      </span>
    </p>
  {/if}

  {#if showThoughtRow}
    <div class="activity-tool" class:running={thoughtRowStreaming}>
      {#if hasThinking}
        <button
          type="button"
          class="activity-tool-line activity-thinking-line activity-row-toggle"
          onclick={() => onToggleThinking?.()}
          aria-expanded={thinkingOpen}
        >
          {#if thoughtRowStreaming}
            <LoaderCircle size={12} strokeWidth={2} class="activity-spinner" aria-hidden="true" />
          {/if}
          <span class="activity-row-label">
            <span class="activity-tool-text activity-thinking-text">{activityLabel}</span>
            <span class="activity-chevron" class:open={thinkingOpen}>
              <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
            </span>
          </span>
        </button>
        {#if thinkingOpen}
          <div class="activity-thinking-body">
            <ChatMarkdown content={turn.thinking} tone="muted" />
          </div>
        {/if}
      {:else}
        <div class="activity-tool-line activity-thinking-line" aria-live="polite" aria-busy="true">
          <LoaderCircle size={12} strokeWidth={2} class="activity-spinner" aria-hidden="true" />
          <span class="activity-tool-text activity-thinking-text">{activityLabel}</span>
        </div>
      {/if}
    </div>
  {/if}

  {#if hasPlan}
    <div class="activity-tool">
      <button
        type="button"
        class="activity-tool-line activity-thinking-line activity-plan-line activity-row-toggle"
        onclick={() => onTogglePlan?.()}
        aria-expanded={planOpen}
      >
        <span class="activity-row-label">
          <span class="activity-tool-text activity-thinking-text">Plan</span>
          {#if !planOpen && planPreview}
            <span class="activity-section-preview">{planPreview}</span>
          {/if}
          <span class="activity-chevron" class:open={planOpen}>
            <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
          </span>
        </span>
      </button>
      {#if planOpen}
        <div class="activity-thinking-body">
          <ChatMarkdown content={turn.planText} tone="muted" />
        </div>
      {/if}
    </div>
  {/if}

  {#if hasTools}
    <div class="activity-tools-block" class:running={toolsRunning}>
      <button
        type="button"
        class="activity-tool-line activity-row-toggle"
        onclick={() => onToggleTools?.()}
        aria-expanded={toolsExpanded}
      >
        {#if toolsRunning}
          <LoaderCircle size={12} strokeWidth={2} class="activity-spinner" aria-hidden="true" />
        {/if}
        <span class="activity-row-label">
          <span class="activity-tool-chips">
            {#each turn.tools as tool, i (tool.id)}
              {#if i > 0}<span class="activity-chip-sep" aria-hidden="true">·</span>{/if}
              {@const state = toolChipState(tool)}
              <span
                class="activity-tool-chip"
                class:success={state === "success"}
                class:failed={state === "failed"}
                class:running={state === "running"}
              >
                {toolCompactLabel(tool.name)}
              </span>
            {/each}
          </span>
          <span class="activity-chevron" class:open={toolsExpanded}>
            <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
          </span>
        </span>
      </button>

      {#if toolsExpanded}
        <div class="activity-tools-detail">
          {#each turn.tools as tool (tool.id)}
            {@const fileLine = toolFileLine(tool.name, tool.input, workspacePath)}
            {@const openPath = toolOpenPath(tool)}
            {@const hasInput = Object.keys(tool.input).length > 0}
            <div class="activity-tool-detail">
              {#if fileLine}
                <p class="activity-detail-line">
                  <span class="activity-detail-key">file:</span>
                  {#if openPath && onOpenFile}
                    <button
                      type="button"
                      class="activity-detail-link"
                      onclick={() => onOpenFile(openPath)}
                    >
                      {fileLine}
                    </button>
                  {:else}
                    <span class="activity-detail-value">{fileLine}</span>
                  {/if}
                </p>
              {/if}
              {#if hasInput}
                <p class="activity-detail-key">input:</p>
                <pre class="activity-detail-block">{formatToolInput(tool.name, tool.input)}</pre>
              {/if}
              {#if tool.content}
                <p class="activity-detail-key">output:</p>
                {#if shouldRenderToolOutputAsMarkdown(tool.name, tool.content)}
                  <div class="activity-detail-markdown">
                    <ChatMarkdown content={toolOutputDisplayBody(tool.name, tool.content)} />
                  </div>
                {:else}
                  <pre class="activity-detail-block">{formatToolOutput(tool.content)}</pre>
                {/if}
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  {#if showResponse}
    <div class="activity-tool activity-response-block">
      <button
        type="button"
        class="activity-tool-line activity-response-line activity-row-toggle"
        onclick={() => onToggleResponse?.()}
        aria-expanded={responseExpanded}
      >
        <span class="activity-row-label">
          <span class="activity-tool-text activity-response-label">Response</span>
          <span class="activity-chevron" class:open={responseExpanded}>
            <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
          </span>
        </span>
      </button>
      {#if responseExpanded}
        <div class="activity-response-body">
          <ChatMarkdown content={turn.response} />
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .activity-feed {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    max-width: 100%;
  }

  .activity-section-toggle,
  .activity-tool-line {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 2px 2px;
    border: none;
    background: transparent;
    color: var(--muted-foreground);
    font: inherit;
    font-size: 11px;
    text-align: left;
    cursor: pointer;
  }

  .activity-section-toggle:hover,
  .activity-tool-line:hover {
    color: var(--foreground);
  }

  .activity-row-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    max-width: 100%;
    flex: 0 1 auto;
  }

  .activity-chevron {
    display: inline-flex;
    flex-shrink: 0;
    opacity: 0;
    transition:
      opacity 0.12s ease,
      transform 0.15s ease;
  }

  .activity-row-toggle:hover .activity-chevron,
  .activity-row-toggle:focus-visible .activity-chevron {
    opacity: 1;
  }

  .activity-chevron.open {
    transform: rotate(90deg);
  }

  .activity-section-preview {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    max-width: 12rem;
    flex: 0 1 auto;
    font-size: 10px;
  }

  .activity-thinking-text {
    flex: 0 1 auto;
    color: var(--chat-thought-label, #b8a8e8);
    font-family: inherit;
    text-transform: none;
    letter-spacing: normal;
  }

  .activity-tool.running .activity-thinking-text {
    color: var(--chat-thought-label-active, #c9b8f0);
  }

  .activity-plan-line .activity-thinking-text {
    color: var(--chat-plan-label, var(--chat-thought-label, #b8a8e8));
  }

  .activity-response-label {
    flex: 0 1 auto;
    color: var(--foreground);
    font-family: inherit;
    text-transform: none;
    letter-spacing: normal;
  }

  .activity-thinking-body,
  .activity-response-body,
  .activity-tools-detail {
    width: 100%;
    min-width: 0;
    margin-top: 2px;
    padding: 2px 2px 4px;
    box-sizing: border-box;
  }

  .activity-tool-chips {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 4px;
    min-width: 0;
  }

  .activity-chip-sep {
    color: var(--muted-foreground);
    opacity: 0.45;
    user-select: none;
  }

  .activity-tool-chip {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    line-height: 1.3;
    flex-shrink: 0;
  }

  .activity-tool-chip.success {
    color: var(--chat-activity-tool-done, #7dd3c0);
  }

  .activity-tool-chip.failed {
    color: var(--chat-activity-tool-failed, #f08080);
  }

  .activity-tool-chip.running {
    color: var(--chat-activity-tool-running, #9ec9b8);
  }

  .activity-tool-text {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
  }

  .activity-tool-detail + .activity-tool-detail {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
  }

  .activity-detail-line {
    margin: 0 0 4px;
    font-size: 11px;
    line-height: 1.45;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px;
  }

  .activity-detail-key {
    margin: 0 0 2px;
    font-size: 11px;
    line-height: 1.45;
    color: var(--muted-foreground);
    font-family: inherit;
  }

  .activity-detail-value {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    color: var(--foreground);
    word-break: break-word;
  }

  .activity-detail-link {
    padding: 0;
    border: none;
    background: transparent;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    color: var(--chat-activity-file-link, #4ec9b0);
    cursor: pointer;
    text-align: left;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .activity-detail-link:hover {
    color: var(--foreground);
  }

  .activity-detail-markdown {
    margin: 0 0 6px;
    padding: 8px 10px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--muted) 40%, transparent);
    max-height: 320px;
    overflow: auto;
    font-size: 12px;
    line-height: 1.55;
  }

  .activity-detail-markdown :global(.chat-markdown) {
    font-size: inherit;
  }

  .activity-detail-block {
    margin: 0 0 6px;
    padding: 0;
    border: none;
    background: transparent;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
    color: color-mix(in srgb, var(--muted-foreground) 88%, var(--foreground));
    max-height: 240px;
    overflow: auto;
  }

  :global(.activity-spinner) {
    flex-shrink: 0;
    animation: spin 0.9s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .activity-waiting {
    display: flex;
    align-items: center;
    gap: 0;
    margin: 0;
    padding: 2px 0;
    font-size: 11px;
    line-height: 1.4;
    color: var(--chat-thought-label, #b8a8e8);
  }

  .activity-status-word {
    font-style: italic;
    letter-spacing: 0.01em;
  }

  .activity-dots {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-left: 2px;
    padding-bottom: 1px;
  }

  .activity-dots .dot {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.45;
    animation: pulse 1.2s ease-in-out infinite;
  }

  .activity-dots .dot:nth-child(2) {
    animation-delay: 0.15s;
  }

  .activity-dots .dot:nth-child(3) {
    animation-delay: 0.3s;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.35;
    }
    50% {
      opacity: 1;
    }
  }
</style>
