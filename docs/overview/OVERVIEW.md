# Sidebar Editor — Application Overview

> **Status:** ✅ **COMPLETE** — Current product snapshot (summary).
>
> **Full overview:** [README.md](../../README.md) — detailed guide to features, agent loop, tool calling, compaction, and configuration.
>
> See also: [Architecture](../architecture/ARCHITECTURE.md) · [Specifications](../specs/README.md)

**Sidebar Editor** is a minimal, local-first desktop IDE with an integrated AI coding agent. It targets developers who want a hackable Cursor-like shell without cloud lock-in: bring your own model (Ollama, llama.cpp, Anthropic, DeepSeek), keep code on disk, and control tool policy per project.

**Platform:** Tauri 2 desktop only (Linux, macOS, Windows). Web-only `pnpm dev:web` is supported for UI work but cannot run tools, git, or PTY.

---

## Implementation Status Summary

| Area | Status | Notes |
|------|--------|-------|
| Workbench UI | ✅ Complete | Chat, editor, terminal, preview, explorer, git, search |
| Welcome / recent projects | ✅ Complete | No-workspace screen — [36](specs/36-first-run-onboarding.md) |
| AI Backends | ✅ Complete | Ollama, llama.cpp, Anthropic, DeepSeek |
| Agent Loop | ✅ Complete | Multi-turn tool chains, parallel read-only tools |
| Context compaction | 🔶 Experimental | Manual + auto; Settings → Compaction — [21](specs/21-context-compaction.md) |
| Context overflow UI | ✅ Complete | Amber/red bar — [34](specs/34-context-overflow-warnings.md) |
| Tools (16) | ✅ Complete | Filesystem, git, grep, shell, web fetch |
| Git UI | ✅ Complete | Staged/changes, diff view, discard |
| Editor | ✅ Complete | CodeMirror 6, 15 grammars, wrap, Prettier, diff mode — [20](specs/20-editor-formatting-and-theming.md) |
| Theming | ✅ Complete | 9 workbench presets + interactive theme preview + chrome/editor/syntax appearance — [13](specs/13-theming.md) |
| Workspace lock | ✅ Complete | Multi-window safety — [35](specs/35-workspace-lock.md) |
| Shortcut rebinding | ✅ Complete | Settings → Keybindings — [37](specs/37-shortcut-rebinding.md) |
| LSP | 🔶 Partial | Diagnostics + hover; user-installed servers — [25](specs/25-lsp-diagnostics.md) |
| Persistence | ✅ Complete | Per-project `.sidebar/state.json` |
| Planning (`plans/`) | ❌ Not started | Plan mode is read-only + chat-only — [19](specs/19-planning-system.md) |
| Skills | ✅ Complete (per-project) | CRUD UI + variable interpolation; Settings → Agent Context → Skills — [30](specs/30-agent-context-and-model-settings.md). Bundled pack/registry still planned. |
| Security | 🔶 Partial | TS path sandbox; API keys in localStorage |
| Agent runtime | ✅ Complete | Webview agent loop + Rust IPC — **no Node sidecar** |

---

## What It Is Today

### Workbench
- **Chat** (left), **editor/terminal/preview tabs** (center), **explorer + git + search** (right)
- **Welcome screen** when no folder is open (recent projects, open folder)
- Status bar with context meter and pane toggles
- Bottom dock for additional terminals

### AI Backends

| Backend | Transport | Notes |
|---------|-----------|-------|
| **Ollama** | `POST /v1/chat/completions` | Local; context window adjustable from chat footer |
| **llama.cpp** | OpenAI-compatible | `llama-server`; context from server config |
| **Anthropic** | Messages API + SSE | API key in Settings; monthly token usage tracking |
| **DeepSeek** | OpenAI-compatible API | API key in Settings |

### Agent Loop

Multi-turn tool chain in `ChatPane.svelte`:
1. Stream model response
2. Execute tool calls (with policy gates; read-only tools may run in parallel)
3. Append results to context
4. Repeat until model stops or limits hit

**Configurable limits:** `maxAgentSteps`, `maxToolCallsPerRun`, `maxToolsPerTurn`, `parallelExecution`, `maxConcurrentTools`

### Built-in Tools

| Category | Tools |
|----------|-------|
| Files | `read_file`, `write_file`, `create_file`, `delete_file`, `move_file`, `list_dir`, `find_file`, `get_file_tree`, `grep` |
| Git | `get_git_status`, `get_git_log`, `get_git_diff` |
| Shell | `run_shell`, `run_tests`, `run_script` |
| Network | `web_fetch` (hostname allowlist) |

`write_file` / `create_file` create missing parent directories automatically.

### Agent Context & Skills

Settings → **Agent Context** controls what the model receives:
- **Skills** — per-project markdown context fragments (`.sidebar/skills/`), full CRUD, scoped per mode, with `{{variable}}` interpolation (workspace name, git branch, active file, open files, …)
- **System prompts** — per-mode / shared prompt files (`.sidebar/prompts/`)
- **Assembly preview** — shows the exact assembled system prompt (base + workspace + prompts + skills + tool instructions) with token counts

### Git Change Review

The **Git** sidebar tab is the primary review surface:
- Collapsible **Staged** and **Changes** sections
- File rows with status badges (M/A/D/U)
- **Click** → diff view (green/yellow vs HEAD)
- **Hover** → Open, Discard, Stage/Unstage

### Editor

- **15 language grammars:** JS/TS, HTML, CSS, JSON, Markdown, Rust, Python, YAML, Go, C/C++, Java, SQL, XML, Svelte
- **Line wrap** and **Prettier** (format command + optional format-on-save)
- **Custom editor chrome + syntax colors** via Settings → Appearance
- **Diff mode** with line decorations when opened from Git panel
- **LSP** diagnostics squiggles and hover (when a language server is installed and enabled)

### Project & Persistence

Opening a folder loads:

| Path | Purpose |
|------|---------|
| `.sidebar/prompts.json` + `prompts/*.md` | System prompt manifest and files |
| `.sidebar/tools.json` | Tool rules + custom tool schemas |
| `.sidebar/skills/<id>/` | Project skills (`skill.json` + `skill.md`) |
| `.sidebar/state.json` | Chat sessions, history, editor tabs (autosaved) |
| `.sidebar/.lock` | Workspace lock when another window owns the folder |

---

## Architecture (Short)

```
Svelte UI  →  providers (fetch) + toolRunner + lspClient  →  Tauri IPC
Rust       →  filesystem, git, pty, grep, shell, web_fetch, lsp
```

There is **no Node sidecar**. The agent loop runs in the webview; OS integration runs in Rust.

---

## Not In Scope Today

| Feature | Status |
|---------|--------|
| Persistent plans (`plans/`) | ❌ Not started |
| Cmd+K inline edit | ❌ Not started |
| LSP go-to-def / rename (Phase 2) | ❌ Not started |
| Skills bundled starter pack | ❌ Not started (per-project skills shipped) |
| Skills registry (global / share / install) | ❌ Not started |
| Multi-root workspaces | ❌ Not planned |
| Cloud sync | ❌ Not planned |
| OS keychain for secrets | ❌ Not started |
| LLM calls in Rust | ❌ Not started |
| Rust path canonicalization | ❌ Not started |
| Node sidecar / Pi harness | ❌ **Removed** |

---

## Configuration (Global)

**Storage keys:**
- `sidebar.settings.v4` — providers, themes, tool policy, agent limits, compaction
- `sidebar.keybindings.v1` — shortcut overrides
- `sidebar.lsp.v1` — LSP server commands per language

---

## Development

```bash
pnpm install
pnpm dev             # Vite + desktop (default)
pnpm dev:desktop     # desktop only
pnpm dev:web         # browser only
pnpm test            # Vitest unit tests
```

Dev server default port: **14200**. No Node sidecar build step.

---

## Documentation Map

| Document | Purpose |
|----------|---------|
| **[README.md](../../README.md)** | **Primary overview** — how the app works end-to-end |
| **[Overview](../overview/OVERVIEW.md)** (this file) | Short status snapshot |
| **[Architecture](../architecture/ARCHITECTURE.md)** | System design deep dive |
| **[Specifications](../specs/README.md)** | Detailed specs with completion status |
| **[Spec 40 — Hardening & agent UX](../specs/40-product-hardening-and-agent-ux.md)** | v0.1.1: keychain, shell patterns, write audit, limits, workspace notice (done); Plan/Step UI (§5) + LSP agent tools (§9) remaining |

---

*Last updated: 2026-06-04*
