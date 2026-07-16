# Spec 30 — Agent Context & Model Settings

> **Status:** ✅ Core complete (Phase 0 + Skills Phase 1) — settings v4 migration, Agent Context section, per-model + provider defaults, assembly preview, `assembleSystemPrompt`, `toolCallFormat` branching, chat workspace toggle. **Skills are implemented**: the Skills manager (Settings → Agent Context → Skills, Addendum A) provides full CRUD with per-mode scoping over `.sidebar/skills/<id>/` (`skill.json` + `skill.md`); `buildActiveSkillBlocks` filters enabled skills by mode and `interpolateSkill` substitutes `{{variables}}` per §10 (unknown tokens left literal, §10.3); loaded on workspace open via `projectState` and injected by `assemble.ts`. A **code-defined bundled starter pack** now ships (§9 — `src/lib/skills/bundled/index.ts`: `typescript`, `svelte`, `git-conventions`, `testing`), merged into the assembled prompt unless a project skill shares its `id`. Deferred to a later release: auto-detection signals (§5.4), drag-reorder priority, global scope + `.md`-backed/read-only bundled UI (§5.5), `skills-config.json` overrides, `{{file_tree}}`/`{{project_type}}` population.
> **Version:** 1.0 — May 2026
> **Area:** Settings · Agent Prompts · Skills · System Prompts · Providers
> **Phase:** Final — implemented after all other Enhancement Program specs ([17-roadmap.md](17-roadmap.md))
> **Depends on:** [08-ai-agent.md](08-ai-agent.md) (system-prompt assembly) · [09-tool-system.md](09-tool-system.md) (tool instructions) · [21-context-compaction.md](21-context-compaction.md) (context window) · system-prompts subsystem (`src/lib/systemPrompts/`)
> **Supersedes:** [23-skills-system.md](23-skills-system.md) (skills design) and the **capability-flag / prompt-variant** parts of [27-local-model-ux.md](27-local-model-ux.md). It does **not** supersede 27's Ollama model-pull UI (§4 of 27 remains current).

---

## ⚠️ Implementation Status & Discussion Note

**This spec, and the context/tool-calling/skills/system-prompt surfaces it touches, are intentionally the LAST things to implement.** They are large, cross-cutting, and reverse two earlier design decisions (see the "Reversals from earlier specs" table below). Before any code lands:

1. The **per-model settings data shape** must be finalized (extend `ModelConfig` vs a new `ModelSettings` type — see §3 integration note).
2. The **assembly-order integration point** must be agreed (`ChatPane.buildSystemPrompt()` is currently the assembler — see §7 integration note).
3. The **settings v3 → v4 migration** must be reviewed for backward safety (§11.4).

The items below in [22-llm-file-interaction.md](22-llm-file-interaction.md) that overlap conceptually — the **`read_file` size cap** and **tool-schema trimming by mode** — are likewise **deferred to this discussion phase**, because they change what the model sees per turn and should be decided alongside the assembly-order work here.

Everything in the rest of the Enhancement Program (filesystem watcher, search panel, `.gitignore` tree filtering, compaction divider, iframe sandbox) ships **before** this spec.

### Reversals from earlier specs (must be reconciled during discussion)

| Topic | Earlier spec | This spec |
|-------|--------------|-----------|
| Skill workspace config | `skills.json` with per-skill numeric `priority` + tri-state `manualOverride` ([23](23-skills-system.md) §3.3) | `skills-config.json` with `overrides[]` + canonical `order[]`; simple boolean override |
| Skill ordering | numeric `priority` field | drag-reorder writing `order[]` |
| Skill scope | bundled + project | adds **`global`** (`~/.sidebar/skills/`) |
| Skills UI surface | new **explorer sidebar tab** + status-bar icon ([23](23-skills-system.md) §7) | **Settings → Agent Context** panel (no explorer tab) |
| Unknown variable handling | substitute empty string + warn ([23](23-skills-system.md) §3.2) | **leave literal `{{token}}`** so the model surfaces the bug (§10.3) |
| Model adaptivity | **auto-inferred** capability flags via name heuristics ([27](27-local-model-ux.md) §3) | **user-owned** explicit settings; no auto-inference (§1.1) |
| Adaptive fields | `nativeFunctionCalling`/`weakReasoning`/`supportsThinking` | `toolCallFormat`/`parallelToolCalls`/`promptVerbosity` |

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Settings Navigation Restructure](#2-settings-navigation-restructure)
3. [Per-Model Settings](#3-per-model-settings)
4. [Agent Context Section](#4-agent-context-section)
5. [Skills Panel](#5-skills-panel)
6. [System Prompts Panel](#6-system-prompts-panel)
7. [System Prompt Assembly](#7-system-prompt-assembly)
8. [Skill Definition Format](#8-skill-definition-format)
9. [Bundled Skills](#9-bundled-skills)
10. [Variable Interpolation](#10-variable-interpolation)
11. [Implementation Notes](#11-implementation-notes)

---

## 1. Design Philosophy

### 1.1 User-Owned Model Configuration

The app does not auto-infer model capabilities. Users know what model they loaded, what context window their hardware supports, and whether their model handles native tool calls. Auto-detection is fragile and breaks whenever a user swaps models — which is frequent for the target audience.

Instead, each model has a small set of explicit user-controlled settings that are set once and persist. The UI makes the options clear and their effect on agent behavior explicit.

> **Integration note:** this reverses [27-local-model-ux.md](27-local-model-ux.md) §3, which resolved a `ModelCapabilities` record from name heuristics (`*:1b` → `weakReasoning`). Under this spec, heuristics may *seed a default* but never silently drive behavior. The `weakReasoning`/`nativeFunctionCalling` flags are replaced by `promptVerbosity` and `toolCallFormat`.

### 1.2 Skills vs System Prompts — Distinct but Co-located

These are related but conceptually different:

| | System Prompts | Skills |
|-|---------------|--------|
| **What they are** | Conversational instructions | Contextual knowledge injections |
| **Example** | "Always explain your reasoning" | "This project uses React with TypeScript" |
| **Activation** | Always on (per mode) | Per workspace, user-toggled |
| **Authoring** | Free prose | Structured fragments with variables |
| **Scope** | Global or per-mode | Per-project or global |

They are kept in **separate panels** within the same **"Agent Context"** settings section so users understand they are related (both feed the system prompt) but distinct in purpose.

### 1.3 Assembly Order is Visible

Users debugging unexpected model behavior almost always have an ordering or priority conflict they cannot see. The assembly order of everything injected into the system prompt is surfaced explicitly in the UI — not buried in code.

---

## 2. Settings Navigation Restructure

### 2.1 Current Nav

```
general
providers-ollama
providers-llamacpp
providers-anthropic
providers-deepseek
providers-glm
providers-kimi
tools
experimental-compaction
experimental-autocomplete
appearance-*
keybindings
```

### 2.2 Proposed Nav

```
general
providers-ollama
providers-llamacpp
providers-anthropic
providers-deepseek
providers-glm
providers-kimi
agent-context            ← NEW consolidated section
  agent-context-skills   ← replaces standalone prompts panel
  agent-context-prompts  ← existing prompts UI, reorganized
tools
experimental-compaction
experimental-autocomplete
appearance-*
keybindings
```

### 2.3 Nav Labels

| Section ID | Sidebar label | Description shown under label |
|------------|--------------|-------------------------------|
| `agent-context` | Agent Context | Skills and instructions injected into every conversation |
| `agent-context-skills` | Skills | Workspace-aware context fragments |
| `agent-context-prompts` | System Prompts | Always-active behavioral instructions |

The `agent-context` nav item expands inline to show the two sub-items rather than navigating to a landing page. Clicking the parent label navigates to `agent-context-skills` by default.

> **Integration note:** the settings nav lives in `src/modules/settings/SettingsPane.svelte`. The existing system-prompts UI is `src/modules/explorer/PromptPanel.svelte` (an explorer panel today, not a settings section). Moving it under Agent Context means either re-hosting `PromptPanel` content inside a settings section component or extracting the shared list into a component both can mount. The current `PromptPanel` reads from `src/lib/stores/systemPrompt.ts` / `systemPrompts.ts`.

---

## 3. Per-Model Settings

### 3.1 Where It Lives

Each provider section (Ollama, llama.cpp, Anthropic, DeepSeek, GLM, Kimi) shows a model list. Each model row has a gear icon that expands an inline settings panel below the row. This avoids a separate settings page per model while keeping the settings discoverable.

### 3.2 Per-Model Settings Fields

```
┌─ Qwen2.5-Coder:32b ──────────────────────────────── [gear] ─┐
│                                                               │
│  Context window      [131072          ] tokens               │
│                      ↳ Used for context budget and           │
│                        compaction threshold                   │
│                                                               │
│  Tool call format    [ Native function calls      ▼ ]        │
│                      ↳ Native / Text fallback                 │
│                        Text fallback parses tool calls        │
│                        from model output directly            │
│                                                               │
│  Parallel tool calls [ Enabled                    ▼ ]        │
│                      ↳ Enabled / Disabled                     │
│                        Disable for models that               │
│                        struggle with multiple calls           │
│                                                               │
│  Prompt verbosity    [ Standard                   ▼ ]        │
│                      ↳ Standard / Detailed                    │
│                        Detailed adds worked examples          │
│                        to tool instructions                   │
│                                                               │
│  Show in chat picker [x]                                      │
└───────────────────────────────────────────────────────────────┘
```

### 3.3 Field Definitions

**Context window**
- Type: number input
- Default: provider-specific seed (Anthropic: 200k, DeepSeek: 64k, GLM: 128k, Kimi: 262k, Ollama: 32k, llama.cpp: 32k)
- Effect: drives `contextBudget.ts`, compaction auto-trigger threshold, context meter in status bar
- Note shown in UI: "Set this to the actual context your hardware loaded the model with — check your Ollama pull or llama.cpp launch command"

**Tool call format**
- Type: select
- Options: `Native function calls` | `Text fallback`
- Default: `Native function calls`
- Effect: `streamTurn.ts` branches on this — native uses provider tool_call API, text fallback routes through `textToolCalls.ts`
- Note shown in UI: "Use Text fallback if the model doesn't reliably follow function call syntax"

**Parallel tool calls**
- Type: select
- Options: `Enabled` | `Disabled`
- Default: `Enabled`
- Effect: when enabled, all tool calls in a single model turn are executed concurrently; when disabled, they execute sequentially
- Note shown in UI: "Disable if the model produces dependent tool calls in the same turn"

**Prompt verbosity**
- Type: select
- Options: `Standard` | `Detailed`
- Default: `Standard`
- Effect: `Standard` sends compact tool instructions; `Detailed` adds a worked example of a valid tool call and explicit one-step-at-a-time guidance
- Note shown in UI: "Use Detailed for smaller or less instruction-tuned models"

### 3.4 Data Shape

The parent spec proposed a new `ModelSettings` interface:

```typescript
interface ModelSettings {
  id: string
  name: string
  showInPicker: boolean
  // New fields:
  contextWindow: number
  toolCallFormat: 'native' | 'text_fallback'
  parallelToolCalls: boolean
  promptVerbosity: 'standard' | 'detailed'
}
```

> **Integration note (decision needed — see Discussion Note above):** the codebase already has a `ModelConfig` type in `src/lib/stores/settings.ts` with `id`, `showInPicker`, and `contextWindow`. The six arrays `ollamaModels`/`llamacppModels`/`anthropicModels`/`deepseekModels`/`glmModels`/`kimiModels` are all `ModelConfig[]`. The cleanest integration is to **extend `ModelConfig` in place** with `toolCallFormat`, `parallelToolCalls`, `promptVerbosity` (all optional with defaults applied at read time) rather than introduce a parallel `ModelSettings` type. `resolveActiveModelSettings()` in `src/lib/modelSettings.ts` reads per-model and provider-default values; `toolCallFormat`/`parallelToolCalls` are read there and in `streamTurn.ts`.

### 3.5 Defaults Behavior

When a model is first added (Ollama pull, manual entry, catalog fetch) it inherits provider-level defaults. Provider defaults are set in the provider settings section:

```
Ollama provider defaults
  Default context window:      [32768   ]
  Default tool call format:    [Native  ▼]
  Default prompt verbosity:    [Standard▼]
  (applied to newly added models; does not affect existing)
```

This means a user who runs exclusively large Ollama models sets the provider default once and never touches per-model settings unless something differs.

---

## 4. Agent Context Section

### 4.1 Section Header

```
┌─ Agent Context ──────────────────────────────────────────────┐
│                                                               │
│  Everything in this section is injected into the system      │
│  prompt before each conversation turn. The assembly order    │
│  below reflects the exact order the model receives it.       │
│                                                               │
│  Assembly order preview:                                      │
│  1. Base mode prompt        [always]                         │
│  2. Workspace context       [always]                         │
│  3. Tool instructions       [plan + agent modes]             │
│  4. Skills                  [3 active] ──────── [manage →]  │
│  5. System prompts          [2 active] ──────── [manage →]  │
│  6. Tool summary prompt     [plan + agent modes]             │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

The assembly order preview is read-only and always visible at the top of the section. Items 1, 2, 3, and 6 are built-in and not user-editable from this view (clicking them navigates to the relevant settings). Items 4 and 5 link to their respective panels.

The `[N active]` count updates live as the user enables/disables items in the sub-panels.

### 4.2 Sub-panel Navigation

Clicking `[manage →]` on Skills navigates to `agent-context-skills`.
Clicking `[manage →]` on System Prompts navigates to `agent-context-prompts`.

The sidebar nav also shows both sub-items indented under Agent Context for direct navigation.

---

## 5. Skills Panel

### 5.1 Layout

```
┌─ Skills ─────────────────────────────────────────────────────┐
│                                                               │
│  Skills inject workspace-aware context into the system       │
│  prompt. They activate per-project and can include           │
│  dynamic variables like the active file or git branch.       │
│                                                               │
│  [+ New skill]          [Import from file]                   │
│                                                               │
│  Active in this workspace (3)                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ≡  ⚡ React + TypeScript        [plan][agent]  [•] [⚙] │  │
│  │    Auto-detected · react in package.json              │  │
│  ├──────────────────────────────────────────────────────┤   │
│  │ ≡  ⚡ Vite                      [agent]        [•] [⚙] │  │
│  │    Auto-detected · vite.config.ts present             │  │
│  ├──────────────────────────────────────────────────────┤   │
│  │ ≡    Git Conventions            [all modes]   [•] [⚙] │  │
│  │    Always active · bundled                            │  │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  Available (not active in this workspace) (8)               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │     Rust                        [plan][agent]  [+]    │  │
│  │     Python                      [plan][agent]  [+]    │  │
│  │     Docker                      [agent]        [+]    │  │
│  │     ...                                               │  │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### 5.2 Row Anatomy

Each active skill row contains:

| Element | Description |
|---------|-------------|
| `≡` | Drag handle for priority reordering |
| `⚡` | Auto-detected badge (absent if manually added) |
| Title | Skill name |
| Mode badges | `[chat]` `[plan]` `[agent]` — clickable toggles per mode |
| `[•]` | Enable/disable toggle (filled = enabled) |
| `[⚙]` | Opens skill editor for this skill |

Drag reorder directly controls injection priority. Position 1 at top injects first (closest to the base prompt). A subtle position number `#1`, `#2` etc. appears on the left when dragging is in progress.

### 5.3 Skill Editor

Clicking `[⚙]` on a skill row or `[+ New skill]` opens the skill editor. For bundled skills this opens a read-only view with a "Duplicate to edit" button. For project and user skills it opens editable fields.

The editor is not an inline textarea — it opens the skill's `.md` file in the main editor tab (same pattern as existing system prompts). The `skill.json` metadata fields are editable via a structured form panel alongside the editor:

```
┌─ Edit Skill: React + TypeScript ────────────────────────────┐
│                                                              │
│  Title          [React + TypeScript              ]          │
│  Description    [React component conventions...  ]          │
│                                                              │
│  Active in modes                                            │
│  [ ] Chat   [x] Plan   [x] Agent                           │
│                                                              │
│  Auto-activate when                                         │
│  [x] react present in package.json dependencies            │
│  [x] .tsx or .jsx files present in workspace               │
│  [ ] Add signal...                                          │
│                                                              │
│  Available variables (click to insert)                      │
│  [{{workspace_name}}] [{{active_file}}] [{{git_branch}}]   │
│  [{{open_files}}] [{{file_tree}}] [{{today}}]               │
│                                                              │
│  Content (editing in main editor →)                         │
│  skill.md                                    [Open in editor]│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 5.4 Auto-Detect Signals

Auto-detection runs on workspace open and on file tree changes (once filesystem watcher is wired — [24-filesystem-watcher.md](24-filesystem-watcher.md)). It does not run on every turn — detection results are cached for the workspace session.

Signals are evaluated in order. A skill activates if its `requires` condition is met:

| Signal type | Description | Example config |
|-------------|-------------|----------------|
| `package_json_dep` | Dependency in package.json deps or devDeps | `{ "type": "package_json_dep", "name": "react" }` |
| `config_file` | Named config file exists at workspace root | `{ "type": "config_file", "name": "vite.config.*" }` |
| `extension_present` | At least one file with extension exists | `{ "type": "extension_present", "extensions": [".tsx", ".jsx"] }` |
| `file_exists` | Specific path exists, optionally with content match | `{ "type": "file_exists", "path": "Cargo.toml" }` |
| `always` | Always activates in any workspace | `{ "type": "always" }` |

`requires` field values:
- `"any"` — at least one signal must match
- `"all"` — all signals must match

Auto-detected skills appear in the "Active" list with the `⚡` badge. The user can disable them per-workspace; that preference persists in `.sidebar/skills-config.json`.

> **Integration note:** detection should consume the **filtered** workspace tree from [22-llm-file-interaction.md](22-llm-file-interaction.md) §2 (the `.gitignore`-aware tree shipped earlier in the Enhancement Program), not a raw recursive scan. Re-detection hooks into the filesystem-watcher tree-change event ([24](24-filesystem-watcher.md)).

### 5.5 Project vs Global Skills

Skills have a scope:

| Scope | Location | Visibility |
|-------|----------|------------|
| `bundled` | `src/lib/skills/bundled/` | All workspaces, read-only |
| `global` | `~/.sidebar/skills/` | All workspaces, user-editable |
| `project` | `.sidebar/skills/` | Current workspace only |

"New skill" prompts: "Save to this project" or "Save globally (available in all projects)".

Project skills are committed with the repo, making them shareable with teammates — a significant practical advantage for team-level conventions.

### 5.6 Workspace Skills Config

`.sidebar/skills-config.json` — stores per-workspace overrides without modifying skill files:

```json
{
  "version": 1,
  "overrides": [
    { "id": "react-typescript", "enabled": true, "modes": ["plan", "agent"] },
    { "id": "git-conventions", "enabled": false }
  ],
  "order": ["react-typescript", "vite", "git-conventions"]
}
```

The `order` array is the canonical injection priority for this workspace. Skills not listed fall to the end in default order.

> **Integration note:** this **replaces** the `skills.json` format proposed in [23-skills-system.md](23-skills-system.md) §3.3 (which used per-skill numeric `priority` and a tri-state `manualOverride`). The filename also changes from `skills.json` to `skills-config.json` to make its "config/overrides" role explicit.

---

## 6. System Prompts Panel

This is the existing system prompts UI, reorganized under Agent Context. The core behavior is unchanged — this section documents only what changes.

### 6.1 Changes from Current Implementation

**What stays the same:**
- Per-entry enable/disable toggle
- Mode checkboxes per entry
- File-backed `.md` files in `.sidebar/prompts/`
- "Open in editor" behavior
- `prompts.json` manifest format

**What changes:**

The panel now shows a clear description at the top distinguishing prompts from skills:

> "System prompts are always-active behavioral instructions — they shape how the model responds regardless of what you are working on. For workspace-aware context, use Skills."

The list header changes from "Prompts" to "System Prompts" throughout.

A new **"Applies to"** column is added to each row showing the mode badges, consistent with the skills panel row design.

**Injection position reminder** is shown at the bottom of the panel:

> "System prompts inject after Skills in the assembly order. To adjust relative ordering, use the Agent Context overview."

> **Integration note:** the existing implementation already encodes mode badges and combination order in `src/lib/systemPrompts/config.ts` (`combinePromptContents`, `promptModesSummary`, `togglePromptMode`). The "Applies to" column reuses `promptModesSummary`. No storage-format change — only display labels and the new descriptive copy.

### 6.2 No Merge with Skills

System prompts and skills remain separate lists with separate storage. They are not merged into a single reorderable list. The assembly order (skills before prompts) is fixed — this is intentional and documented in the Agent Context overview header.

If a user needs a skill-like behavior scoped only to certain projects, that is a project-scoped skill, not a system prompt.

---

## 7. System Prompt Assembly

### 7.1 Full Assembly Order

```
1. MODE_CONFIG[mode].basePrompt
      Always included. Not user-editable from settings
      (editing base prompts is a code-level concern).

2. buildWorkspaceContextBlock()
      Workspace path + filtered file tree snapshot.
      Tree is built once per agent run (not per turn).
      Respects .gitignore and depth/file limits.

3. TOOL_USE_INSTRUCTION
      Only included when mode is plan or agent.
      Content varies by active model's promptVerbosity setting:
        standard  → compact schema listing
        detailed  → schema listing + one worked example

4. Active skills (in user-defined priority order)
      Only skills where:
        - enabled == true
        - current mode is in skill.modes (or modes is empty)
      Variables interpolated at assembly time.

5. activeSystemPromptText
      Concatenation of enabled system prompt entries
      matching current mode. Existing behavior unchanged.

6. TOOL_SUMMARY_INSTRUCTION
      Only included when mode is plan or agent.
```

> **Integration note (decision needed):** today the assembler lives in `src/modules/agent/ChatPane.svelte` (`buildSystemPrompt`), drawing tool instructions and the summary from `src/lib/agent/` and `activeSystemPromptText` from the system-prompts store. Step 4 (skills) must be inserted between the tool-use instruction and `activeSystemPromptText`. Recommendation: extract assembly into a pure `src/lib/agent/systemPrompt/assemble.ts` so it is unit-testable and the skills step is a single insertion point rather than inline Svelte logic.

### 7.2 Chat Mode Optimization

In `chat` mode, steps 3 and 6 are omitted entirely. Step 2 is also omitted unless the user has explicitly enabled "Include workspace context in chat mode" (new toggle in General settings, default off). This keeps chat mode lean for conversational use.

### 7.3 Parallel Tool Call Behavior

Determined by the active model's `parallelToolCalls` setting:

- `enabled` — `TOOL_USE_INSTRUCTION` includes: "You may call multiple tools in a single response when the calls are independent. Independent means the output of one does not affect the input of another."
- `disabled` — `TOOL_USE_INSTRUCTION` includes: "Call one tool at a time. Wait for each result before proceeding."

This is injected as a sentence within the existing tool instruction block, not a separate section.

> **Integration note:** this replaces the [27-local-model-ux.md](27-local-model-ux.md) §2.2 "variant by `weakReasoning`/`nativeFunctionCalling`" matrix. The verbose/concise split is now driven by `promptVerbosity`; the one-tool-at-a-time guidance is driven by `parallelToolCalls`. The actual concurrent-vs-sequential execution of tool calls is enforced in `streamTurn.ts` / the agent loop, not just by prompt copy.

### 7.4 Assembly Preview

A read-only "Preview assembled prompt" button in the Agent Context section header opens a modal showing the full assembled system prompt for the current workspace and mode. This is the single most useful debugging tool for users wondering why the model is behaving unexpectedly. The preview shows section boundaries with labels:

```
━━━ Base prompt (agent mode) ━━━━━━━━━━━━━━━━━━━━━━━━
You are an expert coding agent...

━━━ Workspace context ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Workspace: /Users/alex/projects/my-app
...

━━━ Tool instructions (standard) ━━━━━━━━━━━━━━━━━━━━
You have access to the following tools...

━━━ Skill: React + TypeScript (#1) ━━━━━━━━━━━━━━━━━━
Project: my-app | Branch: main
When writing components...

━━━ Skill: Git Conventions (#2) ━━━━━━━━━━━━━━━━━━━━
Commit messages should follow...

━━━ System prompt: agent.md ━━━━━━━━━━━━━━━━━━━━━━━━
Always write tests alongside...

━━━ Tool summary instruction ━━━━━━━━━━━━━━━━━━━━━━━━
After completing tool use...
```

Token count per section is shown on the right margin. Total token count shown in the modal header.

> **Integration note:** token counts can reuse the estimator already used by `contextBudget.ts` ([21-context-compaction.md](21-context-compaction.md)). Extracting assembly into `assemble.ts` (§7.1 note) makes section-labeled output trivial — return `{ label, text }[]` and let the modal render boundaries.

---

## 8. Skill Definition Format

### 8.1 Directory Structure

```
.sidebar/
  skills-config.json          ← workspace overrides and order
  skills/
    react-typescript/
      skill.json              ← metadata and activation signals
      skill.md                ← prompt content with variables
    my-org-conventions/
      skill.json
      skill.md
```

### 8.2 `skill.json` Schema

```json
{
  "id": "react-typescript",
  "title": "React + TypeScript",
  "version": "1.0.0",
  "description": "React component conventions and TypeScript patterns",
  "scope": "project",
  "modes": ["plan", "agent"],
  "autoActivate": {
    "requires": "any",
    "signals": [
      { "type": "package_json_dep", "name": "react" },
      { "type": "extension_present", "extensions": [".tsx", ".jsx"] }
    ]
  },
  "variables": ["workspace_name", "active_file", "git_branch"]
}
```

Fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique identifier, kebab-case |
| `title` | string | yes | Display name in UI |
| `version` | string | no | Semver, for future registry use |
| `description` | string | no | Shown in skills panel |
| `scope` | `project` \| `global` \| `bundled` | yes | Storage location |
| `modes` | `ChatMode[]` | yes | Empty array = all modes |
| `autoActivate` | object | no | Omit for manual-only skills |
| `variables` | `string[]` | no | Declares which variables this skill uses (for validation) |

> **Integration note:** this drops the explicit `content` and numeric `priority` fields from [23-skills-system.md](23-skills-system.md) §3.1. Content is implicitly `skill.md` in the same directory; priority is now governed by `order[]` in `skills-config.json`. `ChatMode` is the existing union from `src/lib/stores/mode.ts` (`"chat" | "plan" | "agent"`).

### 8.3 `skill.md` Format

Plain markdown. Variables use `{{double_brace}}` syntax. No other special syntax — the file should be readable as plain markdown without preprocessing.

```markdown
# React + TypeScript Conventions

**Project:** {{workspace_name}} | **Branch:** {{git_branch}}

## Component structure
Use functional components with explicit prop interfaces exported
from the same file as the component.

## Currently open
{{active_file}}
```

---

## 9. Bundled Skills

> **Status:** 🔶 **Partial — shipped as a code-defined starter pack.** A first set of bundled skills ships in `src/lib/skills/bundled/index.ts` as typed `BUNDLED_SKILLS` constants (not `.md` directories, and without the auto-detection engine or duplicate-to-edit UI originally specced below). `buildActiveSkillBlocks(state, mode, ctx, { includeBundled })` merges them into the assembled system prompt for the active mode **unless** a project skill uses the same `id` (project skills win). Auto-activation signals (§9.1 original table), read-only UI rows, and global scope remain deferred.

### 9.1 Shipped Starter Pack (`src/lib/skills/bundled/index.ts`)

| Skill ID | Title | Modes | Notes |
|----------|-------|-------|-------|
| `typescript` | TypeScript | plan, agent | Strict typing, project scripts, Svelte 5 runes |
| `svelte` | Svelte 5 | plan, agent | `$props`/`$state`/`$derived` patterns |
| `git-conventions` | Git Conventions | plan, agent | Small reviewable edits; prefer `str_replace`; don't commit unless asked |
| `testing` | Testing | agent | Vitest under `tests/unit/`; mock Tauri IPC |

Each entry carries `id`, `title`, `description`, `modes`, `version`, and `content`. `bundledSkillIds()` exposes the id set (used by tests and the merge dedupe). Covered by `tests/unit/bundledSkills.test.ts`.

### 9.2 Deferred (original design)

The richer starter pack below (auto-activation signals, `.md`-backed directories, duplicate-to-edit, global scope) is retained as the target design and remains **not started**:

| Skill ID | Title | Auto-activates on | Default modes |
|----------|-------|-------------------|---------------|
| `node-typescript` | Node.js + TypeScript | `tsconfig.json` or `.ts` files | plan, agent |
| `react` | React | `react` in package.json | plan, agent |
| `svelte` | Svelte | `svelte` in package.json | plan, agent |
| `nextjs` | Next.js | `next` in package.json | plan, agent |
| `vite` | Vite | `vite.config.*` present | agent |
| `rust` | Rust | `Cargo.toml` present | plan, agent |
| `python` | Python | `*.py` files or `pyproject.toml` | plan, agent |
| `docker` | Docker | `Dockerfile` present | agent |
| `git-conventions` | Git Conventions | always | all modes |
| `testing` | Testing | `vitest`/`jest`/`pytest` in deps | plan, agent |

### 9.3 Bundled Skill Content Guidelines

Each bundled skill should contain:
- What the framework/tool is and its conventions (2–3 sentences max — the model likely knows the framework; this is about *this project's usage*)
- File structure conventions for this stack
- Agent-specific guidance: common files to read first, typical edit patterns, test locations
- Any stack-specific gotchas relevant to agent tool use (e.g. "Rust: run `cargo check` not `cargo build` to validate — it is faster")

Bundled skills should be concise. The goal is 200–400 tokens per skill, not comprehensive documentation.

---

## 10. Variable Interpolation

### 10.1 Available Variables

| Variable | Value | Expensive? |
|----------|-------|------------|
| `{{workspace_name}}` | `basename(workspacePath)` | No |
| `{{workspace_path}}` | Full absolute path | No |
| `{{active_file}}` | Relative path of focused editor tab | No |
| `{{active_file_contents}}` | Full contents of focused editor tab | Yes — see note |
| `{{git_branch}}` | Current branch name | No |
| `{{open_files}}` | Comma-separated relative paths of open tabs | No |
| `{{file_tree}}` | Filtered workspace tree (respects .gitignore) | Moderate |
| `{{today}}` | ISO date string | No |
| `{{project_type}}` | Auto-detected stack label e.g. "Node.js / React / TypeScript" | No |

**Note on `{{active_file_contents}}`:** This injects the entire file into the system prompt on every turn. Appropriate for workflows where one file is the constant focus. Users should be aware this counts against context. A warning is shown in the skill editor when this variable is used: "This variable injects the full file contents on every turn. Suitable for large context models."

### 10.2 Implementation

**`src/lib/skills/skillVariables.ts`:**

```typescript
interface VariableContext {
  workspacePath: string
  activeFilePath: string | null
  openFilePaths: string[]
  gitBranch: string | null
  fileTree: string | null   // pre-built, passed in — not fetched per skill
  today: string
  projectType: string | null
}

function interpolateSkill(content: string, ctx: VariableContext): string
```

`interpolateSkill` is called once per active skill during prompt assembly. The `VariableContext` is built once per assembly (not per skill) so expensive values like `fileTree` are only computed once regardless of how many skills use `{{file_tree}}`.

> **Integration note:** `gitBranch` is available via the existing `git_current_branch` IPC (cache once per assembly). `fileTree` should be the **same filtered tree** produced for `buildWorkspaceContextBlock()` so it is computed once per agent run, not per skill and not per turn. `activeFilePath`/`openFilePaths` come from the workbench tab state.

### 10.3 Unknown Variables

If a skill references a variable not in the table above, the raw `{{variable_name}}` token is left in the output (not silently removed). This makes authoring errors visible to the model, which will typically flag the unexpanded token in its response — surfacing the bug to the user.

> **Integration note:** this **reverses** [23-skills-system.md](23-skills-system.md) §3.2, which substituted an empty string + dev warning. The new behavior is intentional: visible breakage beats silent omission for authoring feedback.

---

## 11. Implementation Notes

### 11.1 Files to Create

| File | Purpose |
|------|---------|
| `src/lib/skills/types.ts` | `SkillDefinition`, `ActivationSignal`, `SkillScope`, `VariableContext` |
| `src/lib/skills/skillDetector.ts` | Auto-activation engine |
| `src/lib/skills/skillVariables.ts` | Variable interpolation |
| `src/lib/skills/skillLoader.ts` | Load bundled + global + project skills, merge with config |
| `src/lib/skills/bundled/` | Bundled skill directories |
| `src/lib/stores/skills.ts` | Svelte store: active skills, detection results, config |
| `src/modules/settings/AgentContextSection.svelte` | Parent section with assembly preview |
| `src/modules/settings/SkillsPanel.svelte` | Skills list, drag reorder, editor link |
| `src/modules/settings/SkillEditor.svelte` | Metadata form alongside editor |
| `.sidebar/skills-config.json` | Per-workspace skill overrides and order |

### 11.2 Files to Modify

| File | Change |
|------|--------|
| `src/lib/systemPrompts/config.ts` (or new `src/lib/agent/systemPrompt/assemble.ts`) | Integrate skills into assembly order (step 4) |
| `src/modules/agent/ChatPane.svelte` | `buildSystemPrompt()` calls skill assembler |
| `src/lib/stores/systemPrompts.ts` | No logic changes; rename display labels only |
| `src/modules/settings/SettingsPane.svelte` | Add `agent-context` nav section, sub-items |
| `src/lib/stores/settings.ts` | Add per-model fields (contextWindow exists; add toolCallFormat, parallelToolCalls, promptVerbosity) to `ModelConfig` |
| `src/lib/agent/streamTurn.ts` | Branch on `toolCallFormat` and `parallelToolCalls` per active model |
| `src/lib/agent/` (prompts) | `TOOL_USE_INSTRUCTION` reads `promptVerbosity` from active model |
| `src/modules/explorer/PromptPanel.svelte` | Thin wrapper now points to `agent-context-prompts` section |

### 11.3 Store Integration

`skills` store derives `activeSkillsForCurrentMode` from:
- `skills.all` (loaded skills)
- `skills.workspaceConfig` (per-workspace overrides and order)
- `currentMode` store
- `workspacePath` (scoping)

This derived value is what `buildSystemPrompt()` consumes — it never reads raw skill files at chat time.

### 11.4 Settings Version Bump

`settings.ts` store key upgrades from `sidebar.settings.v3` to `sidebar.settings.v4`. Migration adds default per-model fields to existing model entries using provider defaults. This migration runs once on load if v3 key is detected.

> **Integration note:** v4 migration is **shipped** — `sidebar.settings.v4` with `schemaVersion: 4`. Migration from v3 backfills `toolCallFormat`, `parallelToolCalls`, `promptVerbosity`, and `contextWindow` on all model arrays (including `glmModels`/`kimiModels` added in v0.1.5).

### 11.5 Phase Boundary

**Phase 0 of this spec (ship first, once discussion concludes):**
- Per-model settings fields (contextWindow, toolCallFormat, parallelToolCalls, promptVerbosity)
- Settings nav restructure (Agent Context section, Skills + Prompts sub-panels)
- Existing prompts UI moved under Agent Context — no behavior change
- Assembly order preview (read-only, no drag reorder yet)

**Phase 1:**
- Skills store, loader, detector
- Bundled skills starter pack
- Variable interpolation
- Skills panel with drag reorder
- Skill editor (metadata form + open-in-editor)
- `buildSystemPrompt()` integration

**Phase 2:**
- `{{active_file_contents}}` variable with warning
- Global skill scope (`~/.sidebar/skills/`)
- Skill duplication from bundled
- Per-signal UI in skill editor (currently JSON-edited)

---

*This spec supersedes [23-skills-system.md](23-skills-system.md) and the capability-flag/prompt-variant parts of [27-local-model-ux.md](27-local-model-ux.md). The Ollama model-pull UI in [27](27-local-model-ux.md) §4 remains current. All other specs remain unaffected.*

*Spec created: 2026-05-30 · Source: parent Agent Context & Model Settings spec (supersedes `extension.md` §3 & §8)*

---

## Addendum A — Skills CRUD in Settings

*Added: 2026-06-01*

This addendum covers the create, read, update, and delete operations for skills inside the Settings → Agent Context → Skills panel. It extends §5 (Skills Panel) without changing the layout or data format defined there.

### A.1 Creating a New Skill

**Trigger:** the `[+ New skill]` button in the Skills panel (§5.1).

**Flow:**

1. A small inline form appears above the skill list prompting: "Skill ID (kebab-case)" and "Save to: [This project ▼ / Globally]".
2. On confirm, the app:
   - Scaffolds `.sidebar/skills/<id>/skill.json` with minimum valid fields (`id`, `title`, `scope`, `modes: []`)
   - Scaffolds `.sidebar/skills/<id>/skill.md` with a comment header: `# <Title>\n\nAdd your skill content here.`
   - Opens `skill.md` in the main editor
   - Opens the metadata form panel (see §A.3) alongside the editor
3. The new skill appears at the bottom of the "Active in this workspace" list, enabled by default.

For globally-scoped skills, files go to `~/.sidebar/skills/<id>/`.

**ID validation:** IDs must match `^[a-z0-9-]+$`. If the ID already exists (same scope), the form shows an inline error: "A skill with this ID already exists."

### A.2 Opening a Skill for Editing

**Trigger:** clicking a skill's title text in the Skills panel row.

**Behavior:**
- Opens `skill.md` in the main editor tab (same tab if already open, or a new tab)
- Opens the metadata form panel (§A.3) as a side panel or as the skills panel content — the metadata panel and the main editor coexist

For bundled skills (read-only), the editor tab opens in read-only mode with a banner: "Bundled skill — read-only. [Duplicate to edit]". Clicking "Duplicate to edit" copies the skill directory to `.sidebar/skills/<id>-custom/` and opens the copy.

### A.3 Inline Metadata Editing

The metadata form in the Skills panel replaces the skill list when a skill is being edited. It shows editable fields without requiring the user to manually edit `skill.json`:

```
┌─ Edit Skill Metadata ────────────────────────────────────┐
│  ← Back to skill list                                     │
│                                                           │
│  Title         [React + TypeScript              ]         │
│  Description   [React component conventions...  ]         │
│                                                           │
│  Active in modes                                          │
│  [ ] Chat   [x] Plan   [x] Agent                         │
│                                                           │
│  Auto-activate                                            │
│  [x] Enable auto-activation                              │
│                                                           │
│  Content (main editor)                                    │
│  skill.md                              [Open in editor →] │
│                                                           │
│  [Save metadata]                         [Cancel]         │
└───────────────────────────────────────────────────────────┘
```

**Fields:**
- **Title**: maps to `skill.json` `title` field
- **Description**: maps to `skill.json` `description` field
- **Active in modes**: mode checkboxes map to `skill.json` `modes` array
- **Auto-activate toggle**: enables/disables the `autoActivate` object. When toggled off, the `autoActivate` field is set to `null` (skill becomes manual-only). When toggled on for a skill that had no prior signals, opens the auto-activation signal editor (advanced — deferred to Phase 2).

**Save:** writes `skill.json` only. The content of `skill.md` is managed directly in the editor — saving the editor tab writes the file. The metadata form and the editor are separate save flows.

**"Open in editor →":** navigates to the `skill.md` editor tab (or opens it if not already open).

### A.4 Deleting a Skill

**Trigger:** the `[⚙]` gear menu on a skill row, then "Delete skill".

**Behavior:**

1. Show a confirmation dialog:
   ```
   Delete "React + TypeScript"?
   This removes .sidebar/skills/react-typescript/ permanently.
   [Delete]  [Cancel]
   ```
2. On confirm: delete the directory from disk (or `~/.sidebar/skills/` for global scope).
3. Remove the skill from `skills-config.json` (order and overrides).
4. The skill disappears from the list immediately.

Bundled skills cannot be deleted — the "Delete skill" option is not shown in their gear menu.

### A.5 Validation on Save

When the metadata form is saved, `skill.json` is validated against the schema defined in §8.2:

| Validation | Error shown |
|------------|-------------|
| `id` missing or invalid characters | "ID must be kebab-case (letters, numbers, hyphens only)" |
| `title` empty | "Title is required" |
| `scope` not a valid value | "Scope must be 'project', 'global', or 'bundled'" |
| `modes` not an array | Reset to empty array, no error |
| `autoActivate.requires` not 'any' or 'all' | "Requires must be 'any' or 'all'" |

Validation errors appear inline below the relevant field. The Save button is disabled until all errors are resolved.

If `skill.json` on disk is already invalid when the panel opens (e.g. hand-edited incorrectly), the panel shows a banner: "skill.json has validation errors — some fields may not load correctly." The form still opens with best-effort field values.

### A.6 Summary of Editor vs Panel Responsibilities

| Surface | What it manages |
|---------|----------------|
| **Settings panel (metadata form)** | `title`, `description`, `modes`, `autoActivate` toggle |
| **Main editor (CodeMirror tab)** | `skill.md` content — all prose and variable usage |
| **Neither** | `id`, `scope`, `version` — set at creation, not changed afterward |

The division keeps the metadata panel simple (structured inputs) and uses the full editor for free-form content — consistent with how system prompts are edited in this project.
