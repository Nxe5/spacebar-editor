<script lang="ts">
  import { settings } from "$lib/stores/settings";
  import { files } from "$lib/stores/files";
  import { currentMode, MODE_CONFIG } from "$lib/stores/mode";
  import { systemPrompts } from "$lib/stores/systemPrompts";
  import { combinePromptContents } from "$lib/systemPrompts/config";
  import { buildAssemblyPreview } from "$lib/agent/systemPrompt/assemble";
  import { resolveActiveModelSettings } from "$lib/modelSettings";
  import SystemPromptsManager from "$lib/components/SystemPromptsManager.svelte";
  import AssemblyPreviewModal from "./AssemblyPreviewModal.svelte";

  export type AgentContextSubview = "overview" | "prompts" | "skills";

  let {
    subview = "overview",
    onNavigate,
  }: {
    subview?: AgentContextSubview;
    onNavigate?: (view: AgentContextSubview) => void;
  } = $props();

  let previewOpen = $state(false);

  let enabledPromptCount = $derived(
    $systemPrompts.entries.filter((e) => e.enabled).length
  );

  let overviewPreview = $derived.by(() => {
    const mode = $currentMode;
    return buildAssemblyPreview(mode, {
      workspacePath: $files.workspacePath,
      includeWorkspaceInChat: $settings.includeWorkspaceInChat,
      userPromptText: combinePromptContents(
        $systemPrompts.entries,
        $systemPrompts.contents,
        mode
      ),
      toolsEnabled: MODE_CONFIG[mode].tools.length > 0,
      modelSettings: resolveActiveModelSettings($settings),
      skillBlocks: [],
    });
  });

  let workspaceNote = $derived.by(() => {
    if ($currentMode !== "chat") return "always in plan/agent";
    return $settings.includeWorkspaceInChat ? "included in chat" : "omitted in chat";
  });

  function openPreview() {
    previewOpen = true;
  }

  function closePreview() {
    previewOpen = false;
  }

  function go(view: AgentContextSubview) {
    onNavigate?.(view);
  }
</script>

{#if subview === "overview"}
  <div class="stack">
    <h3 class="section-title">Agent Context</h3>
    <p class="note">
      Everything here is injected into the system prompt before each conversation turn. The
      assembly order below reflects the exact order the model receives it.
    </p>

    <div class="assembly-preview">
      <div class="assembly-head">
        <span class="group-label">Assembly order</span>
        <button type="button" class="btn secondary btn-sm" onclick={openPreview}>
          Preview assembled prompt
        </button>
      </div>
      <ol class="assembly-list">
        <li>
          <span>Base mode prompt</span>
          <span class="assembly-tag">always</span>
        </li>
        <li>
          <span>Workspace context</span>
          <span class="assembly-tag">{workspaceNote}</span>
        </li>
        <li>
          <span>Tool instructions</span>
          <span class="assembly-tag">plan + agent</span>
        </li>
        <li>
          <span>Skills</span>
          <span class="assembly-tag">0 active</span>
          <button type="button" class="linkish" onclick={() => go('skills')}>manage →</button>
        </li>
        <li>
          <span>System prompts</span>
          <span class="assembly-tag">{enabledPromptCount} active</span>
          <button type="button" class="linkish" onclick={() => go('prompts')}>manage →</button>
        </li>
        <li>
          <span>Tool summary prompt</span>
          <span class="assembly-tag">plan + agent</span>
        </li>
      </ol>
      <p class="note muted">
        Estimated total: ~{overviewPreview.totalTokens.toLocaleString()} tokens for current mode
        ({$currentMode}). Use preview to compare chat, plan, and agent.
      </p>
    </div>
  </div>
{:else if subview === "prompts"}
  <div class="stack">
    <button type="button" class="drillback" onclick={() => go('overview')}>← Agent Context</button>
    <h3 class="section-title">System prompts</h3>
    <p class="note muted">
      Each prompt: enable it, pick Chat / Plan / Agent, then use the gear to edit the markdown file.
    </p>
    <SystemPromptsManager variant="settings" />
  </div>
{:else if subview === "skills"}
  <div class="stack">
    <button type="button" class="drillback" onclick={() => go('overview')}>← Agent Context</button>
    <h3 class="section-title">Skills</h3>
    <p class="note muted">
      Skills inject workspace-aware context into the system prompt. Full skills management ships in
      a later phase — this panel is a placeholder for now.
    </p>
    <div class="skills-placeholder">
      <p>No skills configured yet.</p>
      <p class="note muted">
        Bundled skills, auto-detection, and per-project activation will appear here.
      </p>
    </div>
  </div>
{/if}

<AssemblyPreviewModal
  open={previewOpen}
  initialMode={$currentMode}
  onClose={closePreview}
/>

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .section-title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .note {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.5;
    color: var(--muted-foreground);
  }

  .note.muted {
    opacity: 0.92;
  }

  .group-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted-foreground);
  }

  .assembly-preview {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
    background: color-mix(in srgb, var(--background) 96%, var(--muted-foreground));
  }

  .assembly-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .assembly-list {
    margin: 0;
    padding-left: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .assembly-list li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem 0.5rem;
    font-size: 0.875rem;
  }

  .assembly-tag {
    font-size: 0.75rem;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    background: color-mix(in srgb, var(--foreground) 8%, transparent);
    color: var(--muted-foreground);
  }

  .linkish {
    font: inherit;
    font-size: 0.8125rem;
    padding: 0;
    border: none;
    background: none;
    color: var(--link, #60a5fa);
    cursor: pointer;
    text-decoration: underline;
  }

  .btn {
    font: inherit;
    padding: 0.375rem 0.75rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    cursor: pointer;
  }

  .btn.secondary {
    background: var(--background);
    color: var(--foreground);
  }

  .btn-sm {
    font-size: 0.8125rem;
    padding: 0.25rem 0.625rem;
  }

  .drillback {
    align-self: flex-start;
    font: inherit;
    font-size: 0.8125rem;
    padding: 0;
    border: none;
    background: none;
    color: var(--link, #60a5fa);
    cursor: pointer;
  }

  .skills-placeholder {
    padding: 1.5rem;
    border: 1px dashed var(--border);
    border-radius: 8px;
    text-align: center;
    color: var(--muted-foreground);
  }

  .inline-code {
    font-family: var(--font-mono, monospace);
    font-size: 0.85em;
  }

</style>
