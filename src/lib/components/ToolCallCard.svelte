<script lang="ts">
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import FileText from "@lucide/svelte/icons/file-text";
  import {
    formatToolInput,
    formatToolOutput,
    formatToolSummary,
    shouldRenderToolOutputAsMarkdown,
    toolOutputDisplayBody,
    toolResultIsError,
    workspaceRelativePath,
  } from "$lib/agent/toolDisplay";
  import ChatMarkdown from "$lib/components/ChatMarkdown.svelte";

  let {
    toolName = "tool",
    toolInput = {},
    content = "",
    success = true,
    filePaths = [],
    workspacePath = "",
    expanded = false,
    onToggle,
    onOpenFile,
  }: {
    toolName?: string;
    toolInput?: Record<string, unknown>;
    content?: string;
    success?: boolean;
    filePaths?: string[];
    workspacePath?: string;
    expanded?: boolean;
    onToggle?: () => void;
    onOpenFile?: (path: string) => void;
  } = $props();

  let summary = $derived(formatToolSummary(toolName, toolInput));
  let inputText = $derived(formatToolInput(toolName, toolInput));
  let outputText = $derived(formatToolOutput(content));
  let outputMarkdown = $derived(shouldRenderToolOutputAsMarkdown(toolName, content));
  let outputBody = $derived(toolOutputDisplayBody(toolName, content));
  let failed = $derived(!success || toolResultIsError(content));
</script>

<div class="tool-call-card" class:failed>
  <div class="tool-call-head">
    <button type="button" class="tool-call-toggle" onclick={() => onToggle?.()} aria-expanded={expanded}>
      <span class="tool-call-chevron" class:expanded>
        <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
      </span>
      <span class="tool-name">{toolName}</span>
      {#if summary}
        <span class="tool-call-summary">{summary}</span>
      {/if}
      <span class="tool-call-status" class:error={failed}>{failed ? "failed" : "ok"}</span>
    </button>
  </div>

  {#if filePaths.length > 0}
    <div class="tool-file-links">
      {#each filePaths as path}
        <button
          type="button"
          class="tool-file-link"
          title={path}
          onclick={() => onOpenFile?.(path)}
        >
          <FileText size={12} strokeWidth={1.75} aria-hidden="true" />
          <span>{workspacePath ? workspaceRelativePath(workspacePath, path) : path.split("/").pop()}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if expanded}
    <div class="tool-call-body">
      <p class="tool-call-section-label">Input</p>
      <pre class="tool-call-pre">{inputText}</pre>
      <p class="tool-call-section-label">Output</p>
      {#if outputMarkdown}
        <div class="tool-call-markdown">
          <ChatMarkdown content={outputBody} />
        </div>
      {:else}
        <pre class="tool-call-pre tool-call-output">{outputText || "(empty)"}</pre>
      {/if}
    </div>
  {/if}
</div>

<style>
  .tool-call-card {
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    overflow: hidden;
    min-width: 0;
    max-width: 100%;
  }

  .tool-call-card.failed {
    border-left: 2px solid #f14c4c;
  }

  .tool-call-card:not(.failed) {
    border-left: 2px solid #4ec9b0;
  }

  .tool-call-head {
    display: flex;
    align-items: stretch;
  }

  .tool-call-toggle {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding: 6px 8px;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .tool-call-toggle:hover {
    background: color-mix(in srgb, var(--foreground) 4%, transparent);
  }

  .tool-call-chevron {
    display: inline-flex;
    flex-shrink: 0;
    color: var(--muted-foreground);
    transition: transform 0.15s ease;
  }

  .tool-call-chevron.expanded {
    transform: rotate(90deg);
  }

  .tool-name {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    color: #4ec9b0;
    flex-shrink: 0;
  }

  .tool-call-summary {
    font-size: 10px;
    color: var(--muted-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    flex: 1;
  }

  .tool-call-status {
    font-size: 9px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #4ec9b0;
    flex-shrink: 0;
  }

  .tool-call-status.error {
    color: #f14c4c;
  }

  .tool-file-links {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 0 8px 6px;
  }

  .tool-file-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, #4ec9b0 35%, var(--border));
    background: color-mix(in srgb, #4ec9b0 8%, var(--background));
    color: #4ec9b0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 10px;
    cursor: pointer;
  }

  .tool-file-link:hover {
    border-color: #4ec9b0;
    background: color-mix(in srgb, #4ec9b0 14%, var(--background));
  }

  .tool-call-body {
    border-top: 1px solid var(--border);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tool-call-section-label {
    margin: 0;
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted-foreground);
  }

  .tool-call-pre {
    margin: 0 0 6px;
    padding: 8px;
    border-radius: 4px;
    background: var(--muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 10px;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 280px;
    overflow: auto;
  }

  .tool-call-output {
    margin-bottom: 0;
  }

  .tool-call-markdown {
    margin: 0 0 6px;
    padding: 8px;
    border-radius: 4px;
    background: var(--muted);
    max-height: 280px;
    overflow: auto;
    font-size: 11px;
    line-height: 1.5;
  }
</style>
