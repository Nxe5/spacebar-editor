<script lang="ts">
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import FileIcon from "$lib/components/FileIcon.svelte";
  import {
    buildUnifiedDiffDisplay,
    diffLineStats,
    newFileContentFromToolInput,
    sliceDiffPreview,
    type DiffDisplayLine,
  } from "$lib/agent/fileChangeDiff";
  import { workspaceRelativePath } from "$lib/agent/toolDisplay";

  const COLLAPSED_LINES = 4;

  let {
    toolName,
    toolInput = {},
    fileDiffBefore = "",
    workspacePath = "",
    expanded = false,
    onToggleExpand,
    onOpenDiff,
  }: {
    toolName: string;
    toolInput?: Record<string, unknown>;
    fileDiffBefore?: string;
    workspacePath?: string;
    expanded?: boolean;
    onToggleExpand?: () => void;
    onOpenDiff?: (path: string, diffBase: string) => void;
  } = $props();

  let relPath = $derived(
    typeof toolInput.path === "string" ? toolInput.path.trim() : ""
  );
  let fileName = $derived(relPath.split("/").pop() ?? relPath);
  let newText = $derived(newFileContentFromToolInput(toolInput));
  let oldText = $derived(fileDiffBefore ?? "");
  let stats = $derived(diffLineStats(oldText, newText));
  let allLines = $derived(buildUnifiedDiffDisplay(oldText, newText));
  let visibleLines = $derived(sliceDiffPreview(allLines, COLLAPSED_LINES, expanded));
  let canExpand = $derived(allLines.length > COLLAPSED_LINES);

  function lineKey(line: DiffDisplayLine, index: number): string {
    if (line.kind === "del") return `del-${index}-${line.text}`;
    return `${line.kind}-${line.newLine}-${index}`;
  }

  function openDiff() {
    if (!relPath || !onOpenDiff) return;
    onOpenDiff(relPath, oldText);
  }
</script>

<div class="file-change-bubble" class:expanded>
  <button type="button" class="file-change-head" onclick={openDiff} title="Open diff in editor">
    <span class="file-change-icon" aria-hidden="true">
      <FileIcon name={fileName} size={16} />
    </span>
    <span class="file-change-name">
      {workspacePath && relPath
        ? workspaceRelativePath(workspacePath, relPath)
        : fileName}
    </span>
    <span class="file-change-stats">
      {#if stats.additions > 0}
        <span class="stat-add">+{stats.additions}</span>
      {/if}
      {#if stats.deletions > 0}
        <span class="stat-del">−{stats.deletions}</span>
      {/if}
      {#if stats.additions === 0 && stats.deletions === 0}
        <span class="stat-neutral">0</span>
      {/if}
    </span>
  </button>

  {#if visibleLines.length > 0}
    <div class="file-change-preview" class:scrollable={expanded}>
      {#each visibleLines as line, i (lineKey(line, i))}
        <div
          class="diff-line"
          class:diff-line--add={line.kind === "add"}
          class:diff-line--del={line.kind === "del"}
          class:diff-line--ctx={line.kind === "ctx"}
        >
          <span class="diff-gutter">
            {#if line.kind === "del"}
              <span class="diff-sign">−</span>
            {:else}
              <span class="diff-ln">{line.newLine}</span>
            {/if}
          </span>
          <code class="diff-text">{line.text || " "}</code>
        </div>
      {/each}
    </div>
  {/if}

  {#if canExpand}
    <button
      type="button"
      class="file-change-expand"
      aria-expanded={expanded}
      aria-label={expanded ? "Collapse diff preview" : "Expand diff preview"}
      onclick={() => onToggleExpand?.()}
    >
      <ChevronDown
        size={14}
        strokeWidth={2}
        class="expand-chevron{expanded ? ' open' : ''}"
      />
    </button>
  {/if}
</div>

<style>
  .file-change-bubble {
    position: relative;
    border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--background) 88%, var(--muted));
    overflow: hidden;
    min-width: 0;
    max-width: 100%;
  }

  .file-change-head {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background-color var(--motion-fast, 140ms);
  }

  .file-change-head:hover {
    background: color-mix(in srgb, var(--foreground) 5%, transparent);
  }

  .file-change-head:active {
    background: color-mix(in srgb, var(--foreground) 8%, transparent);
  }

  .file-change-icon {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
  }

  .file-change-name {
    flex: 1;
    min-width: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    font-weight: 500;
    color: var(--foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-change-stats {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 10px;
    font-weight: 600;
  }

  .stat-add {
    color: #3fb950;
  }

  .stat-del {
    color: #f85149;
  }

  .stat-neutral {
    color: var(--muted-foreground);
  }

  .file-change-preview {
    border-top: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 10px;
    line-height: 1.45;
  }

  .file-change-preview.scrollable {
    max-height: 220px;
    overflow: auto;
  }

  .diff-line {
    display: flex;
    align-items: stretch;
    min-width: 0;
  }

  .diff-line--add {
    background: color-mix(in srgb, #3fb950 16%, transparent);
  }

  .diff-line--del {
    background: color-mix(in srgb, #f85149 14%, transparent);
  }

  .diff-line--ctx {
    background: transparent;
  }

  .diff-gutter {
    flex: 0 0 2.25rem;
    padding: 0 6px 0 4px;
    text-align: right;
    color: var(--muted-foreground);
    user-select: none;
    border-right: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
  }

  .diff-sign {
    color: #f85149;
    font-weight: 700;
  }

  .diff-text {
    flex: 1;
    min-width: 0;
    padding: 1px 8px;
    white-space: pre;
    overflow-x: auto;
    color: var(--foreground);
  }

  .file-change-expand {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 2px 0 4px;
    border: none;
    border-top: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
    opacity: 0;
    transition:
      opacity var(--motion-fast, 140ms),
      background-color var(--motion-fast, 140ms);
  }

  .file-change-bubble:hover .file-change-expand,
  .file-change-bubble.expanded .file-change-expand {
    opacity: 1;
  }

  .file-change-expand:hover {
    background: color-mix(in srgb, var(--foreground) 6%, transparent);
    color: var(--foreground);
  }

  .file-change-expand:active {
    background: color-mix(in srgb, var(--foreground) 10%, transparent);
  }

  .file-change-expand :global(.expand-chevron) {
    transition: transform var(--motion-fast, 140ms);
  }

  .file-change-expand :global(.expand-chevron.open) {
    transform: rotate(180deg);
  }
</style>
