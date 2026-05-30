# Tiny Llama — Enhancement Spec & Competitive Assessment

> **Version:** 1.0 — May 2026  
> **Scope:** Finishing incomplete features, hardening local-model experience, skills system, and competitive positioning analysis.

---

## Table of Contents

1. [Competitive Assessment](#1-competitive-assessment)
2. [Critical Fixes — LLM ↔ File Interaction](#2-critical-fixes--llm--file-interaction)
3. [Skills System (pi.dev-style)](#3-skills-system-pidev-style)
4. [Filesystem Watcher](#4-filesystem-watcher)
5. [LSP & Diagnostics](#5-lsp--diagnostics)
6. [Search Panel](#6-search-panel)
7. [Context & Compaction Hardening](#7-context--compaction-hardening)
8. [Local Model UX Improvements](#8-local-model-ux-improvements)
9. [Security Hardening](#9-security-hardening)
10. [Known Gaps — Completion Roadmap](#10-known-gaps--completion-roadmap)
11. [Implementation Priority Matrix](#11-implementation-priority-matrix)

---

## 1. Competitive Assessment

### 1.1 The Competitive Landscape

| Product | Model lock-in | Local models | Price | Open source | Offline |
|---------|--------------|-------------|-------|-------------|---------|
| **Cursor** | Anthropic/OpenAI | No | $20/mo | No | No |
| **Windsurf** | Codeium cloud | No | $15/mo | No | No |
| **GitHub Copilot** | OpenAI/Azure | No | $10/mo | No | No |
| **Continue.dev** | BYOM | Yes | Free | Yes | Yes |
| **Aider** | BYOM | Yes | Free | Yes | Yes |
| **Tiny Llama** | BYOM | Yes | Free | TBD | **Yes** |

### 1.2 Where Tiny Llama Can Win

**The privacy moat is real.** Every Cursor/Windsurf/Copilot competitor sends your code to a cloud endpoint. For regulated industries (fintech, healthcare, defense, legal), enterprise security teams, and developers working under NDA, this is a hard blocker. Tiny Llama is the only tool in this list that is meaningfully *air-gap capable* — code never leaves the machine. This is a genuine differentiator that money cannot easily replicate; Cursor cannot offer it without gutting their business model.

**The hackability angle.** Cursor is a black box. Tiny Llama's `.tinyllama/` directory convention, tool policy layer, and multi-file prompt system give developers direct, readable control over agent behavior. This maps well to a power-user segment that is underserved: developers who want to *understand and modify* their AI tooling.

**No subscription fatigue.** A meaningful cohort of developers is experiencing subscription exhaustion across their toolchain. A one-time or self-hosted model is increasingly attractive.

### 1.3 Where Tiny Llama Is Currently Weak

These are the gaps that would cause a developer evaluating against Cursor to walk away today:

**No LSP** is the single biggest gap. Go-to-definition, inline errors, hover docs, and rename-across-files are table-stakes for a code editor in 2026. Without them, experienced developers feel the absence immediately. Cursor's editor experience is largely VS Code; competing without language intelligence is an uphill battle.

**Local model quality ceiling.** Cursor's default models (claude-sonnet-class) are significantly more capable than most self-hosted models at the 7B–14B range accessible on consumer hardware. Tiny Llama needs to work around this with superior context management, better prompting, and smarter tool use to close the quality gap — it cannot compete on raw model intelligence without expensive hardware.

**No inline editing (Cmd+K equivalent).** This is one of Cursor's most-used features. The current architecture supports it but it is not started. Developers who use Cmd+K daily will find Tiny Llama's chat-only interaction model a significant regression.

**No autocomplete.** Settings UI exists but there is no inference hook. Copilot-style completions are now an expectation, not a differentiator.

**File watcher gap.** The explorer does not update when files change externally. Running `git pull`, `npm install`, or any terminal command that creates/deletes files leaves the tree stale until manual refresh. This is a polish gap that erodes trust.

### 1.4 The Realistic Competitive Position

Tiny Llama's best-case positioning is **not** "Cursor but cheaper." That race leads to feature parity wars against well-funded competitors. The stronger position is:

> **"The IDE for developers who cannot or will not send their code to a cloud."**

This means: air-gap environments, privacy-first organizations, local-first philosophy, and developers on regulated projects. The skills system (described in §3) reinforces this — it lets organizations define reusable agent behaviors that encode internal conventions, security policies, and domain knowledge without those artifacts leaving the machine.

A secondary position: **"The hackable agent workbench."** Developers who want to understand, fork, and modify their AI coding tool. The codebase architecture supports this well; it needs to be leaned into more deliberately.

### 1.5 What Would Make It Competitive Within 6 Months

In rough priority order:

1. Filesystem watcher wired to UI (trust/polish)
2. Skills system with auto-detection (core differentiator)
3. LSP via Rust-spawned language server (parity threshold)
4. Inline edit (Cmd+K) (parity threshold)
5. Autocomplete inference hook with local model (parity threshold)
6. Read file chunking + context management for local models (quality)
7. Visual compaction divider (trust)
8. OS keychain for API keys (enterprise readiness)

---

## 2. Critical Fixes — LLM ↔ File Interaction

### 2.1 File Tree Context — `.gitignore` Respect and Depth Limits

**Problem:** `buildWorkspaceContextBlock()` may inject node_modules, build artifacts, and other noise into every system prompt. For local models this is catastrophic — 2k tokens of irrelevant paths consumed before the conversation starts.

**Spec:**

- `get_file_tree` and `buildWorkspaceContextBlock()` must read `.gitignore` at workspace root (and nested `.gitignore` files) and filter accordingly.
- Implement a `MAX_TREE_DEPTH` constant (suggested default: 4) and `MAX_TREE_FILES` (suggested: 200). When the tree exceeds these, truncate with a `… (N more files)` annotation.
- Common always-exclude list regardless of `.gitignore`: `node_modules/`, `.git/`, `dist/`, `build/`, `__pycache__/`, `.next/`, `target/` (Rust).
- Tree refresh: the tree snapshot in the system prompt should be rebuilt at the start of each *agent turn*, not each message turn — the tree is expensive to emit for chat mode.

**Files to change:** `workspaceContext.ts`, `toolRunner.ts` (`get_file_tree` handler), `filesystem.rs` (`list_dir_tree`).

### 2.2 `read_file` Size Cap and Chunking

**Problem:** `read_file` has no apparent line/byte cap. Reading a 3000-line file into a 16k context window model leaves ~2k tokens for everything else.

**Spec:**

- Add `max_lines: number` and `start_line: number` parameters to the `read_file` tool schema (both optional, default `max_lines: 500`, `start_line: 0`).
- When a file is truncated, append a clear annotation: `[File truncated: showing lines 1–500 of 2847. Use read_file with start_line to read further.]`
- Add a `read_file_range` tool (or fold into `read_file`) so the agent can paginate deliberately.
- The Rust `read_file` command should enforce an absolute hard cap of 50,000 characters regardless of frontend parameters — defense in depth against prompt injection via very large files.

**Files to change:** `toolDefinitions.ts`, `filesystem.rs`, `toolRunner.ts`.

### 2.3 Tool Schema Trimming by Mode

**Problem:** All 16 tool schemas are sent to the model even in plan mode (9 tools) and agent mode. For local models each tool definition consumes 100–300 tokens. Sending unused schemas wastes context.

**Spec:**

- `buildSystemPrompt()` must compute the effective tool list (`modeTools ∩ policyAllowed`) and send *only* those schemas in `TOOL_USE_INSTRUCTION`.
- In chat mode, `TOOL_USE_INSTRUCTION` and all tool schemas must be omitted entirely.
- `TOOL_SUMMARY_INSTRUCTION` should also be omitted in chat mode.

**Files to change:** `ChatPane.svelte` (`buildSystemPrompt`), `streamTurn.ts`.

### 2.4 Tool Call Fallback — Malformed JSON Handling

**Problem:** `textToolCalls.ts` extracts tool calls from plain text for models without native function calling. If the model emits malformed JSON, the behavior is undocumented — a silent drop would cause the agent to loop or stall.

**Spec:**

- On JSON parse failure in `textToolCalls.ts`, push a visible error tool result into the history: `[Tool call parse error: model emitted invalid JSON. Raw: <snippet>]`
- This surfaces the error to both the user and the model, allowing recovery rather than silent stall.
- Add a `parseAttempts` counter — if 3 consecutive turns emit unparseable tool calls, abort the agent loop with a user-facing toast: "Agent stalled: model is not producing valid tool calls. Try a different model or simplify the request."

**Files to change:** `textToolCalls.ts`, agent loop in `ChatPane.svelte`.

### 2.5 Stall Detection in Agent Loop

**Problem:** A weak local model can loop calling the same tool with identical arguments, consuming steps and context without progress.

**Spec:**

- Track the last N (default: 3) tool calls as `{ name, args_hash }` tuples.
- If the same `(name, args_hash)` pair appears twice in the window, inject a system message: `[Note: you have called ${tool} with the same arguments twice. Review the result and try a different approach.]`
- If it appears three times, abort the loop with a user toast.
- `args_hash` is a simple stable JSON stringify + djb2 hash — no crypto dependency needed.

**Files to change:** `agentLimits.ts` (add stall types), agent loop in `ChatPane.svelte`.

---

## 3. Skills System (pi.dev-style)

This is the highest-leverage feature for Tiny Llama's differentiation. The existing `.tinyllama/prompts/` system is the right foundation — it needs to be extended into a proper skills layer.

### 3.1 Concept

A **skill** is a composable system prompt fragment that:
- Activates automatically based on workspace signals (file types, package.json, config files)
- Can inject dynamic context variables
- Is ordered by priority
- Can be shared across projects via a registry

### 3.2 Skill Definition Format

Introduce `.tinyllama/skills/` directory alongside the existing `prompts/` directory.

**`skill.json` manifest per skill:**

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
      { "type": "file_exists", "path": "package.json", "contains": "\"react\"" },
      { "type": "extension_present", "extensions": [".tsx", ".jsx"] }
    ]
  },
  "variables": ["workspace_name", "active_file", "git_branch"],
  "content": "skill.md"
}
```

**`skill.md` content with variable interpolation:**

```markdown
# React + TypeScript Conventions

Project: {{workspace_name}} | Branch: {{git_branch}}

When writing components in this project:
- Use functional components with explicit prop interfaces
- Co-locate component tests in `__tests__/` sibling directories
- Active file context: {{active_file}}
```

### 3.3 Auto-Activation Engine

**`src/lib/skills/skillDetector.ts`:**

```typescript
interface ActivationSignal {
  type: 'file_exists' | 'extension_present' | 'package_json_dep' | 'config_file'
  // ...
}

async function detectActiveSkills(
  workspacePath: string,
  fileTree: FileEntry[],
  activeFile: string | null
): Promise<string[]> // returns skill IDs that should be active
```

Signal types to implement in priority order:

| Signal type | Detection method | Example |
|-------------|-----------------|---------|
| `package_json_dep` | Read `package.json` deps/devDeps | React, Vue, Svelte, Next.js |
| `config_file` | Check for config file existence | `tailwind.config.*`, `vite.config.*`, `Cargo.toml` |
| `extension_present` | Scan file tree for extensions | `.rs`, `.go`, `.py`, `.tsx` |
| `file_exists` | Path + optional content match | `Dockerfile`, `.env.example` |
| `manual` | Always requires user enable | Custom org skills |

Detection runs on `applyWorkspaceFolder()` and again when the file tree changes (after FS watcher lands).

### 3.4 Variable Interpolation

**`src/lib/skills/skillVariables.ts`:**

| Variable | Value |
|----------|-------|
| `{{workspace_name}}` | basename of workspace path |
| `{{active_file}}` | relative path of currently focused editor tab |
| `{{git_branch}}` | current git branch |
| `{{open_files}}` | comma-separated list of open editor tab paths |
| `{{project_type}}` | detected type string (e.g. "Node.js / React / TypeScript") |
| `{{today}}` | ISO date |

Interpolation runs at system prompt assembly time (each turn), not at load time, so variables stay current.

### 3.5 Skills Sidebar Panel

Extend the existing `PromptPanel` or add a new `SkillsPanel` explorer tab:

- List all available skills (bundled + project-local)
- Auto-detected skills shown with a ⚡ badge and their triggering signal
- Manual enable/disable toggle per skill
- Per-skill mode checkboxes (same UX as existing prompts)
- "New skill" button → opens editor with scaffold `skill.json` + `skill.md`
- Priority drag-to-reorder

### 3.6 Bundled Skills (Starter Pack)

Ship the following skills out of the box in `src/lib/skills/bundled/`:

| Skill ID | Activates on |
|----------|-------------|
| `node-typescript` | `tsconfig.json` or `.ts` files |
| `react` | `react` in package.json |
| `svelte` | `svelte` in package.json |
| `rust` | `Cargo.toml` |
| `python` | `*.py` files or `pyproject.toml` |
| `docker` | `Dockerfile` |
| `git-conventions` | Any git repo (always active) |
| `testing` | `vitest`/`jest`/`pytest` in dependencies |

Each bundled skill encodes: framework conventions, common file structure, sensible agent tool-use instructions for that stack.

### 3.7 Skills Registry (Phase 2)

A future community registry at `registry.tinyllama.dev` (or GitHub-based) where developers can publish and install skills:

```bash
# Conceptual CLI (phase 2)
tlama skill install rust-embedded
tlama skill publish my-org-conventions
```

For now, "install" means: drop a directory into `.tinyllama/skills/`. The manifest format defined above should be stable from day one.

### 3.8 Skills vs Prompts — Coexistence

The existing `prompts/` system continues to work as-is. Skills are additive: they slot in *after* the base mode prompt and *before* user-authored system prompts in the assembly order:

```
1. MODE_CONFIG[mode].basePrompt
2. buildWorkspaceContextBlock()
3. TOOL_USE_INSTRUCTION (if tools enabled)
4. Active skills (ordered by priority, variables interpolated)
5. activeSystemPromptText (existing .tinyllama/prompts/ entries)
6. TOOL_SUMMARY_INSTRUCTION
```

---

## 4. Filesystem Watcher

`watcher.rs` exists but is not wired to the UI. This section specifies the complete integration.

### 4.1 Rust Side — `watcher.rs`

The watcher infrastructure exists. It needs:

- A Tauri event emitter that fires `fs:changed` events to the webview with payload:
  ```typescript
  interface FsChangedEvent {
    kind: 'create' | 'modify' | 'remove' | 'rename'
    path: string          // absolute path
    new_path?: string     // for renames
  }
  ```
- Debouncing: batch events within a 200ms window and emit once — editors generate many rapid modify events on save.
- Scope: watch the workspace root recursively, excluding `.git/` and `node_modules/`.
- The watcher should start when a workspace is opened (`pick_workspace_folder` or dev override) and stop on workspace close.

### 4.2 Frontend Side

**`src/lib/ipc.ts`:** Add `listenFsChanged(callback)` alongside the existing `listenPtyData`.

**`src/lib/workspace.ts`:** On `fs:changed`:
- `create` / `remove` / `rename` → `refreshFileTree()` (already exists, just needs the trigger)
- `modify` → if path is in `openFiles` and not dirty, re-read and update buffer silently; if dirty, show a subtle "File changed on disk" indicator (no forced overwrite)

**`src/lib/stores/files.ts`:** Add `externallyModified: Set<string>` — paths where disk content diverges from editor buffer. EditorSurface shows a non-intrusive banner: "File modified outside editor — [Reload] [Ignore]".

### 4.3 Git Panel Refresh

When `fs:changed` events include paths under `.git/` (e.g. after `git pull`, `git commit` from terminal), bump `gitRefresh` store automatically. This closes the current gap where running git commands in the terminal doesn't update the git panel.

---

## 5. LSP & Diagnostics

This is the largest single investment but the one that most closes the gap with Cursor. Recommend a phased approach.

### 5.1 Phase 1 — TypeScript/JavaScript LSP (Highest ROI)

TypeScript/JavaScript covers the majority of typical users. The TypeScript language server (`tsserver` / `typescript-language-server`) is the natural first target.

**Architecture:**

- Tauri spawns the language server as a child process via `tauri-plugin-shell` or a new `lsp` Rust module.
- Communication over `stdio` using JSON-RPC (LSP spec).
- A frontend `LspClient` class in `src/lib/lsp/` handles the protocol, maps file URIs to workspace paths, and exposes a simple API to CodeMirror.

**Rust side (`src-tauri/src/modules/lsp.rs`):**
```
spawn_lsp(server_path, workspace_path) → lsp_id
lsp_send(lsp_id, message: JsonRpc)
lsp_stop(lsp_id)
Event: lsp:message { lsp_id, message: JsonRpc }
```

**Frontend (`src/lib/lsp/`):**

| File | Role |
|------|------|
| `lspClient.ts` | JSON-RPC over Tauri events, request/response correlation |
| `lspProtocol.ts` | TypeScript types for LSP messages |
| `lspCodeMirror.ts` | CodeMirror extension: diagnostics, hover, completions |
| `lspStore.ts` | Active servers, diagnostics map → `editorErrorCountsByRel` |

**Features in Phase 1:**
- Diagnostics (errors/warnings as squiggles) — feeds existing `editorErrorCountsByRel` stub
- Hover documentation
- Basic completions (augments/replaces manual autocomplete)

**Features deferred to Phase 2:**
- Go-to-definition / find references
- Rename symbol
- Code actions / quick fixes

### 5.2 Phase 2 — Additional Language Servers

| Language | Server | Binary availability |
|----------|--------|-------------------|
| Rust | `rust-analyzer` | Cargo install |
| Python | `pylsp` or `pyright` | pip / npm |
| CSS/HTML | `vscode-langservers-extracted` | npm |
| Go | `gopls` | go install |

Phase 2 servers share the same Rust LSP module and frontend client — only configuration changes.

### 5.3 Server Discovery

Settings → LSP section (new):
- Auto-detect installed servers (check PATH for known binary names)
- Manual path override per language
- Enable/disable per language

---

## 6. Search Panel

The panel exists (`SearchPanel.svelte`) but is not wired. This is a relatively low-effort, high-value completion since `grep_workspace` (ripgrep) already works end to end.

### 6.1 Spec

**`SearchPanel.svelte`** — complete the existing component:

- Text input: search query
- Checkboxes: case-sensitive, regex, whole word
- File glob filter input (e.g. `**/*.ts`)
- Results grouped by file, collapsible, showing line number + context line
- Click result → open file in editor, scroll to line, highlight match
- Result count badge

Wire into `RightSidebar` as a fourth explorer tab (`files`, `git`, `prompt`, `search`).

**Status bar icon:** magnifying glass, toggles search panel visibility (same pattern as other panels).

**Keyboard shortcut:** `Cmd+Shift+F` / `Ctrl+Shift+F` — add to `defaults.ts`.

**Backend:** `grep_workspace` Tauri command already exists and returns ripgrep results. Frontend needs to parse and render them.

---

## 7. Context & Compaction Hardening

### 7.1 Visual Compaction Divider

**Problem:** Users cannot tell which part of the conversation the model "remembers" vs what was summarized away.

**Spec:** When `session.compactedAt` is set, render a horizontal divider in the chat transcript at that message index:

```
─────────────── Context compacted · 847 turns summarized ───────────────
```

Style: muted, non-intrusive. Clicking it should show a tooltip with the compaction summary text so users can verify what was retained.

**Files to change:** `ChatPane.svelte` (message list renderer), chat store (store `compactionMessageIndex`).

### 7.2 Context Budget Visualization

The status bar shows a context usage indicator but it is minimal. Enhance:

- Show `used / total` token count on hover (e.g. "12,847 / 32,768")
- Color gradient: green → yellow → red as usage climbs
- At 80% usage: yellow with tooltip "Context nearly full — compaction recommended"
- At 95%: red with auto-prompt to compact

**Files to change:** `StatusBar.svelte`, `contextBudget.ts`.

### 7.3 Per-Model Context Window Registry

Local models expose varying context windows. Ollama's `/api/show` endpoint returns model metadata including context length. llama.cpp's `/health` or `/props` endpoint does the same.

**Spec:**
- On model selection, fetch context window size from the active server if available.
- Store as `detectedContextWindow` in the model entry — override the default from settings.
- `contextBudget.ts` uses `detectedContextWindow ?? settings.contextWindow`.

This prevents the common failure mode where a user pulls a 128k context model but the app budgets for 8k.

---

## 8. Local Model UX Improvements

### 8.1 Tool Instruction Enhancement for Weak Models

`TOOL_USE_INSTRUCTION` in the current system prompt is likely terse. Local models (especially 7B) need more explicit guidance.

**Spec — enhanced `TOOL_USE_INSTRUCTION`:**

- Include one concrete worked example of a valid tool call in the exact format the fallback parser expects.
- Explicitly state: "Always call one tool at a time unless you are certain the calls are fully independent."
- Add: "After receiving a tool result, read it carefully before calling another tool. Do not repeat a tool call with identical arguments."
- For models flagged as `text_tool_fallback: true` in their settings entry, inject a more detailed format example.

**Files to change:** `src/lib/agent/prompts/` (wherever `TOOL_USE_INSTRUCTION` is defined), settings model metadata.

### 8.2 Model Capability Flags

Introduce a `ModelCapabilities` type in `providers/`:

```typescript
interface ModelCapabilities {
  nativeFunctionCalling: boolean
  contextWindow: number
  supportsThinking: boolean   // Anthropic extended thinking
  weakReasoning: boolean      // triggers more verbose prompting
}
```

Settings allows manual override. Ollama model names matching known-weak patterns (e.g. `phi3:mini`, `tinyllama`) auto-set `weakReasoning: true`.

### 8.3 Ollama Model Pull UI

The `ollamaClient.ts` has pull/delete helpers but there is no UI. Add to the Ollama settings section:

- Search box querying the Ollama library (or a curated list)
- One-click pull with streaming progress bar
- Delete button with confirmation
- "Recommended for agent use" badge on models known to handle tool calls well (Qwen2.5-Coder, Mistral-Nemo, etc.)

---

## 9. Security Hardening

### 9.1 OS Keychain for API Keys

**Current risk:** API keys in localStorage are readable by any JavaScript running in the webview, including content in the preview iframe if the sandbox is insufficient.

**Spec:**
- Integrate `tauri-plugin-keychain` (or the Tauri stronghold plugin).
- Migrate API key storage: write to OS keychain on settings save, read from keychain on settings load.
- localStorage retains a `hasStoredKey: boolean` flag per provider (not the key itself).
- Migration: on first launch after update, offer to migrate existing localStorage keys to keychain.
- Fallback: if keychain unavailable (some Linux configurations), warn and retain localStorage behavior.

**Files to change:** `settings.ts` store, `src-tauri/` (new keychain commands), `SettingsPane.svelte`.

### 9.2 Preview iframe Hardening

The preview iframe already restricts to localhost/127.0.0.1 but should add explicit sandbox attributes:

```html
<iframe
  sandbox="allow-scripts allow-same-origin allow-forms"
  src={previewUrl}
/>
```

This prevents the preview page from accessing `window.parent`, localStorage, or Tauri globals.

**Files to change:** `PreviewPane.svelte`.

---

## 10. Known Gaps — Completion Roadmap

| Feature | Current state | Effort | Priority |
|---------|--------------|--------|----------|
| **Filesystem watcher → UI** | Rust infra exists, not wired | Small | P0 |
| **Search panel** | Component exists, not wired | Small | P0 |
| **Compaction visual divider** | Logic works, no UI marker | Small | P0 |
| **read_file size cap** | No cap | Small | P0 |
| **Tool schema trimming by mode** | All schemas always sent | Small | P0 |
| **Stall detection** | No stall logic | Small | P1 |
| **Skills system** | Prompts foundation exists | Medium | P1 |
| **Context window auto-detect** | Manual only | Small | P1 |
| **Ollama model pull UI** | Logic exists, no UI | Small | P1 |
| **Inline edit (Cmd+K)** | Not started | Large | P1 |
| **LSP — TypeScript Phase 1** | Stub exists | Large | P1 |
| **Autocomplete inference hook** | Settings UI only | Medium | P1 |
| **OS keychain** | Not implemented | Medium | P2 |
| **Shortcut rebinding** | Display only | Small | P2 |
| **LSP — additional languages** | Not started | Medium | P2 |
| **Skills registry** | Not started | Large | P3 |
| **Bottom dock debug/serial** | Placeholder | Medium | P3 |
| **File-backed plans** | Not started | Medium | P3 |

---

## 11. Implementation Priority Matrix

### Phase 0 — Polish & Trust (1–2 weeks)

These are small, high-visibility fixes that immediately improve developer confidence in the tool:

1. Wire filesystem watcher → file tree refresh + git panel refresh
2. `read_file` size cap (500 line default, annotated truncation)
3. Tool schema trimming — only send active mode's tools
4. Compaction visual divider in chat transcript
5. Search panel wired up (ripgrep already works)
6. `.gitignore` respect in file tree and `buildWorkspaceContextBlock()`

### Phase 1 — Core Differentiators (4–8 weeks)

Features that close the gap with Cursor and enable the "local-first power user" positioning:

1. Skills system — detection engine, variable interpolation, sidebar UI, bundled starters
2. Stall detection and improved tool call error surfacing
3. LSP Phase 1 — TypeScript diagnostics and hover
4. Autocomplete inference hook (Ollama fill-in-middle endpoint)
5. Enhanced `TOOL_USE_INSTRUCTION` for local models + capability flags
6. Context window auto-detection from Ollama/llama.cpp

### Phase 2 — Competitive Parity (8–16 weeks)

Features required to retain developers who come from Cursor:

1. Inline edit (Cmd+K) — selection → chat with surrounding context, apply diff
2. LSP Phase 2 — go-to-definition, rename, Rust/Python servers
3. OS keychain for API keys
4. Ollama model pull UI with capability recommendations
5. Shortcut rebinding

### Phase 3 — Ecosystem (16+ weeks)

Features that build a community and compound value over time:

1. Skills registry (GitHub-based or hosted)
2. Plugin/extension API (expose tool system to userland JS)
3. File-backed plans (`plans/` directory with agent-editable markdown)
4. Multi-workspace / project switcher

---

*This spec was produced from direct analysis of the Tiny Llama assessment document (May 2026) and competitive landscape as of the same date. Implementation details assume the current architecture described in `assessment.md` and are intended to be additive — no existing subsystems need to be rewritten to implement any feature in Phases 0–2.*