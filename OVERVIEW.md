# Tiny Llama — Application Overview

**Tiny Llama** is a minimal, local-first desktop IDE with an integrated AI coding agent. It targets developers who want a hackable Cursor-like shell without cloud lock-in: bring your own model (Ollama, llama.cpp, Anthropic), keep code on disk, and control tool policy per project.

**Platform:** Tauri 2 desktop only (Linux, macOS, Windows). Web-only `npm run dev` is supported for UI work but cannot run tools, git, or PTY.

---

## What it is today

| Area | Status |
|------|--------|
| **Workbench** | Chat (left), editor / terminal / preview tabs (center), explorer + git + search (right), status bar, bottom dock |
| **AI backends** | **Ollama**, **llama.cpp** (OpenAI-compatible HTTP), **Anthropic** (Messages API via webview `fetch`) |
| **Agent loop** | Multi-turn tool chain in [`ChatPane`](src/modules/agent/ChatPane.svelte): stream → tools → results → repeat; limits configurable in Settings |
| **Tools** | 16 built-in tools (filesystem, git, grep, shell, web fetch); policy `allow` / `ask` / `deny`; project overrides in `.tinyllama/tools.json` |
| **Git UI** | Source control panel: staged/changes lists, stage/unstage/commit, open diff view, discard changes |
| **Editor** | CodeMirror 6, 15 language grammars, custom syntax colors (Settings → Syntax), git diff highlighting |
| **Persistence** | Per-project `.tinyllama/state.json` (chat sessions + editor tabs); global settings in `localStorage` |
| **Security** | API keys in `localStorage` (not keychain); tool paths sandboxed in TS; Rust FS commands not yet workspace-enforced |

**Not in scope today:** LSP, Cmd+K inline edit, multi-root workspaces, cloud sync, sidecar/harness (removed — agent runs entirely in the Svelte + Rust stack).

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Svelte 5 frontend (src/)                                                 │
│  WorkbenchShell → ChatPane | CenterWorkbench | RightSidebar               │
│  lib/agent/streamTurn.ts  →  lib/providers/*  →  fetch() to LLM APIs       │
│  lib/tools/toolRunner.ts  →  lib/ipc.ts  →  Tauri invoke                  │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ invoke + events (pty:data, pty:exit)
┌───────────────────────────────▼──────────────────────────────────────────┐
│  Rust backend (src-tauri/src/modules/)                                    │
│  filesystem · git · pty · grep · shell · web_fetch · project state        │
└──────────────────────────────────────────────────────────────────────────┘
```

**Data flow (agent turn):** User message → `runAgentLoop` → `streamOneTurn` (provider HTTP) → optional tool calls → `executeTool` → Rust → tool results appended → next turn until the model stops or limits hit.

---

## AI chat

### Modes ([`src/lib/stores/mode.ts`](src/lib/stores/mode.ts))

| Mode | Tools | Use |
|------|-------|-----|
| **Chat** | None | Conversation only |
| **Plan** | Read-only subset | Explore / plan without writes |
| **Agent** | All allowed tools | Implementation |

### Providers

| Backend | Transport | Notes |
|---------|-----------|--------|
| **Ollama** | `POST /v1/chat/completions` | Local; context window adjustable from chat footer |
| **llama.cpp** | OpenAI-compatible | `llama-server`; context size is **server config** (footer shows read-only) |
| **Anthropic** | Messages API + SSE | API key in Settings; footer shows **monthly token usage** (local estimate) |

**Planned:** DeepSeek, Mistral, Perplexity (OpenAI-compatible; after Rust-side HTTP + keychain work).

### Agent limits (Settings → Tools)

| Setting | Default | Meaning |
|---------|---------|---------|
| Max agent steps | 12 | LLM ↔ tool round trips per user message |
| Max tool calls per run | 48 | Total tool executions across all steps |
| Max tools per turn | 0 (unlimited) | Cap tools from a single model response |

### Chat footer (provider-specific)

| Backend | Left | Right |
|---------|------|--------|
| Ollama | tok/s, tokens, duration | `~used / max` + **editable** context budget |
| llama.cpp | Same stream metrics | `~used / max · server` (read-only) |
| Anthropic | `X in · Y out this month` | Context estimate (read-only) |

Context meter uses `gpt-tokenizer` (estimate); API `usage` updates monthly totals for Anthropic when present.

### Tool policy

- **Global:** `localStorage` `tinyllama.toolPolicy.v2` + Settings UI
- **Project:** [`.tinyllama/tools.json`](.tinyllama/tools.json) — `toolRules`, `customTools` (custom tools need a handler in [`toolRunner.ts`](src/lib/tools/toolRunner.ts) or they fail at runtime)
- **Defaults:** `write_file` is **allow**; **ask** for `move_file`, `delete_file`, `run_shell`, `run_tests`, `run_script`, `web_fetch`

---

## Built-in tools

| Category | Tools |
|----------|--------|
| Files | `read_file`, `write_file`, `create_file`, `delete_file`, `move_file`, `list_directory`, `find_files`, `get_file_tree` |
| Git | `get_git_status`, `get_git_log`, `get_git_diff` |
| Shell | `run_shell`, `run_tests`, `run_script` |
| Network | `web_fetch` (hostname allowlist in Settings) |

Paths are resolved under the workspace root in [`pathUtils.ts`](src/lib/tools/pathUtils.ts). Agent writes trigger explorer/editor refresh via [`filesystemSync.ts`](src/lib/filesystemSync.ts) and git panel refresh via [`gitRefresh`](src/lib/stores/gitRefresh.ts).

---

## Git change review

The **Git** sidebar tab ([`GitPanel.svelte`](src/modules/explorer/GitPanel.svelte)) is the primary review surface for agent and manual edits:

- Collapsible **Staged** and **Changes** sections
- File rows with icons and status badges (M/A/D/U)
- **Click row** → open editor in diff mode (green/yellow vs HEAD)
- **Hover:** Open (editable), Discard, Stage / Unstage
- Rust: `git_discard`, `git_file_at_head`, plus existing status/stage/commit/diff

---

## Editor

- **Grammars:** JS/TS, HTML, CSS, JSON, Markdown, Rust, Python, YAML, Go, C/C++, Java, SQL, XML, Svelte (vue → HTML)
- **Syntax colors:** CSS variables via Settings → Syntax ([`syntaxTheme.ts`](src/lib/stores/syntaxTheme.ts))
- **Diff mode:** `OpenFile.diffBase` + line decorations when opened from Git panel
- **Save:** Ctrl/Cmd+S → `write_file` IPC

---

## Project & persistence

Opening a folder sets `files.workspacePath` and loads:

| Path | Purpose |
|------|---------|
| `.tinyllama/prompt.md` | Extra system instructions |
| `.tinyllama/tools.json` | Tool rules + custom tool schemas |
| `.tinyllama/state.json` | Chat sessions, history, editor tab list (autosaved) |

Switching workspaces saves the previous project state and hydrates the new one ([`projectState.ts`](src/lib/projectState.ts)).

**Caveat:** Workbench still stores terminal/preview tabs globally; only editor tabs and chat are per-project in `state.json`.

---

## Configuration (global)

**Storage key:** `tinyllama.settings.v3` ([`settings.ts`](src/lib/stores/settings.ts))

Providers, API keys, models, workbench theme, icon theme, syntax colors, web fetch hosts, agent limits, Anthropic extended thinking, optional context budget.

See [docs/SECRETS.md](docs/SECRETS.md) for credential hygiene.

---

## Development

```bash
npm install
npm run tauri dev    # desktop app (recommended)
npm test             # Vitest unit tests
```

Dev server default port: **14200**. No Node sidecar build step.

---

## Documentation map

| Document | Audience |
|----------|----------|
| **[OVERVIEW.md](OVERVIEW.md)** (this file) | Current product snapshot |
| **[spec.md](spec.md)** | Detailed specification, IPC, stores, roadmap |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | Deep dive (may lag; prefer this + spec for accuracy) |
| **[README.md](README.md)** | Install, prerequisites, quick start |

---

## Roadmap (summary)

**Dogfooding (now):** Git review UX, syntax coverage, agent limits, provider-aware footer, project state.

**Before private beta:** OS keychain for API keys, LLM calls in Rust, Rust workspace path enforcement, context overflow handling, agent error recovery.

**v1.0:** LSP, inline edit (Cmd+K), file watcher → UI, additional cloud providers, optional parallel read-only tools.

Full phased plan is in [spec.md § Roadmap](spec.md#roadmap).
