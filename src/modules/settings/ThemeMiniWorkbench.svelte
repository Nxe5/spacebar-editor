<script lang="ts">
  import type { WorkbenchChromeMap } from "$lib/workbench/workbenchChrome";
  import type { EditorChromeMap } from "$lib/editor/editorChrome";
  import type { SyntaxColorMap } from "$lib/editor/syntaxColors";
  import type { ExplorerAppearanceMap } from "$lib/explorer/explorerAppearance";
  import type { ChatAppearanceMap } from "$lib/chat/chatAppearance";
  import {
    THEME_REGION_LABELS,
    type ThemePreviewRegion,
  } from "./themePreviewRegions";

  interface Props {
    selected: ThemePreviewRegion;
    onSelect: (region: ThemePreviewRegion) => void;
    workbenchChromeColors: WorkbenchChromeMap;
    editorColors: EditorChromeMap;
    syntaxColors: SyntaxColorMap;
    explorerColors: ExplorerAppearanceMap;
    chatColors: ChatAppearanceMap;
    shellFg?: string;
    mutedFg?: string;
    borderColor?: string;
  }

  let {
    selected,
    onSelect,
    workbenchChromeColors,
    editorColors,
    syntaxColors,
    explorerColors,
    chatColors,
    shellFg = "#c8c8c8",
    mutedFg = "#888888",
    borderColor = "color-mix(in srgb, #808080 35%, transparent)",
  }: Props = $props();

  const panelBorder = `1px solid ${borderColor}`;

</script>

<div class="mini-workbench" aria-label="Theme preview — click a region to edit its colors">
  <div class="mini-workbench__shell" style={`background:${workbenchChromeColors.panelBg}`}>
    <!-- Title bar -->
    <button
      type="button"
      class="mini-region mini-region--bar"
      class:mini-region--active={selected === "workbench-chrome"}
      style={`background:${workbenchChromeColors.panelBg};color:${mutedFg};border-bottom:${panelBorder}`}
      aria-pressed={selected === "workbench-chrome"}
      title="Title bar, tab strip, status bar, panel shells"
      onclick={() => onSelect("workbench-chrome")}
    >
      <span class="mini-workbench__title">Sidebar Editor</span>
      <span class="mini-workbench__window-dots" aria-hidden="true">
        <span></span><span></span><span></span>
      </span>
    </button>

    <!-- Tab strip -->
    <div
      class="mini-workbench__tab-strip"
      style={`background:${workbenchChromeColors.panelBg};border-bottom:${panelBorder}`}
    >
      <button
        type="button"
        class="mini-region mini-region--tab"
        class:mini-region--active={selected === "workbench-chrome"}
        style={`background:${workbenchChromeColors.controlActiveBg};color:${shellFg}`}
        aria-pressed={selected === "workbench-chrome"}
        title="Tabs and toolbar controls"
        onclick={() => onSelect("workbench-chrome")}
      >New chat</button>
      <button
        type="button"
        class="mini-region mini-region--tab"
        class:mini-region--active={selected === "workbench-chrome"}
        style={`background:${workbenchChromeColors.controlBg};color:${mutedFg}`}
        aria-pressed={selected === "workbench-chrome"}
        title="Tabs and toolbar controls"
        onclick={() => onSelect("workbench-chrome")}
      >file.ts</button>
      <button
        type="button"
        class="mini-region mini-region--tab mini-region--tab-plus"
        class:mini-region--active={selected === "workbench-chrome"}
        style={`background:${workbenchChromeColors.controlBg}`}
        aria-label="New tab"
        title="Tabs and toolbar controls"
        onclick={() => onSelect("workbench-chrome")}
      ></button>
    </div>

    <!-- Main body -->
    <div class="mini-workbench__body">
      <!-- Chat column -->
      <div class="mini-workbench__chat-col">
        <button
          type="button"
          class="mini-region mini-workbench__chat-panel"
          class:mini-region--active={selected === "chat" || selected === "workbench-chrome"}
          style={`background:${workbenchChromeColors.panelBg};border:${panelBorder}`}
          aria-pressed={selected === "chat"}
          title="Chat thread, message boxes, activity"
          onclick={() => onSelect("chat")}
        >
          <div
            class="mini-workbench__message"
            style={`background:${chatColors.messageBoxBg};color:${shellFg};border:${panelBorder}`}
          >
            Fix the auth bug
          </div>
          <p class="mini-workbench__agent-line" style={`color:${shellFg}`}>
            Checking auth middleware…
          </p>
          <p class="mini-workbench__thought" style={`color:${chatColors.thoughtLabelActiveColor}`}>
            Pondering…
          </p>
          <p class="mini-workbench__thought" style={`color:${chatColors.planLabelColor}`}>
            Plan: scan src/
          </p>
          <div class="mini-workbench__tools">
            <span style={`color:${chatColors.toolRunningColor}`}>read_file</span>
            <span class="mini-workbench__dot">·</span>
            <span style={`color:${chatColors.toolDoneColor}`}>grep</span>
          </div>
          <div
            class="mini-workbench__context-footer"
            style={`color:${mutedFg};border-top:${panelBorder}`}
          >
            2 files · 1.2k ctx
          </div>
          <div
            class="mini-workbench__composer"
            style={`border-top:${panelBorder}`}
          >
            <span
              class="mini-workbench__pill"
              style={`background:${workbenchChromeColors.controlBg};color:${mutedFg}`}
            >Agent</span>
            <span
              class="mini-workbench__pill"
              style={`background:${workbenchChromeColors.controlBg};color:${mutedFg}`}
            >model</span>
          </div>
        </button>
      </div>

      <!-- Editor column -->
      <div
        class="mini-workbench__editor-col"
        style={`background:${editorColors.bg};color:${editorColors.fg}`}
      >
        <button
          type="button"
          class="mini-region mini-workbench__editor"
          class:mini-region--active={selected === "editor"}
          aria-pressed={selected === "editor"}
          title="Editor surface"
          onclick={() => onSelect("editor")}
        >
          <div class="mini-workbench__editor-inner">
            <div class="mini-workbench__gutter" style={`color:${editorColors.gutterFg}`}>
              <span>1</span>
              <span>2</span>
              <span>3</span>
            </div>
            <div class="mini-workbench__code" role="presentation">
              <div class="mini-workbench__code-line">
                <span style="color:{syntaxColors.keyword}">export</span>
                <span style="color:{syntaxColors.keyword}"> function</span>
                <span style="color:{syntaxColors.function}"> hello</span><span style="color:{syntaxColors.punctuation}">()</span>
                <span style="color:{syntaxColors.punctuation}"> {'{'}</span>
              </div>
              <div
                class="mini-workbench__code-line mini-workbench__code-line--active"
                style={`background:${editorColors.lineHighlight}`}
              >
                <span style="color:{syntaxColors.keyword}">  return</span>
                <span
                  class="mini-workbench__selection"
                  style={`background:${editorColors.selection}`}
                ><span style="color:{syntaxColors.string}">"world"</span></span><span
                  class="mini-workbench__cursor"
                  style={`background:${editorColors.cursor}`}
                ></span><span style="color:{syntaxColors.punctuation}">;</span>
              </div>
              <div class="mini-workbench__code-line">
                <span style="color:{syntaxColors.punctuation}">{'}'}</span>
              </div>
              <div class="mini-workbench__code-line mini-workbench__code-line--match-demo">
                <span style="color:{syntaxColors.function}">log</span><span style="color:{syntaxColors.punctuation}">(</span><span
                  class="mini-workbench__match"
                  style={`background:color-mix(in srgb, ${editorColors.selectionMatch} 38%, transparent)`}
                ><span style="color:{syntaxColors.string}">"world"</span></span><span style="color:{syntaxColors.punctuation}">);</span>
              </div>
            </div>
          </div>
        </button>
        <button
          type="button"
          class="mini-region mini-workbench__syntax-hit"
          class:mini-region--active={selected === "syntax"}
          aria-pressed={selected === "syntax"}
          title="Syntax token colors"
          onclick={() => onSelect("syntax")}
        >Syntax</button>
      </div>

      <!-- Explorer column -->
      <button
        type="button"
        class="mini-region mini-workbench__explorer"
        class:mini-region--active={selected === "explorer" || selected === "workbench-chrome"}
        style={`background:${workbenchChromeColors.panelBg};border:${panelBorder}`}
        aria-pressed={selected === "explorer"}
        title="Explorer tree and git colors"
        onclick={() => onSelect("explorer")}
      >
        <div class="mini-workbench__explorer-head" style={`color:${mutedFg}`}>EXPLORER</div>
        <div
          class="mini-workbench__tree-row mini-workbench__tree-row--selected"
          style={`background:${explorerColors.selectionBg};color:${explorerColors.folderModifiedColor}`}
        >
          ▼ src
        </div>
        <div class="mini-workbench__tree-row" style={`color:${explorerColors.fileModifiedColor}`}>
          &nbsp;&nbsp;file.ts
        </div>
        <div class="mini-workbench__tree-row" style={`color:${explorerColors.fileUntrackedColor}`}>
          &nbsp;&nbsp;new.ts
        </div>
        <div class="mini-workbench__tree-row" style={`color:${explorerColors.folderOpenFileColor}`}>
          ▶ lib
        </div>
      </button>
    </div>

    <!-- Status bar -->
    <button
      type="button"
      class="mini-region mini-region--bar mini-workbench__status"
      class:mini-region--active={selected === "workbench-chrome"}
      style={`background:${workbenchChromeColors.panelBg};color:${mutedFg};border-top:${panelBorder}`}
      aria-pressed={selected === "workbench-chrome"}
      title="Status bar"
      onclick={() => onSelect("workbench-chrome")}
    >
      workspace · main · Ln 2
    </button>
  </div>

  <div class="mini-workbench__legend" aria-hidden="true">
    {#each Object.entries(THEME_REGION_LABELS) as [id, label]}
      <button
        type="button"
        class="mini-workbench__legend-item"
        class:mini-workbench__legend-item--active={selected === id}
        onclick={() => onSelect(id as ThemePreviewRegion)}
      >
        {label}
      </button>
    {/each}
  </div>
</div>

<style>
  .mini-workbench {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .mini-workbench__shell {
    display: flex;
    flex-direction: column;
    border-radius: 8px;
    border: 1px solid #383838;
    overflow: hidden;
    font-size: 9px;
    line-height: 1.35;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  }

  .mini-region {
    margin: 0;
    padding: 0;
    border: none;
    font: inherit;
    text-align: inherit;
    cursor: pointer;
    transition: outline-color 0.12s ease;
  }

  .mini-region:focus-visible {
    outline: 2px solid #6ca6e8;
    outline-offset: -2px;
    z-index: 1;
  }

  .mini-region--active {
    outline: 2px solid color-mix(in srgb, #6ca6e8 75%, transparent);
    outline-offset: -2px;
    z-index: 1;
  }

  .mini-region--bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 4px 8px;
    min-height: 20px;
  }

  .mini-workbench__title {
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .mini-workbench__window-dots {
    display: flex;
    gap: 3px;
  }

  .mini-workbench__window-dots span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: color-mix(in srgb, currentColor 35%, transparent);
  }

  .mini-workbench__tab-strip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 6px;
    min-height: 22px;
  }

  .mini-region--tab {
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 8px;
    white-space: nowrap;
  }

  .mini-region--tab-plus {
    width: 12px;
    height: 12px;
    padding: 0;
    border-radius: 999px;
    margin-left: auto;
    flex-shrink: 0;
  }

  .mini-workbench__body {
    display: flex;
    min-height: 140px;
    flex: 1;
  }

  .mini-workbench__chat-col {
    flex: 0 0 32%;
    min-width: 0;
    padding: 4px;
    box-sizing: border-box;
  }

  .mini-workbench__chat-panel {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    height: 100%;
    min-height: 132px;
    padding: 5px;
    border-radius: 6px;
    box-sizing: border-box;
  }

  .mini-workbench__message {
    padding: 4px 6px;
    border-radius: 5px;
    font-size: 8px;
    text-align: left;
  }

  .mini-workbench__agent-line {
    margin: 0;
    font-size: 8px;
    text-align: left;
    opacity: 0.85;
  }

  .mini-workbench__thought {
    margin: 0;
    font-size: 8px;
    font-style: italic;
    text-align: left;
  }

  .mini-workbench__tools {
    display: flex;
    align-items: center;
    gap: 3px;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 7px;
    text-align: left;
  }

  .mini-workbench__dot {
    opacity: 0.4;
  }

  .mini-workbench__context-footer {
    margin-top: auto;
    padding-top: 3px;
    font-size: 7px;
    text-align: left;
  }

  .mini-workbench__composer {
    display: flex;
    gap: 3px;
    padding-top: 4px;
  }

  .mini-workbench__pill {
    border-radius: 999px;
    padding: 2px 5px;
    font-size: 7px;
  }

  .mini-workbench__editor-col {
    position: relative;
    flex: 1 1 0;
    min-width: 0;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 8px;
  }

  .mini-workbench__editor {
    width: 100%;
    height: 100%;
    min-height: 132px;
    padding: 4px 6px;
    background: transparent;
    box-sizing: border-box;
  }

  .mini-workbench__editor-inner {
    display: flex;
    gap: 6px;
    height: 100%;
  }

  .mini-workbench__gutter {
    display: flex;
    flex-direction: column;
    gap: 1px;
    text-align: right;
    user-select: none;
    opacity: 0.85;
    flex-shrink: 0;
  }

  .mini-workbench__code {
    flex: 1;
    min-width: 0;
    text-align: left;
  }

  .mini-workbench__code-line {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0 1px;
    border-radius: 2px;
  }

  .mini-workbench__code-line--active {
    margin: 1px 0;
  }

  .mini-workbench__selection {
    padding: 0 1px;
    border-radius: 2px;
  }

  .mini-workbench__match {
    padding: 0 1px;
    border-radius: 2px;
  }

  .mini-workbench__cursor {
    display: inline-block;
    width: 1px;
    height: 1em;
    margin-left: 1px;
    vertical-align: text-bottom;
  }

  .mini-workbench__syntax-hit {
    position: absolute;
    right: 4px;
    bottom: 4px;
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 7px;
    font-family: inherit;
    color: #888;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid #444;
  }

  .mini-workbench__syntax-hit.mini-region--active {
    color: #d4d4d4;
    border-color: #6ca6e8;
  }

  .mini-workbench__explorer {
    flex: 0 0 24%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 4px 4px 4px 0;
    padding: 5px;
    border-radius: 6px;
    text-align: left;
  }

  .mini-workbench__explorer-head {
    font-size: 7px;
    font-weight: 600;
    letter-spacing: 0.06em;
    margin-bottom: 2px;
  }

  .mini-workbench__tree-row {
    padding: 1px 3px;
    border-radius: 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 8px;
  }

  .mini-workbench__status {
    font-size: 8px;
    min-height: 16px;
  }

  .mini-workbench__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .mini-workbench__legend-item {
    padding: 2px 8px;
    font-size: 10px;
    color: #737373;
    background: #1c1c1c;
    border: 1px solid #383838;
    border-radius: 999px;
    cursor: pointer;
  }

  .mini-workbench__legend-item:hover {
    color: #d4d4d4;
    border-color: #525252;
  }

  .mini-workbench__legend-item--active {
    color: #e8e8e8;
    border-color: #6ca6e8;
    background: #252530;
  }
</style>
