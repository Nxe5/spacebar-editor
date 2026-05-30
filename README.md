# Tiny Llama

A minimal, **local-first** desktop IDE with an integrated AI coding agent. Built with **Tauri 2**, **Svelte 5**, and **CodeMirror 6**.

Use **Ollama** or **llama.cpp** on your machine, or cloud APIs (**Anthropic**, **DeepSeek**) with your own keys. Agent tools read and write files in your project; changes show up in the **Git** panel for review and discard.

**More docs:** [Architecture](docs/architecture/ARCHITECTURE.md) · [Specifications](docs/specs/README.md) · [Overview snapshot](docs/overview/OVERVIEW.md)

---

## Table of contents

1. [What it is](#what-it-is)
2. [How the application works](#how-the-application-works)
3. [Main features](#main-features)
4. [AI providers & chat modes](#ai-providers--chat-modes)
5. [Agent loop & tool calling](#agent-loop--tool-calling)
6. [Context budget & compaction](#context-budget--compaction)
7. [Git, editor & terminal](#git-editor--terminal)
8. [Project persistence & configuration](#project-persistence--configuration)
9. [Architecture](#architecture)
10. [Quick start](#quick-start)
11. [Roadmap & gaps](#roadmap--gaps)

---

## What it is

Tiny Llama is a hackable, Cursor-like workbench that keeps **your code on disk** and **your model choice under your control**. There is no required cloud account and no Node.js sidecar at runtime—the agent loop runs in the desktop webview; filesystem, git, shell, and terminal integration run in Rust.

| Property | Detail |
|----------|--------|
| **Platform** | Tauri 2 desktop (Linux, macOS, Windows) |
| **UI** | Svelte 5 workbench: chat, editor, terminal, explorer, git |
| **Models** | Ollama, llama.cpp (local), Anthropic, DeepSeek (cloud) |
| **Agent** | Multi-turn streaming with 16 built-in tools |
| **Review** | Git panel for staged/unstaged changes, diffs, discard |

`pnpm dev` runs the frontend alone for UI work; tools, git, and PTY require `pnpm tauri dev`.

---

## How the application works

At a high level, every user message in **Agent** or **Plan** mode triggers a loop:

```
User message
    → build system prompt (mode + workspace + .tinyllama/prompt.md)
    → build provider message history
    → [optional] auto-compact if context threshold exceeded
    → stream one model turn (text + tool calls)
    → run tools through policy gates (allow / ask / deny)
    → append tool results to history
    → repeat until the model stops, limits hit, or context budget exceeded
    → refresh explorer / editor / git after filesystem changes
```

**Data paths:**

```
Svelte UI  →  lib/providers (HTTP fetch to LLM APIs)
           →  lib/tools/toolRunner.ts  →  lib/ipc.ts  →  Tauri invoke
Rust       →  filesystem, git, grep, shell, web_fetch, PTY
```

There is **no Node sidecar**. Node.js is used only for dev/build (Vite, Vitest, Tauri CLI).

---

## Main features

### Workbench layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Header: chat tabs · editor / terminal / preview tabs            │
├──────────────┬────────────────────────────────────┬─────────────┤
│ Chat pane    │ Center workbench                   │ Sidebar     │
│ · messages   │ · CodeMirror editor tabs           │ · Explorer  │
│ · tool cards │ · xterm terminal tabs              │ · Search    │
│ · composer   │ · HTML preview tabs                │ · Git       │
│ · context    │ · optional bottom dock (terminals) │             │
│   meter      │                                    │             │
└──────────────┴────────────────────────────────────┴─────────────┘
│ Status bar: model, context usage, pane toggles                  │
└─────────────────────────────────────────────────────────────────┘
```

- **Chat tabs** — multiple sessions per project; history picker for closed tabs
- **Composer** — mode switch (Chat / Plan / Agent), model picker, attachments, send/stop
- **Activity feed** — collapsible view of tool calls and intermediate “plan” text during agent turns
- **Settings** — separate Tauri window for providers, themes, tool policy, agent limits, compaction

### Chat modes

| Mode | Tools | Purpose |
|------|-------|---------|
| **Chat** | None | Pure conversation; no filesystem access |
| **Plan** | Read-only (read, grep, list, git read, web fetch) | Analyze and recommend without writes |
| **Agent** | All 16 built-in tools | Implement features, run commands, edit files |

The effective tool list sent to the model is **mode tools ∩ tool policy** (denied tools are removed from the schema).

### Per-project agent context

When a folder is open, the agent receives:

- Workspace path and optional file tree snippet
- Contents of `.tinyllama/prompt.md` (project-specific instructions)
- Merged tool rules from `.tinyllama/tools.json`

Chat sessions and editor tabs persist in `.tinyllama/state.json` (autosaved on change).

---

## AI providers & chat modes

### Supported backends

| Backend | Client | Streaming | Context window |
|---------|--------|-----------|----------------|
| **Ollama** | OpenAI-compatible `/v1/chat/completions` | SSE | Configurable per model (`num_ctx`); editable from chat footer |
| **llama.cpp** | OpenAI-compatible (`llama-server`) | SSE | From server / model row (read-only in footer) |
| **Anthropic** | Messages API | SSE | Model max capped by optional budget setting |
| **DeepSeek** | OpenAI-compatible API | SSE | Model catalog (Chat / Reasoner) |

Settings → Providers: connect Ollama/llama.cpp, enter API keys for cloud providers, choose default model and context size. Ollama supports an optional API key and a model grid to control which models appear in the chat picker.

### Streaming & metrics

- All backends stream tokens into the chat pane in real time
- Local backends (Ollama, llama.cpp) show tok/s and time-to-first-token in the footer
- Anthropic tracks monthly input/output token totals in the footer

### Models without native tool support

Some local models emit tool calls as plain text instead of structured `tool_calls`. The app can **recover tool invocations from text** (`textToolCalls.ts`) and optionally run a **synthesis** pass so the user gets a final natural-language summary after tool-heavy turns.

---

## Agent loop & tool calling

### Loop implementation

Core files:

| Piece | Location |
|-------|----------|
| Agent loop | `src/modules/agent/ChatPane.svelte` (`runAgentLoop`) |
| Single turn stream | `src/lib/agent/streamTurn.ts` (`streamOneTurn`) |
| Message shaping | `src/lib/agent/conversation.ts` |
| Tool execution | `src/lib/tools/toolRunner.ts` |
| Policy | `src/lib/stores/toolPolicy.ts`, `src/lib/toolPolicy.ts` |

Each **step** of the loop:

1. Check context budget; stop with a clear message if exceeded
2. Call `streamOneTurn()` with system prompt, history, tools schema, inference options
3. If the model returns tool calls, execute them (subject to policy and limits)
4. Append assistant message + tool result messages to history
5. Continue until no tools, step limit, tool-run cap, or user cancel

### Built-in tools (16)

| Category | Tools |
|----------|-------|
| **Files** | `read_file`, `write_file`, `create_file`, `delete_file`, `move_file`, `list_dir`, `find_file`, `get_file_tree` |
| **Git** | `get_git_status`, `get_git_log`, `get_git_diff` |
| **Shell** | `run_shell`, `run_tests`, `run_script` |
| **Network** | `web_fetch` (hostname allowlist) |

Tools run only inside the **opened workspace**. Paths are sandboxed: `..` traversal and paths outside the project root are rejected (`pathUtils.ts`).

### Tool policy

Three policies per tool (global Settings + per-project `.tinyllama/tools.json`):

| Policy | Behavior |
|--------|----------|
| **allow** | Execute immediately |
| **ask** | Show approval UI above composer (Allow / Allow always / Deny) |
| **deny** | Skip; return a policy error to the model |

Defaults lean toward **allow** for reads and **ask** for destructive or shell operations. Custom tool schemas can be declared in JSON; they need a matching handler in `TOOL_HANDLERS` to actually run.

### Agent limits

Configurable in Settings → Agent limits (0 = unlimited):

| Setting | Default | Meaning |
|---------|---------|---------|
| `maxAgentSteps` | 0 | Max model ↔ tool round trips per user message |
| `maxToolCallsPerRun` | 0 | Total tool executions per user message |
| `maxToolsPerTurn` | 0 | Tool calls allowed in a single model response |

When a cap is hit, the loop stops and the assistant explains why.

### Tool UI & filesystem sync

- Each tool call renders as a **ToolCallCard** (status, paths, output snippet)
- After write/move/delete tools, `filesystemSync.ts` refreshes the explorer and open editor tabs
- Git panel refresh runs after mutating operations

### Chat rewind

Before sending a user message, the app can snapshot the git tree (**checkpoint**). **Rewind** on a user message restores the workspace to that checkpoint and truncates chat history from that point—useful when an agent edit went wrong.

---

## Context budget & compaction

Long agent sessions fill the model context window. Tiny Llama tracks estimated token usage in the chat footer and supports **summarize-and-rehydrate compaction** (experimental).

### Context meter

- Estimates tokens from message history + in-flight stream + draft input (`chatContext.ts`, `contextBudget.ts`)
- Compares usage to the resolved context window for the active model
- Stops the agent loop with an explicit message when the **budget limit** (window minus reply reserve) would be exceeded

### Compaction strategy

Instead of silently dropping old messages, compaction:

1. Sends a **slice** of history (first user turn + last 20 messages) to a summary model
2. Asks for a structured markdown summary (original task, what was done, current state, files touched)
3. Replaces history with a **synthetic pair**:
   - User: `[Session context — compacted to free space]` + summary
   - Assistant: `Understood. Continuing from the compacted context.`
4. Appends the last **N** raw messages unchanged (`compactKeepRecentTurns`, default 6)

Session metadata records `compactedAt` and `compactionCount`.

### Compaction settings (Settings → Compaction)

| Control | Purpose |
|---------|---------|
| **Enable compaction** | Master switch; disables manual and auto compaction when off |
| **Use active chat model** | Summarize with the connected chat model (default) |
| **Compaction model picker** | When active model is off, pick any provider/model for summaries |
| **Enable automatic compaction** | Run before agent turns when context crosses threshold |
| **Threshold %** | Auto-trigger level (50–95%, default 85%) |
| **Keep last messages** | Raw tail preserved after summary (2–20) |

Manual compaction: **Compact** button in the chat footer (spark icon), when compaction is enabled and enough history exists.

Implementation: `src/lib/agent/compactHistory.ts`, `sessionCompaction.ts`, `compactionModel.ts`.

**Not yet wired:** embedding active plan file content in summaries ([planning spec](docs/specs/19-planning-system.md)), visual “compacted here” divider in the transcript.

---

## Git, editor & terminal

### Git panel

Primary surface for reviewing agent changes:

- **Staged** and **Changes** sections with status badges (M/A/D/U)
- Click a file → diff view in the editor (decorations vs HEAD)
- Stage, unstage, commit, discard; hover actions on file rows

### Editor

- **CodeMirror 6** with multi-tab editing
- **15+ language grammars** (JS/TS, Rust, Python, Go, HTML/CSS, JSON, Markdown, YAML, SQL, Svelte, etc.)
- Custom **syntax colors** and **editor chrome** (Settings → Appearance)
- Word wrap, format-on-save (Prettier where supported)
- Git diff mode when opened from the Git panel

### Terminal

- **xterm.js** + native PTY via Rust
- Tabs in the center workbench or bottom dock
- Full shell in the project directory

### Explorer & icons

- File tree with Seti, VS Code Icons, Codicons, or custom icon pack
- Configurable explorer colors and git decoration hints on rows

---

## Project persistence & configuration

### Global settings

Stored in `localStorage` under `tinyllama.settings.v3`:

- Provider endpoints, API keys, model lists, context templates
- Workbench theme, icon theme, syntax/editor/chat appearance
- Tool policy defaults, web fetch allowlist
- Agent limits, compaction, model role overrides
- Anthropic extended thinking and context budget cap

Optional env fallbacks: see [.env.example](.env.example).

### Per-project files

| Path | Purpose |
|------|---------|
| `.tinyllama/prompts/*.md` | Per-mode or shared system prompt files (edited in the editor) |
| `.tinyllama/prompts.json` | Prompt manifest — enable/disable and mode scope |
| `.tinyllama/prompt.md` | Legacy single prompt (migrated to `prompts/agent.md` on first load) |
| `.tinyllama/tools.json` | Tool policy overrides and custom tool schemas |
| `.tinyllama/state.json` | Chat sessions, history, editor tabs (auto) |

Secrets stay in local settings / env—not committed to the repo. See [Security spec](docs/specs/14-security.md).

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Svelte frontend (src/)                                        │
│  WorkbenchShell · ChatPane · Editor · Terminal · GitPanel    │
│  Stores: chat, files, settings, toolPolicy, mode, …          │
│  lib/providers/*  →  fetch() to LLM APIs                     │
│  lib/tools/*      →  ipc.ts → Tauri commands                 │
└────────────────────────────┬─────────────────────────────────┘
                             │ invoke + events (pty:data, …)
┌────────────────────────────▼─────────────────────────────────┐
│ Rust backend (src-tauri/src/)                                 │
│  filesystem · git · pty · grep · shell · web_fetch            │
└──────────────────────────────────────────────────────────────┘
```

Deep dive: [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md).

---

## Quick start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 9+
- [Rust](https://rustup.rs/) 1.70+
- [Tauri 2 platform deps](https://tauri.app/start/prerequisites/)

**Linux (Arch):**

```bash
sudo pacman -S webkit2gtk-4.1 base-devel curl wget openssl gtk3 libayatana-appindicator librsvg libvips
```

### Run

```bash
pnpm install
pnpm tauri dev
```

- Unit tests: `pnpm test`
- Integration tests (optional Ollama): [tests/README.md](tests/README.md)
- Dev server port: **14200** (`vite.config.ts`)

---

## Roadmap & gaps

| Area | Status |
|------|--------|
| Workbench, agent loop, tools, git UI | ✅ Shipped |
| Ollama, llama.cpp, Anthropic, DeepSeek | ✅ Shipped |
| Context compaction (manual + auto) | 🔶 Experimental |
| Editor wrap, Prettier, expanded theming | 🔶 Partial |
| File-backed planning (`plans/`) | ❌ Not started |
| Inline autocomplete | ❌ Settings only |
| LSP, Cmd+K inline edit | ❌ Not started |
| OS keychain for API keys | ❌ Not started |
| LLM calls in Rust | ❌ Not started |
| Rust path sandbox (defense in depth) | 🔶 Partial (TS sandbox today) |

Full roadmap: [docs/specs/17-roadmap.md](docs/specs/17-roadmap.md).

---

## License

MIT
