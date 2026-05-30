# Tiny Llama — Application Overview

> **Status:** ✅ **COMPLETE** — Current product snapshot (summary).
>
> **Full overview:** [README.md](../../README.md) — detailed guide to features, agent loop, tool calling, compaction, and configuration.
>
> See also: [Architecture](../architecture/ARCHITECTURE.md) · [Specifications](../specs/README.md)

**Tiny Llama** is a minimal, local-first desktop IDE with an integrated AI coding agent. It targets developers who want a hackable Cursor-like shell without cloud lock-in: bring your own model (Ollama, llama.cpp, Anthropic), keep code on disk, and control tool policy per project.

**Platform:** Tauri 2 desktop only (Linux, macOS, Windows). Web-only `pnpm dev` is supported for UI work but cannot run tools, git, or PTY.

---

## Implementation Status Summary

| Area | Status | Notes |
|------|--------|-------|
| Workbench UI | ✅ Complete | Chat, editor, terminal, preview, explorer, git |
| AI Backends | ✅ Complete | Ollama, llama.cpp, Anthropic, DeepSeek |
| Agent Loop | ✅ Complete | Multi-turn tool chains with configurable limits |
| Context compaction | 🔶 Experimental | Manual + auto; Settings → Compaction — [spec](specs/21-context-compaction.md) |
| Tools (16) | ✅ Complete | Filesystem, git, grep, shell, web fetch |
| Git UI | ✅ Complete | Staged/changes, diff view, discard |
| Editor | 🔶 Partial | CodeMirror 6, 15 grammars, diff mode; wrap/Prettier/full syntax — [spec](specs/20-editor-formatting-and-theming.md) |
| Persistence | ✅ Complete | Per-project `.tinyllama/state.json` |
| Planning (`plans/`) | ❌ Not started | Plan mode is read-only + chat-only; spec: [19-planning-system.md](specs/19-planning-system.md) |
| Security | 🔶 Partial | TS path sandbox; API keys in localStorage |
| Agent runtime | ✅ Complete | Webview agent loop + Rust IPC — **no Node sidecar** ([spec](specs/03-architecture.md#agent-runtime-model-current)) |

---

## What It Is Today

### Workbench
- **Chat** (left), **editor/terminal/preview tabs** (center), **explorer + git + search** (right)
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
2. Execute tool calls (with policy gates)
3. Append results to context
4. Repeat until model stops or limits hit

**Configurable limits:** `maxAgentSteps`, `maxToolCallsPerRun`, `maxToolsPerTurn`

### Built-in Tools

| Category | Tools |
|----------|-------|
| Files | `read_file`, `write_file`, `create_file`, `delete_file`, `move_file`, `list_dir`, `find_file`, `get_file_tree` |
| Git | `get_git_status`, `get_git_log`, `get_git_diff` |
| Shell | `run_shell`, `run_tests`, `run_script` |
| Network | `web_fetch` (hostname allowlist) |

### Git Change Review

The **Git** sidebar tab is the primary review surface:
- Collapsible **Staged** and **Changes** sections
- File rows with status badges (M/A/D/U)
- **Click** → diff view (green/yellow vs HEAD)
- **Hover** → Open, Discard, Stage/Unstage

### Editor

- **15 language grammars:** JS/TS, HTML, CSS, JSON, Markdown, Rust, Python, YAML, Go, C/C++, Java, SQL, XML, Svelte
- **Custom syntax colors** via Settings → Syntax
- **Diff mode** with line decorations when opened from Git panel

### Project & Persistence

Opening a folder loads:

| Path | Purpose |
|------|---------|
| `.tinyllama/prompt.md` | Extra system instructions |
| `.tinyllama/tools.json` | Tool rules + custom tool schemas |
| `.tinyllama/state.json` | Chat sessions, history, editor tabs (autosaved) |

---

## Architecture (Short)

```
Svelte UI  →  providers (fetch) + toolRunner  →  Tauri IPC
Rust       →  filesystem, git, pty, grep, shell, web_fetch
```

There is **no Node sidecar**. The agent loop runs in the webview; OS integration runs in Rust.

---

## Not In Scope Today

| Feature | Status |
|---------|--------|
| Persistent plans (`plans/`) | ❌ Not started — [spec](specs/19-planning-system.md) |
| LSP | ❌ Not started |
| Cmd+K inline edit | ❌ Not started |
| Multi-root workspaces | ❌ Not planned |
| Cloud sync | ❌ Not planned |
| OS keychain for secrets | ❌ Not started |
| LLM calls in Rust | ❌ Not started |
| DeepSeek (cloud API) | ✅ Chat + tools via OpenAI-compatible API |
| Additional providers (Mistral, Perplexity) | ❌ Not started |
| Node sidecar / Pi harness | ❌ **Removed** — not part of current architecture |

---

## Configuration (Global)

**Storage key:** `tinyllama.settings.v3`

- Providers, API keys, models
- Workbench theme, icon theme, syntax colors
- Web fetch hosts
- Agent limits
- Anthropic extended thinking, context budget

---

## Development

```bash
pnpm install
pnpm tauri dev       # desktop app (recommended)
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

---

*Last updated: 2026-05-29*
