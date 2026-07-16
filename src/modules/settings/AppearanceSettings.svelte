<script lang="ts">
  import { tick } from "svelte";
  import { syntaxTheme } from "$lib/stores/syntaxTheme";
  import { editorChrome } from "$lib/stores/editorChrome";
  import { explorerAppearance } from "$lib/stores/explorerAppearance";
  import { chatAppearance } from "$lib/stores/chatAppearance";
  import { contextAppearance } from "$lib/stores/contextAppearance";
  import { workbenchChrome } from "$lib/stores/workbenchChrome";
  import { SYNTAX_COLOR_FIELDS, CSS_VAR_BY_KEY, defaultSyntaxColors, type SyntaxColorMap } from "$lib/editor/syntaxColors";
  import { EDITOR_CHROME_FIELDS, EDITOR_CHROME_DEFAULTS, type EditorChromeMap } from "$lib/editor/editorChrome";
  import {
    EXPLORER_COLOR_FIELDS,
    EXPLORER_COLOR_CSS_VARS,
    EXPLORER_APPEARANCE_DEFAULTS,
    type ExplorerAppearanceMap,
  } from "$lib/explorer/explorerAppearance";
  import {
    CHAT_APPEARANCE_COLOR_FIELDS,
    CHAT_APPEARANCE_CSS_VARS,
    CHAT_APPEARANCE_DEFAULTS,
    CHAT_WAITING_STYLE_OPTIONS,
    type ChatAppearanceMap,
    type ChatWaitingStyle,
  } from "$lib/chat/chatAppearance";
  import {
    CONTEXT_APPEARANCE_COLOR_FIELDS,
    CONTEXT_APPEARANCE_CSS_VARS,
    CONTEXT_APPEARANCE_DEFAULTS,
    type ContextAppearanceMap,
  } from "$lib/chat/contextAppearance";
  import {
    WORKBENCH_CHROME_FIELDS,
    WORKBENCH_CHROME_DEFAULTS,
    WORKBENCH_CHROME_THEME_SOURCES,
    type WorkbenchChromeMap,
  } from "$lib/workbench/workbenchChrome";
  import { readThemeCssVar } from "$lib/themeColorReset";
  import {
    WORKBENCH_THEME_OPTIONS,
    applyWorkbenchTheme,
    normalizeWorkbenchTheme,
    type WorkbenchThemeId,
  } from "$lib/workbench-theme";

  import { settings } from "$lib/stores/settings";
  import SettingsColorField from "./SettingsColorField.svelte";
  import ThemeMiniWorkbench from "./ThemeMiniWorkbench.svelte";
  import {
    THEME_REGION_LABELS,
    type ThemePreviewRegion,
  } from "./themePreviewRegions";

  export type AppearanceSection = "appearance-theme";

  interface Props {
    section: AppearanceSection;
    syntaxColors: SyntaxColorMap;
    editorColors: EditorChromeMap;
    explorerColors: ExplorerAppearanceMap;
    chatColors: ChatAppearanceMap;
    contextColors: ContextAppearanceMap;
    workbenchChromeColors: WorkbenchChromeMap;
    workbenchTheme: WorkbenchThemeId;
    onNavigate: (section: "general") => void;
  }

  let {
    section,
    syntaxColors = $bindable(),
    editorColors = $bindable(),
    explorerColors = $bindable(),
    chatColors = $bindable(),
    contextColors = $bindable(),
    workbenchChromeColors = $bindable(),
    workbenchTheme = $bindable(),
    onNavigate,
  }: Props = $props();

  let selectedRegion = $state<ThemePreviewRegion>("workbench-chrome");

  async function selectThemeRegion(region: ThemePreviewRegion) {
    selectedRegion = region;
    await tick();
    document
      .getElementById(`theme-region-${region}`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function resetRegionColors(region: ThemePreviewRegion) {
    switch (region) {
      case "workbench-chrome":
        workbenchChromeColors = workbenchChrome.resetToDefaults();
        break;
      case "editor":
        editorColors = editorChrome.resetToDefaults();
        break;
      case "syntax":
        syntaxColors = syntaxTheme.resetToDefaults();
        break;
      case "explorer":
        explorerColors = explorerAppearance.resetToDefaults();
        break;
      case "chat":
        chatColors = chatAppearance.resetToDefaults();
        break;
    }
  }

  function setEditorColor(key: keyof EditorChromeMap, value: string) {
    editorColors = { ...editorColors, [key]: value };
    editorChrome.apply(editorColors);
  }

  function setExplorerColor(key: keyof ExplorerAppearanceMap, value: string) {
    explorerColors = { ...explorerColors, [key]: value };
    explorerAppearance.apply(explorerColors);
  }

  function setChatColor(key: keyof ChatAppearanceMap, value: string) {
    chatColors = { ...chatColors, [key]: value };
    chatAppearance.apply(chatColors);
  }

  function setContextColor(key: keyof ContextAppearanceMap, value: string) {
    contextColors = { ...contextColors, [key]: value };
    contextAppearance.apply(contextColors);
  }

  function setSyntaxColor(key: keyof SyntaxColorMap, value: string) {
    syntaxColors = { ...syntaxColors, [key]: value };
    syntaxTheme.apply(syntaxColors);
  }

  function setWorkbenchChromeColor(key: keyof WorkbenchChromeMap, value: string) {
    workbenchChromeColors = { ...workbenchChromeColors, [key]: value };
    workbenchChrome.apply(workbenchChromeColors);
  }

  function resetWorkbenchChromeColor(key: keyof WorkbenchChromeMap) {
    const source = WORKBENCH_CHROME_THEME_SOURCES[key];
    if (typeof document !== "undefined") {
      for (const cssVar of source.clearVars) {
        document.documentElement.style.removeProperty(cssVar);
      }
    }
    const themeValue = readThemeCssVar(source.themeVar, WORKBENCH_CHROME_DEFAULTS[key]);
    setWorkbenchChromeColor(key, themeValue);
  }

  function resetEditorColor(key: keyof EditorChromeMap) {
    const field = EDITOR_CHROME_FIELDS.find((f) => f.key === key)!;
    const themeValue = readThemeCssVar(field.cssVar, EDITOR_CHROME_DEFAULTS[key]);
    setEditorColor(key, themeValue);
  }

  function resetSyntaxColor(key: keyof SyntaxColorMap) {
    const cssVar = CSS_VAR_BY_KEY[key];
    const themeValue = readThemeCssVar(cssVar, defaultSyntaxColors()[key]);
    setSyntaxColor(key, themeValue);
  }

  function resetExplorerColor(key: keyof ExplorerAppearanceMap) {
    const cssVar = EXPLORER_COLOR_CSS_VARS[key];
    if (!cssVar) return;
    const themeValue = readThemeCssVar(
      cssVar,
      EXPLORER_APPEARANCE_DEFAULTS[key] as string
    );
    setExplorerColor(key, themeValue);
  }

  function resetChatColor(key: keyof ChatAppearanceMap) {
    if (key === "waitingStyle") return;
    const cssVar = CHAT_APPEARANCE_CSS_VARS[key];
    const themeValue = readThemeCssVar(cssVar, CHAT_APPEARANCE_DEFAULTS[key]);
    setChatColor(key, themeValue);
  }

  function resetContextColor(key: keyof ContextAppearanceMap) {
    const cssVar = CONTEXT_APPEARANCE_CSS_VARS[key];
    const themeValue = readThemeCssVar(cssVar, CONTEXT_APPEARANCE_DEFAULTS[key]);
    setContextColor(key, themeValue);
  }

  function applyThemeSelection(themeId: WorkbenchThemeId) {
    const theme = normalizeWorkbenchTheme(themeId);
    applyWorkbenchTheme(theme);
    editorColors = editorChrome.syncFromActiveTheme();
    syntaxColors = { ...syntaxTheme.syncFromActiveTheme() };
    workbenchChromeColors = { ...workbenchChrome.syncFromActiveTheme() };
    contextColors = { ...contextAppearance.syncFromActiveTheme() };
    chatColors = { ...chatAppearance.syncFromActiveTheme() };
  }
</script>

{#if section === "appearance-theme"}
  <div class="stack">
    <div class="section-header">
      <h3 class="provider-page-title">Theme</h3>
      <div class="header-actions">
        <button
          type="button"
          class="btn ghost small"
          onclick={() => {
            applyThemeSelection(workbenchTheme);
          }}
        >Sync editor from theme</button>
      </div>
    </div>
    <p class="note">
      Click a region in the preview to jump to its colors. Workbench preset, editor, syntax, explorer, chat, and context bar.
      Label and icon sizes →
      <button type="button" class="linkish" onclick={() => onNavigate("general")}>General</button>.
    </p>

    <p class="group-label">Workbench</p>
    <label class="field">
      <span class="name">Color theme</span>
      <span class="field-hint">Sidebar, tabs, status bar, and terminal</span>
      <select
        class="input"
        bind:value={workbenchTheme}
        onchange={() => {
          applyThemeSelection(workbenchTheme);
        }}
      >
        {#each WORKBENCH_THEME_OPTIONS as opt}
          <option value={opt.id}>{opt.label}</option>
        {/each}
      </select>
    </label>

    <div class="theme-preview-shell">
      <p class="group-label theme-preview-shell__label">Application preview</p>
      <ThemeMiniWorkbench
        selected={selectedRegion}
        onSelect={selectThemeRegion}
        {workbenchChromeColors}
        {editorColors}
        {syntaxColors}
        {explorerColors}
        {chatColors}
      />
      <div class="region-editor">
        <div class="region-editor__head">
          <h4 class="region-editor__title">{THEME_REGION_LABELS[selectedRegion]}</h4>
          <button
            type="button"
            class="btn ghost small"
            onclick={() => resetRegionColors(selectedRegion)}
          >Reset {THEME_REGION_LABELS[selectedRegion].toLowerCase()}</button>
        </div>
        {#if selectedRegion === "workbench-chrome"}
          {#each WORKBENCH_CHROME_FIELDS as field}
            <SettingsColorField
              label={field.label}
              hint={field.hint}
              value={workbenchChromeColors[field.key]}
              onChange={(v) => setWorkbenchChromeColor(field.key, v)}
              onReset={() => resetWorkbenchChromeColor(field.key)}
            />
          {/each}
        {:else if selectedRegion === "editor"}
          {#each EDITOR_CHROME_FIELDS as field}
            <SettingsColorField
              label={field.label}
              hint={field.hint}
              value={editorColors[field.key]}
              onChange={(v) => setEditorColor(field.key, v)}
              onReset={() => resetEditorColor(field.key)}
            />
          {/each}
        {:else if selectedRegion === "syntax"}
          <p class="token-group-label">Code tokens</p>
          {#each SYNTAX_COLOR_FIELDS.filter((f) => f.group !== "markdown") as field}
            <SettingsColorField
              label={field.label}
              hint={field.hint}
              value={syntaxColors[field.key]}
              onChange={(v) => setSyntaxColor(field.key, v)}
              onReset={() => resetSyntaxColor(field.key)}
            />
          {/each}
          <p class="token-group-label">Markdown tokens</p>
          {#each SYNTAX_COLOR_FIELDS.filter((f) => f.group === "markdown") as field}
            <SettingsColorField
              label={field.label}
              hint={field.hint}
              value={syntaxColors[field.key]}
              onChange={(v) => setSyntaxColor(field.key, v)}
              onReset={() => resetSyntaxColor(field.key)}
            />
          {/each}
        {:else if selectedRegion === "explorer"}
          {#each EXPLORER_COLOR_FIELDS as field}
            <SettingsColorField
              label={field.label}
              hint={field.hint}
              value={explorerColors[field.key] as string}
              onChange={(v) => setExplorerColor(field.key, v)}
              onReset={() => resetExplorerColor(field.key)}
            />
          {/each}
        {:else if selectedRegion === "chat"}
          <label class="field">
            <span class="name">While waiting for the model</span>
            <span class="field-hint">Before tools or reasoning appear</span>
            <select
              class="input"
              value={chatColors.waitingStyle}
              onchange={(e) => {
                chatColors = {
                  ...chatColors,
                  waitingStyle: (e.currentTarget as HTMLSelectElement).value as ChatWaitingStyle,
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
            <SettingsColorField
              label={field.label}
              hint={field.hint}
              value={chatColors[field.key]}
              onChange={(v) => setChatColor(field.key, v)}
              onReset={() => resetChatColor(field.key)}
            />
          {/each}
        {/if}
      </div>
    </div>

    <div class="theme-section" id="theme-region-workbench-chrome">
      <div class="theme-section__head">
        <h4 class="settings-subheading">Workbench chrome</h4>
        <div class="header-actions">
          <button
            type="button"
            class="btn ghost small"
            onclick={() => { workbenchChromeColors = workbenchChrome.resetToDefaults(); }}
          >Reset</button>
        </div>
      </div>
      {#each WORKBENCH_CHROME_FIELDS as field}
        <SettingsColorField
          label={field.label}
          hint={field.hint}
          value={workbenchChromeColors[field.key]}
          onChange={(v) => setWorkbenchChromeColor(field.key, v)}
          onReset={() => resetWorkbenchChromeColor(field.key)}
        />
      {/each}
    </div>

    <div class="theme-section" id="theme-region-editor">
      <div class="theme-section__head">
        <h4 class="settings-subheading">Editor</h4>
        <div class="header-actions">
          <button
            type="button"
            class="btn ghost small"
            onclick={() => { editorColors = editorChrome.resetToDefaults(); }}
          >Reset</button>
        </div>
      </div>
      {#each EDITOR_CHROME_FIELDS as field}
        <SettingsColorField
          label={field.label}
          hint={field.hint}
          value={editorColors[field.key]}
          onChange={(v) => setEditorColor(field.key, v)}
          onReset={() => resetEditorColor(field.key)}
        />
      {/each}
    </div>

    <div class="theme-section" id="theme-region-syntax">
      <div class="theme-section__head">
        <h4 class="settings-subheading">Syntax</h4>
        <div class="header-actions">
          <button
            type="button"
            class="btn ghost small"
            onclick={() => { syntaxColors = syntaxTheme.resetToDefaults(); }}
          >Reset</button>
        </div>
      </div>
      <div
        class="theme-preview theme-preview--syntax"
        style={`background:${editorColors.bg};color:${editorColors.fg};`}
        aria-label="Syntax theme preview"
      >
        <span class="theme-preview__label">Preview</span>
        <p class="syntax-preview-label">TypeScript</p>
        <span class="syntax-preview-line"><span style="color: {syntaxColors.comment}">// Workspace API client</span></span>
        <span class="syntax-preview-line"><span style="color: {syntaxColors.keyword}">import</span> <span style="color: {syntaxColors.keyword}">type</span> {'{'} <span style="color: {syntaxColors.type}">User</span> {'}'} <span style="color: {syntaxColors.keyword}">from</span> <span style="color: {syntaxColors.string}">'./types'</span><span style="color: {syntaxColors.punctuation}">;</span></span>
        <span class="syntax-preview-line"><span style="color: {syntaxColors.keyword}">import</span> {'{'} <span style="color: {syntaxColors.function}">fetchData</span><span style="color: {syntaxColors.punctuation}">,</span> <span style="color: {syntaxColors.variable}">MAX_RETRIES</span> <span style="color: {syntaxColors.operator}">=</span> <span style="color: {syntaxColors.number}">3</span> {'}'} <span style="color: {syntaxColors.keyword}">from</span> <span style="color: {syntaxColors.string}">'@/lib/api'</span><span style="color: {syntaxColors.punctuation}">;</span></span>
        <span class="syntax-preview-line"><span style="color: {syntaxColors.keyword}">interface</span> <span style="color: {syntaxColors.type}">Config</span> <span style="color: {syntaxColors.punctuation}">{`{`}</span></span>
        <span class="syntax-preview-line">  <span style="color: {syntaxColors.property}">timeout</span><span style="color: {syntaxColors.punctuation}">:</span> <span style="color: {syntaxColors.number}">3000</span><span style="color: {syntaxColors.punctuation}">;</span></span>
        <span class="syntax-preview-line"><span style="color: {syntaxColors.punctuation}">{`}`}</span></span>
        <span class="syntax-preview-line"><span style="color: {syntaxColors.keyword}">export</span> <span style="color: {syntaxColors.keyword}">class</span> <span style="color: {syntaxColors.type}">ApiClient</span> <span style="color: {syntaxColors.punctuation}">{`{`}</span></span>
        <span class="syntax-preview-line">  <span style="color: {syntaxColors.keyword}">private</span> <span style="color: {syntaxColors.property}">baseUrl</span><span style="color: {syntaxColors.punctuation}">:</span> <span style="color: {syntaxColors.type}">string</span><span style="color: {syntaxColors.punctuation}">;</span></span>
        <span class="syntax-preview-line">  <span style="color: {syntaxColors.keyword}">async</span> <span style="color: {syntaxColors.function}">getUser</span><span style="color: {syntaxColors.punctuation}">(</span><span style="color: {syntaxColors.property}">id</span><span style="color: {syntaxColors.punctuation}">:</span> <span style="color: {syntaxColors.type}">number</span><span style="color: {syntaxColors.punctuation}">):</span> <span style="color: {syntaxColors.type}">Promise</span><span style="color: {syntaxColors.punctuation}">&lt;</span><span style="color: {syntaxColors.type}">User</span><span style="color: {syntaxColors.punctuation}">&gt;</span> <span style="color: {syntaxColors.punctuation}">{`{`}</span></span>
        <span class="syntax-preview-line">    <span style="color: {syntaxColors.keyword}">const</span> <span style="color: {syntaxColors.variable}">url</span> <span style="color: {syntaxColors.operator}">=</span> <span style="color: {syntaxColors.string}">{"`${this.baseUrl}/users/${id}`"}</span><span style="color: {syntaxColors.punctuation}">;</span></span>
        <span class="syntax-preview-line">    <span style="color: {syntaxColors.keyword}">if</span> <span style="color: {syntaxColors.punctuation}">(</span><span style="color: {syntaxColors.operator}">!</span><span style="color: {syntaxColors.variable}">url</span><span style="color: {syntaxColors.punctuation}">.</span><span style="color: {syntaxColors.function}">match</span><span style="color: {syntaxColors.punctuation}">(</span><span style="color: {syntaxColors.regexp}">/^https?:\/\//</span><span style="color: {syntaxColors.punctuation}">))</span> <span style="color: {syntaxColors.punctuation}">{`{`}</span></span>
        <span class="syntax-preview-line">      <span style="color: {syntaxColors.keyword}">throw</span> <span style="color: {syntaxColors.keyword}">new</span> <span style="color: {syntaxColors.type}">Error</span><span style="color: {syntaxColors.punctuation}">(</span><span style="color: {syntaxColors.string}">'invalid url'</span><span style="color: {syntaxColors.punctuation}">);</span></span>
        <span class="syntax-preview-line">    <span style="color: {syntaxColors.punctuation}">{`}`}</span></span>
        <span class="syntax-preview-line">    <span style="color: {syntaxColors.keyword}">return</span> <span style="color: {syntaxColors.function}">fetchData</span><span style="color: {syntaxColors.punctuation}">&lt;</span><span style="color: {syntaxColors.type}">User</span><span style="color: {syntaxColors.punctuation}">&gt;(</span><span style="color: {syntaxColors.variable}">url</span><span style="color: {syntaxColors.punctuation}">);</span></span>
        <span class="syntax-preview-line">  <span style="color: {syntaxColors.punctuation}">{`}`}</span></span>
        <span class="syntax-preview-line"><span style="color: {syntaxColors.punctuation}">{`}`}</span></span>
      </div>
      <p class="token-group-label">Code tokens</p>
      {#each SYNTAX_COLOR_FIELDS.filter((f) => f.group !== "markdown") as field}
        <SettingsColorField
          label={field.label}
          hint={field.hint}
          value={syntaxColors[field.key]}
          onChange={(v) => setSyntaxColor(field.key, v)}
          onReset={() => resetSyntaxColor(field.key)}
        />
      {/each}
      <div
        class="theme-preview theme-preview--syntax theme-preview--markdown"
        style={`background:${editorColors.bg};color:${editorColors.fg};`}
        aria-label="Markdown syntax preview"
      >
        <p class="syntax-preview-label">Markdown example</p>
        <span class="syntax-preview-line"><span style="color: {syntaxColors.heading}; font-weight:700"># Project readme</span></span>
        <span class="syntax-preview-line"><span style="color: {syntaxColors.heading}; font-weight:700">## Getting started</span></span>
        <span class="syntax-preview-line"><span style="color: {syntaxColors.default}">Install dependencies, then read </span><span style="color: {syntaxColors.link}">[the docs](https://example.com)</span><span style="color: {syntaxColors.default}"> for </span><span style="color: {syntaxColors.emphasis}">*setup*</span><span style="color: {syntaxColors.default}"> and </span><span style="color: {syntaxColors.strong}; font-weight:700">**configuration**</span><span style="color: {syntaxColors.default}"> notes.</span></span>
        <span class="syntax-preview-line"><span style="color: {syntaxColors.meta}">```ts</span></span>
        <span class="syntax-preview-line"><span style="color: {syntaxColors.keyword}">const</span> <span style="color: {syntaxColors.variable}">ready</span> <span style="color: {syntaxColors.operator}">=</span> <span style="color: {syntaxColors.keyword}">true</span><span style="color: {syntaxColors.punctuation}">;</span></span>
        <span class="syntax-preview-line"><span style="color: {syntaxColors.meta}">```</span></span>
      </div>
      <p class="token-group-label">Markdown tokens</p>
      {#each SYNTAX_COLOR_FIELDS.filter((f) => f.group === "markdown") as field}
        <SettingsColorField
          label={field.label}
          hint={field.hint}
          value={syntaxColors[field.key]}
          onChange={(v) => setSyntaxColor(field.key, v)}
          onReset={() => resetSyntaxColor(field.key)}
        />
      {/each}
    </div>

    <div class="theme-section" id="theme-region-explorer">
      <div class="theme-section__head">
        <h4 class="settings-subheading">Explorer</h4>
        <div class="header-actions">
          <button
            type="button"
            class="btn ghost small"
            onclick={() => { explorerColors = explorerAppearance.resetToDefaults(); }}
          >Reset</button>
        </div>
      </div>
      {#each EXPLORER_COLOR_FIELDS as field}
        <SettingsColorField
          label={field.label}
          hint={field.hint}
          value={explorerColors[field.key] as string}
          onChange={(v) => setExplorerColor(field.key, v)}
          onReset={() => resetExplorerColor(field.key)}
        />
      {/each}
    </div>

    <div class="theme-section" id="theme-region-context">
      <div class="theme-section__head">
        <h4 class="settings-subheading">Context bar</h4>
        <div class="header-actions">
          <button
            type="button"
            class="btn ghost small"
            onclick={() => { contextColors = contextAppearance.resetToDefaults(); }}
          >Reset</button>
        </div>
      </div>
      <p class="note theme-section__note">
        Colors for the token breakdown bar and panel (system prompt sections, tool schemas, chat history).
      </p>
      <p class="token-group-label">Prompt sections</p>
      {#each CONTEXT_APPEARANCE_COLOR_FIELDS.filter((f) => f.group === "sections") as field}
        <SettingsColorField
          label={field.label}
          hint={field.hint}
          value={contextColors[field.key]}
          onChange={(v) => setContextColor(field.key, v)}
          onReset={() => resetContextColor(field.key)}
        />
      {/each}
      <p class="token-group-label">Skill accents</p>
      {#each CONTEXT_APPEARANCE_COLOR_FIELDS.filter((f) => f.group === "skills") as field}
        <SettingsColorField
          label={field.label}
          hint={field.hint}
          value={contextColors[field.key]}
          onChange={(v) => setContextColor(field.key, v)}
          onReset={() => resetContextColor(field.key)}
        />
      {/each}
    </div>

    <div class="theme-section">
      <div class="theme-section__head">
        <h4 class="settings-subheading">Browser inspector</h4>
      </div>
      <p class="note theme-section__note">
        Color of the bounding box shown when hovering over elements in the browser pane's Select element mode.
      </p>
      <SettingsColorField
        label="Highlight color"
        hint="Outline color drawn around the hovered element"
        value={$settings.inspectorHighlightColor}
        onChange={(v) => settings.setInspectorHighlightColor(v)}
        onReset={() => settings.setInspectorHighlightColor("#ff6b8b")}
      />
    </div>

    <div class="theme-section" id="theme-region-chat">
      <div class="theme-section__head">
        <h4 class="settings-subheading">Chat activity</h4>
        <div class="header-actions">
          <button
            type="button"
            class="btn ghost small"
            onclick={() => { chatColors = chatAppearance.resetToDefaults(); }}
          >Reset</button>
        </div>
      </div>
      <label class="field">
        <span class="name">While waiting for the model</span>
        <span class="field-hint">Before tools or reasoning appear</span>
        <select
          class="input"
          value={chatColors.waitingStyle}
          onchange={(e) => {
            chatColors = {
              ...chatColors,
              waitingStyle: (e.currentTarget as HTMLSelectElement).value as ChatWaitingStyle,
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
        <SettingsColorField
          label={field.label}
          hint={field.hint}
          value={chatColors[field.key]}
          onChange={(v) => setChatColor(field.key, v)}
          onReset={() => resetChatColor(field.key)}
        />
      {/each}
    </div>
  </div>
{/if}

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 2px;
  }

  .theme-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
    scroll-margin-top: 8px;
  }

  .theme-preview-shell {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 0 4px;
    border-bottom: 1px solid var(--border);
  }

  .theme-preview-shell__label {
    margin: 0;
  }

  .region-editor {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--background);
  }

  .region-editor__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 2px;
  }

  .region-editor__title {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--foreground);
  }

  .theme-section__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .provider-page-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--foreground);
  }

  .group-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted-foreground);
    margin: 4px 0 -4px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .name {
    font-size: 12px;
    color: var(--muted-foreground);
  }

  .field-hint {
    font-size: 11px;
    color: var(--muted-foreground);
  }

  .input {
    width: 100%;
    padding: 8px 10px;
    font-size: 13px;
    color: var(--foreground);
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .input:focus {
    outline: none;
    border-color: var(--ring);
  }

  .note {
    font-size: 11px;
    line-height: 1.4;
    color: var(--muted-foreground);
    margin: 0;
  }

  .settings-subheading {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--foreground);
  }

  .token-group-label {
    margin: 6px 0 2px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
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

  .btn {
    padding: 4px 10px;
    font-size: 11px;
    border-radius: 5px;
    cursor: pointer;
    border: 1px solid transparent;
  }

  .btn.ghost {
    background: transparent;
    color: var(--muted-foreground);
    border-color: var(--border);
  }

  .btn.ghost:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .theme-preview {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 22px 12px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    font-size: 12px;
    line-height: 1.5;
  }

  .theme-preview__label {
    position: absolute;
    top: 6px;
    left: 10px;
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted-foreground);
  }

  .theme-preview--syntax {
    font-family: var(--font-mono, ui-monospace, monospace);
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
    color: color-mix(in srgb, currentColor 45%, transparent);
  }

  .syntax-preview-label:first-of-type {
    margin-top: 0;
  }

  .theme-preview--markdown {
    margin-top: 4px;
  }

  .theme-preview--markdown .syntax-preview-label {
    margin-top: 0;
  }
</style>
