<script lang="ts">
  import { get } from "svelte/store";
  import { settings, AGENT_LIMIT_BOUNDS, READ_FILE_CAP_BOUNDS } from "$lib/stores/settings";
  import { toolPolicy as toolPolicyStore } from "$lib/stores/toolPolicy";
  import { normalizeShellRules } from "$lib/shellPolicy";
  import { listManagedTools, type ToolRule } from "$lib/toolPolicy";
  import GearIcon from "phosphor-svelte/lib/GearIcon";

  /**
   * Agent limits, read_file cap, and tool policy. Agent limits + read-file cap persist
   * immediately (owned here); the tool policy default rule reads/writes the policy store
   * directly. `webFetchAllowedHostsText` stays a parent draft (committed in handleSave),
   * and the tool-editor modal lives in the parent — opened via callbacks.
   */
  interface Props {
    webFetchAllowedHostsText: string;
    onOpenToolEditor: (name: string, builtin: boolean) => void;
    onOpenNewToolEditor: () => void;
    onResetTools: () => void;
    onNavigate: (section: "experimental-compaction") => void;
  }

  let {
    webFetchAllowedHostsText = $bindable(),
    onOpenToolEditor,
    onOpenNewToolEditor,
    onResetTools,
    onNavigate,
  }: Props = $props();

  const initial = get(settings);
  const policyInitial = get(toolPolicyStore);
  let maxAgentSteps = $state(initial.agentLimits.maxAgentSteps);
  let maxToolCallsPerRun = $state(initial.agentLimits.maxToolCallsPerRun);
  let maxToolsPerTurn = $state(initial.agentLimits.maxToolsPerTurn);
  let parallelExecution = $state(initial.agentLimits.parallelExecution);
  let maxConcurrentTools = $state(initial.agentLimits.maxConcurrentTools);
  let lspToolTimeout = $state(initial.agentLimits.lspToolTimeout);
  let lspWorkspaceSymbolTimeout = $state(initial.agentLimits.lspWorkspaceSymbolTimeout);
  let lspToolsCountTowardLimit = $state(initial.agentLimits.lspToolsCountTowardLimit);
  let readFileCapMode = $state(initial.readFileCap.mode);
  let readFileCapMaxLines = $state(initial.readFileCap.maxLines);
  let readFileCapMaxPercent = $state(initial.readFileCap.maxPercent);

  let shellAllowText = $state(
    (policyInitial.shellRules?.allowPatterns ?? []).join("\n")
  );
  let shellDenyText = $state(
    (policyInitial.shellRules?.denyPatterns ?? []).join("\n")
  );

  function persistShellRules() {
    const lines = (text: string) =>
      text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    toolPolicyStore.setShellRules(
      normalizeShellRules({
        allowPatterns: lines(shellAllowText),
        denyPatterns: lines(shellDenyText),
      })
    );
    const saved = $toolPolicyStore.shellRules ?? { allowPatterns: [], denyPatterns: [] };
    shellAllowText = saved.allowPatterns.join("\n");
    shellDenyText = saved.denyPatterns.join("\n");
  }

  function persistAgentLimits() {
    settings.setAgentLimits({
      maxAgentSteps,
      maxToolCallsPerRun,
      maxToolsPerTurn,
      parallelExecution,
      maxConcurrentTools,
      lspToolTimeout,
      lspWorkspaceSymbolTimeout,
      lspToolsCountTowardLimit,
    });
    const saved = get(settings).agentLimits;
    maxAgentSteps = saved.maxAgentSteps;
    maxToolCallsPerRun = saved.maxToolCallsPerRun;
    maxToolsPerTurn = saved.maxToolsPerTurn;
    parallelExecution = saved.parallelExecution;
    maxConcurrentTools = saved.maxConcurrentTools;
    lspToolTimeout = saved.lspToolTimeout;
    lspWorkspaceSymbolTimeout = saved.lspWorkspaceSymbolTimeout;
    lspToolsCountTowardLimit = saved.lspToolsCountTowardLimit;
  }

  function persistReadFileCap() {
    settings.setReadFileCap({
      mode: readFileCapMode,
      maxLines: readFileCapMaxLines,
      maxPercent: readFileCapMaxPercent,
    });
    const cap = get(settings).readFileCap;
    readFileCapMode = cap.mode;
    readFileCapMaxLines = cap.maxLines;
    readFileCapMaxPercent = cap.maxPercent;
  }
</script>

<div class="stack">
  <p class="group-label">Agent limits</p>
  <p class="note">
    Optional caps for Plan and Agent modes on a single user message.
    <strong>0 = unlimited</strong> (opt-in). New installs use bounded defaults (local: 40 steps).
    The agent loop otherwise stops when the
    model finishes or the <strong>context budget</strong> for the active model is full
    (see context meter in chat). Compaction options are under
    <button type="button" class="linkish" onclick={() => onNavigate("experimental-compaction")}>
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

  <p class="group-label">Parallel tool execution</p>
  <p class="note muted">
    Run independent read-only tools concurrently within a single agent turn.
    Write tools always execute sequentially to prevent conflicts.
    Requires the active model to support parallel tool calls (set in provider model settings).
  </p>
  <label class="field">
    <span class="name">Enable parallel execution</span>
    <input type="checkbox" bind:checked={parallelExecution} onchange={persistAgentLimits} />
  </label>
  {#if parallelExecution}
    <label class="field">
      <span class="name">Max concurrent tools</span>
      <input
        type="number"
        class="input"
        min={AGENT_LIMIT_BOUNDS.maxConcurrentTools.min}
        max={AGENT_LIMIT_BOUNDS.maxConcurrentTools.max}
        bind:value={maxConcurrentTools}
        onchange={persistAgentLimits}
      />
      <span class="hint">
        How many read-only tools run at the same time (default 4, max {AGENT_LIMIT_BOUNDS.maxConcurrentTools.max}).
      </span>
    </label>
  {/if}

  <p class="group-label">LSP agent tools</p>
  <p class="note muted">
    Timeouts for <code class="inline-code">lsp_*</code> tools (references, definitions, symbols, diagnostics).
  </p>
  <label class="field">
    <span class="name">LSP query timeout (ms)</span>
    <input
      type="number"
      class="input"
      min={AGENT_LIMIT_BOUNDS.lspToolTimeout.min}
      max={AGENT_LIMIT_BOUNDS.lspToolTimeout.max}
      bind:value={lspToolTimeout}
      onchange={persistAgentLimits}
    />
  </label>
  <label class="field">
    <span class="name">LSP workspace symbol timeout (ms)</span>
    <input
      type="number"
      class="input"
      min={AGENT_LIMIT_BOUNDS.lspWorkspaceSymbolTimeout.min}
      max={AGENT_LIMIT_BOUNDS.lspWorkspaceSymbolTimeout.max}
      bind:value={lspWorkspaceSymbolTimeout}
      onchange={persistAgentLimits}
    />
  </label>
  <label class="field">
    <span class="name">LSP tools count toward run limit</span>
    <input type="checkbox" bind:checked={lspToolsCountTowardLimit} onchange={persistAgentLimits} />
    <span class="hint">When off, LSP queries do not consume the max tool calls per run budget.</span>
  </label>

  <p class="group-label">read_file cap</p>
  <p class="note muted">
    Limits how many lines the agent can read per <code class="inline-code">read_file</code> call
    unless the model requests a smaller range.
  </p>
  <label class="field">
    <span class="name">Cap mode</span>
    <select class="input" bind:value={readFileCapMode} onchange={persistReadFileCap}>
      <option value="lines">Fixed line count</option>
      <option value="percent">Percent of context window</option>
    </select>
  </label>
  {#if readFileCapMode === "lines"}
    <label class="field">
      <span class="name">Max lines</span>
      <input
        type="number"
        class="input"
        min={READ_FILE_CAP_BOUNDS.maxLines.min}
        max={READ_FILE_CAP_BOUNDS.maxLines.max}
        bind:value={readFileCapMaxLines}
        onchange={persistReadFileCap}
      />
    </label>
  {:else}
    <label class="field">
      <span class="name">Max percent of context</span>
      <input
        type="number"
        class="input"
        min={READ_FILE_CAP_BOUNDS.maxPercent.min}
        max={READ_FILE_CAP_BOUNDS.maxPercent.max}
        bind:value={readFileCapMaxPercent}
        onchange={persistReadFileCap}
      />
      <span class="hint">Converted to lines at ~20 tokens/line (min 50 lines).</span>
    </label>
  {/if}

  <p class="group-label">Tool policy</p>
  <p class="note">
    Per-tool rules: <strong>Allow</strong> runs without prompting,
    <strong>Ask</strong> shows approval above the composer,
    <strong>Deny</strong> blocks the tool. Chat mode still hides tools; Plan and Agent
    use the subsets defined in each mode.
  </p>
  <label class="field">
    <span class="name">Default for new tools</span>
    <select
      class="input"
      value={$toolPolicyStore.defaultRule}
      onchange={(e) => toolPolicyStore.setDefaultRule(e.currentTarget.value as ToolRule)}
    >
      <option value="ask">Ask</option>
      <option value="allow">Allow</option>
      <option value="deny">Deny</option>
    </select>
  </label>

  <p class="group-label">Shell command patterns</p>
  <p class="note muted">
    For <code class="inline-code">run_shell</code> only. One JavaScript regex per line.
    <strong>Deny</strong> patterns run first, then <strong>allow</strong>, then the per-tool rule above.
    Example allow: <code class="inline-code">^pnpm test</code>, <code class="inline-code">^cargo test</code>.
  </p>
  <label class="field">
    <span class="name">Auto-allow (regex)</span>
    <textarea
      class="input textarea"
      rows="3"
      bind:value={shellAllowText}
      onchange={persistShellRules}
      placeholder="^pnpm test&#10;^npm run build"
    ></textarea>
  </label>
  <label class="field">
    <span class="name">Always deny (regex)</span>
    <textarea
      class="input textarea"
      rows="2"
      bind:value={shellDenyText}
      onchange={persistShellRules}
      placeholder="\\brm\\s+-rf\\b"
    ></textarea>
  </label>

  <p class="group-label">Tools</p>
  <p class="note muted">
    Tool policies and definitions are stored globally on this machine. Per-project overrides
    live in <code>.sidebar/tools.json</code> — project rules may only <strong>narrow</strong>
    permissions (never widen). Custom tools cannot shadow built-in tool names.
  </p>

  <label class="field">
    <span class="name">Web fetch allowed hosts</span>
    <textarea
      class="input textarea"
      rows="4"
      bind:value={webFetchAllowedHostsText}
      placeholder="github.com&#10;docs.rs"
    ></textarea>
    <span class="hint">One hostname per line. Used by the web_fetch tool only — not a hard network boundary; shell commands can still reach other hosts unless web access is disabled or shell policy blocks them.</span>
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
            onclick={() => onOpenToolEditor(tool.name, tool.builtin)}
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
    <button type="button" class="btn secondary" onclick={onOpenNewToolEditor}>Create tool</button>
    <button type="button" class="btn ghost" onclick={onResetTools}>Reset to defaults</button>
  </div>
</div>

<style>
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

  .note {
    font-size: 12px;
    line-height: 1.45;
    color: #737373;
    margin: 0;
  }

  .note.muted {
    color: #5c5c5c;
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

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .name {
    font-size: 12px;
    color: #a3a3a3;
  }

  .hint {
    font-size: 11px;
    color: #666;
  }

  .inline-code {
    font-family: ui-monospace, monospace;
    font-size: 11px;
    padding: 1px 5px;
    border-radius: 4px;
    background: #1c1c1c;
    color: #c5c5c5;
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

  .textarea {
    resize: vertical;
    font-family: ui-monospace, monospace;
  }

  .btn {
    padding: 7px 14px;
    font-size: 12px;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid transparent;
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

  .tool-policy-footer {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
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

  .tool-policy-badge.edited {
    color: #c9a86c;
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
</style>
