# Spec 23 — Skills System

> **Status:** ⚠️ **SUPERSEDED by [30-agent-context-and-model-settings.md](30-agent-context-and-model-settings.md)** — kept for history/rationale
> **Area:** System Prompts · Agent Loop · Workspace Detection · Explorer UI
> **Phase:** Final — folded into [30](30-agent-context-and-model-settings.md) (implement LAST, discuss first)
> **Depends on:** [08-ai-agent.md](08-ai-agent.md) (system prompt assembly) · system prompts subsystem (`src/lib/systemPrompts/`) · [07-workspace.md](07-workspace.md) (`applyWorkspaceFolder`) · [24-filesystem-watcher.md](24-filesystem-watcher.md) (re-detection on tree change)

> **Related:** `extension.md` §3 · [29-skills-registry.md](29-skills-registry.md) (Phase 3 sharing) · existing `.tinyllama/prompts/` manifest pattern

---

## ⚠️ Superseded — read [Spec 30](30-agent-context-and-model-settings.md) first

The skills design in this document was **revised** by [30-agent-context-and-model-settings.md](30-agent-context-and-model-settings.md). The high-level model (auto-activating, file-backed, variable-interpolated prompt fragments) is unchanged, but several concrete decisions here are **no longer current**:

| This spec (23) | Replaced by spec 30 |
|----------------|---------------------|
| `skills.json` with numeric `priority` + tri-state `manualOverride` (§3.3) | `skills-config.json` with `overrides[]` + canonical `order[]`; boolean override ([30](30-agent-context-and-model-settings.md) §5.6) |
| New **explorer sidebar tab** + status-bar icon (§7) | **Settings → Agent Context** panel, no explorer tab ([30](30-agent-context-and-model-settings.md) §5) |
| Unknown variable → empty string + warn (§3.2) | Leave literal `{{token}}` so the model surfaces it ([30](30-agent-context-and-model-settings.md) §10.3) |
| `bundled` + `project` scope only | adds **`global`** (`~/.tinyllama/skills/`) ([30](30-agent-context-and-model-settings.md) §5.5) |
| Explicit `content` + `priority` fields in `skill.json` | dropped; `skill.md` implicit, ordering via `order[]` ([30](30-agent-context-and-model-settings.md) §8.2) |

The §4 auto-activation engine, §5 variables, §8 bundled-pack, §9 coexistence, and §10–13 implementation/edge-case material below remain a useful reference, but where they conflict with [30](30-agent-context-and-model-settings.md), **spec 30 wins**. Skills are part of the "implement LAST / discuss first" group — see [30](30-agent-context-and-model-settings.md)'s discussion note.

---

## 1. Overview

A **skill** is a composable, auto-activating system-prompt fragment that encodes conventions for a stack, framework, or organization. Skills are the **highest-leverage differentiator** for Tiny Llama: they let teams capture internal knowledge as version-controlled, local-only artifacts that shape agent behavior without anything leaving the machine.

The existing `.tinyllama/prompts/` multi-file prompt system is the right foundation. Skills extend it with three capabilities prompts lack:

1. **Auto-activation** based on workspace signals (deps, config files, extensions).
2. **Variable interpolation** (`{{workspace_name}}`, `{{git_branch}}`, …) resolved per turn.
3. **Priority ordering** and a path to **sharing** (registry, [29](29-skills-registry.md)).

Skills are **additive** — the existing prompts system is unchanged and continues to work alongside skills.

### Goals

- Skills activate automatically based on declarative signals; no manual setup for common stacks.
- A bundled starter pack covers Node/TS, React, Svelte, Rust, Python, Docker, git, and testing.
- Skills are plain files under `.tinyllama/skills/` — git-trackable, readable, hackable.
- The manifest format is stable from day one so future registry installs are forward-compatible.
- Variables interpolate at prompt-assembly time so context stays current.

### Non-Goals

- A hosted registry or CLI (deferred to [29-skills-registry.md](29-skills-registry.md)).
- Executable skill logic / JavaScript hooks (skills are prompt fragments + declarative signals only).
- Replacing the `prompts/` system (they coexist — §8).
- Per-skill tool policy overrides in v1 (skills shape prompts, not permissions).

---

## 2. File Layout

```
<workspace-root>/.tinyllama/
  prompts/                      # existing system-prompt files (unchanged)
  prompts.json                  # existing manifest (unchanged)
  skills/
    skills.json                 # manifest: enabled flags, manual overrides, priority
    react-typescript/
      skill.json                # per-skill manifest
      skill.md                  # prompt content with {{variables}}
    org-conventions/
      skill.json
      skill.md
```

Bundled skills ship read-only inside the app at `src/lib/skills/bundled/` and are **copied into** `.tinyllama/skills/` on first activation so users can edit them.

---

## 3. Skill Definition Format

### 3.1 `skill.json` (per skill)

```json
{
  "id": "react-typescript",
  "title": "React + TypeScript",
  "version": "1.0.0",
  "description": "React component conventions and TypeScript patterns",
  "modes": ["plan", "agent"],
  "priority": 10,
  "autoActivate": {
    "requires": "any",
    "signals": [
      { "type": "package_json_dep", "name": "react" },
      { "type": "extension_present", "extensions": [".tsx", ".jsx"] }
    ]
  },
  "variables": ["workspace_name", "active_file", "git_branch"],
  "content": "skill.md"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | ✅ | Unique within `skills/`; matches directory name |
| `title` | string | ✅ | Display name |
| `version` | semver | ✅ | For registry compatibility ([29](29-skills-registry.md)) |
| `description` | string | ✅ | Shown in sidebar |
| `modes` | `ChatMode[]` | ✅ | Empty = all modes (same semantics as prompts) |
| `priority` | integer | ✅ | Lower = injected earlier; ties broken by `id` |
| `autoActivate` | object \| null | ✅ | `null` = manual-only skill |
| `autoActivate.requires` | `"any"` \| `"all"` | ✅ | Signal combination logic |
| `autoActivate.signals` | `ActivationSignal[]` | ✅ | See §4 |
| `variables` | string[] | ✅ | Declared variables used in `skill.md` (validated; unknown → warning) |
| `content` | string | ✅ | Relative path to the markdown body (`skill.md`) |

### 3.2 `skill.md` (content with interpolation)

```markdown
# React + TypeScript Conventions

Project: {{workspace_name}} | Branch: {{git_branch}}

When writing components in this project:
- Use functional components with explicit prop interfaces
- Co-locate component tests in `__tests__/` sibling directories
- Prefer named exports

Active file: {{active_file}}
```

Unresolved variables render as the literal token plus a debug warning in dev; they are never left as broken `{{…}}` for the model — substitute an empty string and log.

### 3.3 `skills.json` (workspace manifest)

```json
{
  "version": 1,
  "skills": [
    { "id": "react-typescript", "enabled": true,  "manualOverride": null, "priority": 10 },
    { "id": "org-conventions",  "enabled": true,  "manualOverride": "on", "priority": 5 }
  ]
}
```

- `enabled` — current resolved state (auto-detect result, unless overridden).
- `manualOverride` — `"on"` | `"off"` | `null`. A non-null value wins over auto-detection.
- `priority` — user-adjustable; overrides the skill's default `priority`.

---

## 4. Auto-Activation Engine

**Module:** `src/lib/skills/skillDetector.ts`

```typescript
interface ActivationSignal {
  type: "package_json_dep" | "config_file" | "extension_present" | "file_exists" | "manual";
  name?: string;          // dep name for package_json_dep
  path?: string;          // for file_exists / config_file
  contains?: string;      // optional content substring match for file_exists
  extensions?: string[];  // for extension_present
}

async function detectActiveSkills(
  workspacePath: string,
  fileTree: FileEntry[],
  activeFile: string | null,
  skills: SkillManifest[]
): Promise<string[]>;       // returns skill IDs whose signals match
```

### 4.1 Signal types (priority order)

| Signal type | Detection method | Example |
|-------------|------------------|---------|
| `package_json_dep` | Parse `package.json` `dependencies` + `devDependencies` | `react`, `svelte`, `next` |
| `config_file` | Path existence | `tailwind.config.*`, `vite.config.*`, `Cargo.toml` |
| `extension_present` | Scan filtered file tree for extensions | `.rs`, `.go`, `.py`, `.tsx` |
| `file_exists` | Path (+ optional `contains` content match) | `Dockerfile`, `.env.example` |
| `manual` | Never auto-matches; requires `manualOverride: "on"` | Org skills |

`requires: "any"` → match if any signal matches. `requires: "all"` → all must match.

### 4.2 When detection runs

- On `applyWorkspaceFolder()` (workspace open).
- On file-tree change events once [24-filesystem-watcher.md](24-filesystem-watcher.md) lands (debounced).
- Detection reuses the **filtered** tree from [22](22-llm-file-interaction.md) §2 (no `node_modules` scan).

Detection results update `skills.json` `enabled` only where `manualOverride` is `null`.

---

## 5. Variable Interpolation

**Module:** `src/lib/skills/skillVariables.ts`

| Variable | Value | Source |
|----------|-------|--------|
| `{{workspace_name}}` | basename of workspace path | `files.workspacePath` |
| `{{active_file}}` | relative path of focused editor tab | `files.activeFilePath` |
| `{{git_branch}}` | current branch | `git_current_branch` (cached) |
| `{{open_files}}` | comma-separated open editor tab paths | `workbench.tabs` |
| `{{project_type}}` | detected type string, e.g. `"Node.js / React / TypeScript"` | derived from active skills |
| `{{today}}` | ISO date | `new Date()` |

**Timing:** interpolation runs at **system-prompt assembly time** (each turn), not at file load — so `{{git_branch}}` and `{{active_file}}` are always current. Cache git branch per turn to avoid an IPC call per skill.

---

## 6. Assembly Order

Skills slot **after** the base mode prompt and workspace/tool blocks, **before** user-authored prompts:

```
1. MODE_CONFIG[mode].basePrompt
2. buildWorkspaceContextBlock()          (filtered tree — spec 22)
3. TOOL_USE_INSTRUCTION                   (if tools enabled — spec 22 §4)
4. Active skills (priority asc, variables interpolated)   ← NEW
5. activeSystemPromptText                 (existing .tinyllama/prompts/)
6. TOOL_SUMMARY_INSTRUCTION               (if tools enabled)
```

Rationale: skills are project/stack conventions that should frame the task but yield to explicit user prompts, which represent the most specific intent.

---

## 7. Skills Sidebar Panel

Add a **`SkillsPanel`** explorer tab (`files` · `git` · `prompt` · `search` · `skills`) — or extend `PromptPanel` with a Skills section. New tab is preferred for clarity.

- List all skills (bundled + project-local).
- Auto-detected skills show a ⚡ badge + the triggering signal on hover.
- Manual enable/disable toggle per skill (sets `manualOverride`).
- Per-skill mode checkboxes (same UX as prompts — caret dropdown).
- Clicking a skill opens `skill.md` in the editor.
- **New skill** button → scaffolds `skill.json` + `skill.md` and opens both.
- Priority drag-to-reorder (writes `priority` to `skills.json`).

Status bar gains a skills activity icon following the existing panel-toggle pattern ([05-workbench.md](05-workbench.md)).

---

## 8. Bundled Skills (Starter Pack)

Ship in `src/lib/skills/bundled/`:

| Skill ID | Activates on |
|----------|--------------|
| `node-typescript` | `tsconfig.json` or `.ts` files |
| `react` | `react` in `package.json` |
| `svelte` | `svelte` in `package.json` |
| `rust` | `Cargo.toml` |
| `python` | `*.py` files or `pyproject.toml` |
| `docker` | `Dockerfile` |
| `git-conventions` | any git repo (always active) |
| `testing` | `vitest` / `jest` / `pytest` in deps |

Each encodes framework conventions, common file structure, and stack-specific agent tool-use guidance. Bundled skills are copied into `.tinyllama/skills/` on first activation so they are editable and git-trackable.

---

## 9. Coexistence with Prompts

| Aspect | Prompts (`prompts/`) | Skills (`skills/`) |
|--------|----------------------|--------------------|
| Activation | Manual enable per entry | Auto + manual override |
| Variables | None | `{{…}}` interpolation |
| Ordering | Manifest order | `priority` field |
| Intent | User's explicit instructions | Stack/org conventions |
| Assembly position | Step 5 (after skills) | Step 4 (before prompts) |

No migration is required. A user with no `skills/` directory sees identical behavior to today.

---

## 10. Implementation Plan

### Phase 1 — Format + manual skills (no auto-detect)

- [ ] `SkillManifest` / `ActivationSignal` types (`src/lib/skills/types.ts`)
- [ ] Load/parse `skills/*/skill.json` + `skills.json` (`src/lib/skills/workspace.ts`)
- [ ] Variable interpolation (`skillVariables.ts`)
- [ ] Inject active (manually enabled) skills at assembly step 4
- [ ] Skills store mirroring the prompts store API (`src/lib/stores/skills.ts`)

**Deliverable:** Skills load from disk, interpolate, and inject — enabled manually.

### Phase 2 — Auto-activation engine

- [ ] `skillDetector.ts` with all five signal types
- [ ] Run detection on `applyWorkspaceFolder()`
- [ ] Write detection results to `skills.json` (respect `manualOverride`)

**Deliverable:** Skills activate automatically based on workspace signals.

### Phase 3 — Sidebar UI

- [ ] `SkillsPanel.svelte` + explorer tab + status bar icon
- [ ] ⚡ auto-detected badge with signal tooltip
- [ ] New-skill scaffold; priority drag-reorder; mode checkboxes

**Deliverable:** Full skill management UI.

### Phase 4 — Bundled pack + re-detection

- [ ] Ship 8 bundled skills in `src/lib/skills/bundled/`
- [ ] Copy-on-first-activation into `.tinyllama/skills/`
- [ ] Re-run detection on FS watcher tree-change events ([24](24-filesystem-watcher.md))

**Deliverable:** Zero-config conventions for common stacks.

**Touch points (summary):**

| File | Change |
|------|--------|
| `src/lib/skills/` | New module: types, workspace I/O, detector, variables, bundled/ |
| `src/lib/stores/skills.ts` | New store |
| `src/modules/explorer/SkillsPanel.svelte` | New panel |
| `src/modules/explorer/RightSidebar.svelte` | New tab |
| `src/modules/workbench/StatusBar.svelte` | Skills toggle icon |
| `src/lib/explorerPanel.ts` | Add `"skills"` tab id |
| `src/modules/agent/ChatPane.svelte` | Inject skills at assembly step 4 |

---

## 11. Edge Cases & Failure Modes

| Scenario | Handling |
|----------|----------|
| `skill.json` malformed | Skip skill; warn in sidebar; do not crash detection |
| `skill.md` missing | Skill shown as broken; not injected |
| Unknown variable in `skill.md` | Substitute empty string; dev warning |
| `package.json` unreadable | `package_json_dep` signals evaluate false |
| Conflicting priorities | Stable sort by `(priority, id)` |
| Auto-detect flips a manually-disabled skill | `manualOverride: "off"` always wins |
| Bundled skill edited by user | User copy in `.tinyllama/skills/` wins; bundled is only the seed |
| No workspace open | Skills inert (need workspace signals) |
| Very many skills active | Cap total skill tokens (e.g. 4k); drop lowest priority with a note |

---

## 12. Open Questions

| Question | Recommendation |
|----------|----------------|
| New `SkillsPanel` tab vs section in `PromptPanel`? | New tab — distinct mental model (auto vs manual). |
| Should bundled skills be enabled by default? | Auto-detected ones yes; `git-conventions` always; others off until signal matches. |
| Cap on total injected skill tokens? | Yes — 4k default, configurable later; protects local model context. |
| Skill versioning before a registry exists? | Keep `version` field; unused until [29](29-skills-registry.md). |
| Should skills be able to declare required tools? | Deferred — skills shape prompts only in v1. |

---

## 13. Acceptance Criteria

1. A workspace with `react` in `package.json` auto-activates the `react` skill (⚡ badge, visible signal).
2. `{{workspace_name}}` and `{{git_branch}}` resolve to current values at each turn.
3. Disabling a skill via the sidebar (`manualOverride: "off"`) keeps it off even when its signal matches.
4. Skills inject between the tool instruction and user prompts, ordered by priority.
5. A user with no `.tinyllama/skills/` directory sees behavior identical to today.
6. Bundled skills can be edited in the editor and the edits persist in `.tinyllama/skills/`.

---

*Spec created: 2026-05-30 · Source: `extension.md` §3 · Target: Phase 1 (core differentiator)*
