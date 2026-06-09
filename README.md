# Spacebar Editor

A local-first desktop AI coding assistant built with **Tauri 2**, **Svelte 5**, and **CodeMirror 6**. Your code stays on your machine. You pick the model. Nothing phones home.

The privacy moat is real: run Ollama or llama.cpp locally and the only traffic leaving your machine is what you choose to send to a cloud API with your own key. The agent loop, context tracking, and tool execution all run in the desktop webview and Rust backend — no Node sidecar, no required cloud account.

**Hackable:** the shortcut system, tool policy, system prompts, and skills are all user-editable. The spec documents under `docs/specs/` describe every subsystem in detail.

---

## What is implemented now

| Area | Status |
|------|--------|
| Workbench shell (editor, terminal, explorer, git, search, sidebar) | Shipped |
| Welcome screen + recent projects (no folder open) | Shipped |
| Multi-tab chat with session history | Shipped |
| Agent loop with streaming + tool calling | Shipped |
| Ollama, llama.cpp, Anthropic, DeepSeek providers | Shipped |
| 16 built-in agent tools + custom tools | Shipped |
| Tool policy system (allow / ask / deny) | Shipped |
| Parallel read-only tool execution | Shipped |
| Git panel (stage, commit, diff, discard) | Shipped |
| Per-project state persistence (`.sidebar/`) | Shipped |
| Context budget tracking + breakdown popover | Shipped |
| Context overflow warnings (amber / red bar) | Shipped |
| Context compaction (manual + auto) + archive restore | Shipped — experimental |
| Workspace text search (ripgrep, `Cmd+Shift+F`) | Shipped |
| Filesystem watcher (explorer + git refresh) | Shipped |
| Editor line wrap + Prettier format / format-on-save | Shipped |
| Workbench themes (7 presets incl. Spacebar default) | Shipped |
| Editor + syntax colors (Appearance settings) | Shipped |
| Interactive theme preview + workbench-chrome customization | Shipped |
| Theme → editor/syntax sync on theme change | Shipped |
| Shortcut rebinding UI | Shipped |
| Browser preview tab (nav controls, :3000/:14200 quick buttons) | Shipped |
| Element inspector (click-to-chip; configurable highlight color) | Shipped |
| Chat composer attachment chips (file, folder, element) with Backspace removal | Shipped |
| Agent error recovery (retries, continue after step limit) | Shipped |
| Workspace lock (multi-window safety) | Shipped |
| LSP (diagnostics, hover; user-installed servers) | Partial |
| System prompts manager (`.sidebar/prompts/`) | Shipped |
| Per-project skills (CRUD UI + variable interpolation) | Shipped |
| Bundled skill starter pack + global/shared skills registry | Planned |
| Rust path sandbox (defense in depth) | Shipped — TS layer + Rust `canonicalize_workspace_path` |
| Agent turn undo (↩ Undo last turn) | Shipped — git checkpoint restore |
| OS keychain for API keys | Shipped — keys never stored in `localStorage` |
| Production CSP (Tauri `tauri.conf.json`) | Shipped |
| Cmd+K inline edit | Planned |

---

## How it works

Every user message in **Agent** or **Plan** mode drives a loop:

```
User message
  → build system prompt (mode + workspace + prompts + skills)
  → build provider message history
  → [optional] auto-compact if context threshold exceeded
  → stream one model turn (text + tool calls)
  → run tools through policy gates (allow / ask / deny)
  → append tool results to history
  → repeat until model stops, step limit hit, or context budget exceeded
  → refresh explorer / editor / git panel after filesystem changes
```

Data flow:

```
Svelte UI  →  lib/providers/*  →  HTTP fetch to LLM APIs
           →  lib/tools/toolRunner.ts  →  lib/ipc.ts  →  Tauri invoke
Rust       →  filesystem, git, grep, shell, web_fetch, PTY, LSP transport
```

There is no Node.js sidecar at runtime. Node is used only during build (Vite, Vitest, Tauri CLI).

---

## Providers

| Provider | Protocol | Streaming | Context window |
|----------|----------|-----------|----------------|
| **Ollama** | OpenAI-compatible `/v1/chat/completions` | SSE | Configurable per model (`num_ctx`); editable in the chat footer |
| **llama.cpp** | OpenAI-compatible (`llama-server`) | SSE | Set per model in provider settings |
| **Anthropic** | Anthropic Messages API | SSE | Model max; optional budget cap |
| **DeepSeek** | OpenAI-compatible | SSE | Chat and Reasoner models from catalog |

All providers stream tokens into the chat pane in real time. Local providers (Ollama, llama.cpp) show tok/s and time-to-first-token in the footer. Anthropic tracks cumulative input/output tokens.

**Models without native tool support:** some local models emit tool calls as plain text. The app recovers them via `textToolCalls.ts` and can run a synthesis pass for a final natural-language summary after tool-heavy turns.

---

## Agent tools

16 built-in tools grouped by category:

| Category | Tools |
|----------|-------|
| **Files** | `read_file`, `write_file`, `create_file`, `delete_file`, `move_file`, `list_dir`, `find_file`, `get_file_tree`, `grep` |
| **Git** | `get_git_status`, `get_git_log`, `get_git_diff` |
| **Shell** | `run_shell`, `run_tests`, `run_script` |
| **Network** | `web_fetch` (hostname allowlist enforced) |

All tools run inside the opened workspace. Paths are sandboxed at two layers: `pathUtils.ts` (TypeScript, fast-fail) and `canonicalize_workspace_path` (Rust, resolves symlinks). `..` traversal, absolute paths outside the workspace, and symlink escapes are all rejected before any filesystem operation. `write_file` and `create_file` create missing parent directories automatically, so an agent can write `pkg/sub/file.py` in one step.

Read-only tools (`read_file`, `list_dir`, `find_file`, `get_file_tree`, `grep`, git reads) can run in parallel when **Settings → Tools → Parallel execution** is enabled.

### Tool policy

Three policies apply per tool, configurable globally in Settings and per-project in `.sidebar/tools.json`:

| Policy | Behavior |
|--------|----------|
| **allow** | Executes immediately |
| **ask** | Shows an approval prompt above the composer |
| **deny** | Skipped; error returned to the model |

Defaults lean toward **allow** for reads and **ask** for writes and shell. The effective tool list sent to the model is `mode tools ∩ allowed tools` — denied tools are removed from the schema entirely.

### Agent limits

Configurable in Settings → Tools (0 = unlimited):

| Setting | Meaning |
|---------|---------|
| `maxAgentSteps` | Max model ↔ tool round trips per message |
| `maxToolCallsPerRun` | Total tool executions per message |
| `maxToolsPerTurn` | Tool calls allowed in a single model response |
| `parallelExecution` / `maxConcurrentTools` | Concurrent read-only tool batches |

---

## Context and compaction

### Segmented context bar

The chat footer shows a 3px bar divided into three segments:

- **Purple** — system prompt (base mode, workspace context, tool instructions, prompts, skills)
- **Orange** — tool schemas (native tool call mode only)
- **Blue** — chat history

Hover the bar to see a breakdown popover with per-section token counts, total used, context window size, and reply reserve. Usage states turn **amber** (70–90%) and **red** (>90%) as the budget fills.

### Compaction

When the context fills up, compaction summarizes old messages into a compact block and preserves the last N raw turns. Instead of silently dropping history:

1. A slice of history (first turn + last 20 messages) is sent to a summary model
2. The summary is structured markdown: original task, what was done, current state, files touched
3. History is replaced with a synthetic user/assistant pair wrapping the summary
4. The last `compactKeepRecentTurns` raw messages (default 6) are appended unchanged

**Archive and restore:** the full pre-compaction message list is saved as `preCompactionMessages` on the session. The compaction divider in the chat shows "N archived messages · Restore full context". Clicking "Restore full context" reverts the session to its pre-compaction state — one level of undo.

**Settings** (Settings → Compaction): master switch, summary model picker, auto-compaction threshold (50–95%, default 85%), keep-last-N raw turns (2–20).

---

## Theming

Three independent color systems:

| System | Where to configure |
|--------|-------------------|
| **Workbench theme** | Settings → General → Color theme (UI chrome, terminal ANSI, default editor/syntax tokens) |
| **Workbench chrome** | Settings → Appearance → Theme (sidebar, tabs, status bar, terminal colors) |
| **Editor chrome** | Settings → Appearance → Theme → Editor (background, gutter, selection, cursor) |
| **Syntax tokens** | Settings → Appearance → Theme → Syntax |
| **File icons** | Settings → Appearance → Icons (Seti, VS Code Icons, Codicons, custom pack) |

**Presets:** Spacebar (default), Dark Bubblegum, Cursor Dark, Light Paper, Light Cloud, Pink Studio, Blue Nova.

The Appearance → Theme page has an **interactive mini-workbench preview**: click a region (workbench chrome, editor, or syntax) to jump to its color pickers and see edits live. Changing the workbench theme updates the editor surface and syntax colors automatically (clears stale inline overrides). **Sync from theme** repopulates the pickers from the active preset, and **Reset to defaults** clears your overrides.

Default editor background matches the welcome screen (`--background`, `#1e1e1e`). See [docs/specs/13-theming.md](docs/specs/13-theming.md).

---

## Skills

Skills are reusable context fragments — markdown documents injected into the system prompt for the modes you choose. Each skill is a directory under `.sidebar/skills/<id>/` holding a `skill.json` manifest (id, title, description, enabled, modes, version) and a `skill.md` body.

**Current state (shipped):**
- **Skills manager** in Settings → Agent Context → Skills: create, edit, delete, enable/disable, and scope each skill to Chat / Plan / Agent.
- Enabled skills are interpolated and injected by `assemble.ts` (`buildActiveSkillBlocks`) for the active mode.
- **Variable interpolation** (`skillVariables.ts`): `{{workspace_name}}`, `{{git_branch}}`, `{{active_file}}`, `{{active_file_contents}}`, `{{open_files}}`, `{{today}}`, and more.
- Skills live in `.sidebar/skills/` so they can be committed and shared with the repo.
- The **assembly preview** (Settings → Agent Context) shows exactly what the model receives, including active skill blocks.

**Planned:**
- Bundled starter pack (Node/TS, React, Svelte, Rust, Python, Docker, Git Conventions)
- Auto-activation signals (file presence, `package.json` deps, config files)
- Global skills (`~/.sidebar/skills/`) and a share/install registry — see [Spec 29](docs/specs/29-skills-registry.md)

Design: [Spec 30](docs/specs/30-agent-context-and-model-settings.md).

---

## Git integration

The git panel is the primary surface for reviewing what the agent changed:

- **Staged** and **Changes** sections with M/A/D/R status badges
- Click a file → diff view in the editor (decorations vs HEAD)
- Stage, unstage, commit with a message, discard changes
- Hover actions on file rows for quick stage/discard

Agent tools that mutate files (`write_file`, `create_file`, `delete_file`, `move_file`) trigger an automatic git panel refresh. Git tools (`get_git_status`, `get_git_log`, `get_git_diff`) are read-only and available in Plan and Agent modes.

**Chat rewind & agent turn undo:** before sending a message the app snapshots the git tree (checkpoint). You can undo the entire last exchange with the **↩ Undo last turn** button that appears above the composer after a turn completes — it restores files to the checkpoint and puts your message back in the composer for editing. You can also click any past user message to edit and resend it.

---

## Configuration

### Global settings

Stored in `localStorage` under `sidebar.settings.v4` (migrates from v1–v3):

- Provider endpoints, model lists with per-model context window and tool call settings
- **API keys** are stored in the **OS keychain** (Keychain on macOS, libsecret on Linux, Credential Manager on Windows) — never in `localStorage`. The settings file stores only a `cloudApiKeyStored` flag per provider.
- Workbench theme, icon theme, editor/syntax/chat/explorer appearance
- Tool policy defaults, agent limits, parallel execution, web fetch hostname allowlist
- Compaction settings, model role assignments
- Anthropic extended thinking and context budget cap
- Shortcut overrides (`sidebar.keybindings.v1`)

Optional environment variable fallbacks: see `.env.example`.

**LSP server config** is stored separately in `sidebar.lsp.v1` (Settings → LSP).

### Per-project files (`.sidebar/`)

| Path | Purpose |
|------|---------|
| `.sidebar/state.json` | Chat sessions, history, editor tabs — autosaved |
| `.sidebar/.lock` | Workspace lock (PID) when another window has the folder open |
| `.sidebar/prompts/*.md` | Per-mode or shared system prompt files |
| `.sidebar/prompts.json` | Prompt manifest — enable/disable and mode scope |
| `.sidebar/tools.json` | Tool policy overrides and custom tool schemas |
| `.sidebar/skills/<id>/` | Project-scoped skills (`skill.json` manifest + `skill.md` body) |
| `.sidebar/prompt.md` | Legacy single prompt — auto-migrated to `prompts/agent.md` |

API keys stay in the OS keychain — never in the project files or environment variables. See [Security spec](docs/specs/14-security.md).

---

## Installing on Arch Linux

The easiest way — install from AUR (no FUSE required, managed by pacman):

```bash
yay -S spacebar-editor-bin   # or: paru -S spacebar-editor-bin
```

The PKGBUILD extracts the AppImage to `/opt/spacebar-editor` and installs a `/usr/bin/spacebar-editor` symlink. No `fuse2` needed at runtime.

---

## Development quick start

### Prerequisites

- Node.js 18+
- pnpm 9+
- Rust 1.70+
- [Tauri 2 platform dependencies](https://tauri.app/start/prerequisites/)

**Linux (Arch):**

```bash
sudo pacman -S webkit2gtk-4.1 gtk3 libayatana-appindicator librsvg openssl patchelf base-devel
```

> **AppImage note:** Arch ships `fuse3` by default. The bundled `.desktop` entry sets `APPIMAGE_EXTRACT_AND_RUN=1` automatically so the app runs without needing `fuse2`. If you're running the raw `.AppImage` from a terminal, prepend the variable yourself: `APPIMAGE_EXTRACT_AND_RUN=1 ./Spacebar\ Editor_*.AppImage`.

### Running

```bash
pnpm install

# Full dev: Vite dev server + Tauri desktop window (default)
pnpm dev

# Desktop app only (Tauri starts Vite internally)
pnpm dev:desktop

# Frontend only in the browser (no tools, git, or PTY)
pnpm dev:web
```

Dev server port: **14200** (set in `vite.config.ts`).

---

## Testing

```bash
# Unit tests (Vitest)
pnpm test

# LLM eval harness (requires Ollama running with a model pulled)
pnpm eval

# Run a specific eval suite
pnpm eval -- --suite 08-agent-files

# Run a specific eval test
pnpm eval -- --test agent-files-01

# Open the latest eval report
pnpm eval:report
```

The eval harness (`tests/llm/`) runs all three modes (Chat, Plan, Agent) against a real Ollama model. Full run against a 27B model takes 30–90 minutes. Results write to `tests/llm/results/` (gitignored). See [Spec 31](docs/specs/31-llm-eval-harness.md) for the full harness design.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Svelte frontend (src/)                                        │
│  WorkbenchShell · ChatPane · Editor · Terminal · GitPanel    │
│  Stores: chat, files, settings, toolPolicy, mode, ...        │
│  lib/providers/*  →  fetch() to LLM APIs                     │
│  lib/tools/*      →  ipc.ts → Tauri commands                 │
│  lib/lsp/*        →  LSP client (JSON-RPC over Tauri events) │
└────────────────────────────┬─────────────────────────────────┘
                             │ invoke() + events (pty:data, fs:changed, lsp:*, ...)
┌────────────────────────────▼─────────────────────────────────┐
│ Rust backend (src-tauri/src/)                                 │
│  filesystem · git · pty · grep · shell · web_fetch · lsp     │
└──────────────────────────────────────────────────────────────┘
```

- **Two-tier runtime:** Svelte agent loop + Rust IPC. No Node sidecar.
- **LLM HTTP:** `fetch()` from the webview directly to provider APIs. No Rust proxy.
- **Filesystem watcher:** `watcher.rs` → debounced `fs:changed` events → tree + git refresh in the UI.

Deep dive: [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) · [Specifications index](docs/specs/README.md)

---

## Roadmap

What is not built yet, in rough priority order:

| Area | Status | Spec |
|------|--------|------|
| MLX provider (Apple Silicon `mlx_lm.server`) | Planned — v0.1.3 | [42](docs/specs/42-mlx-provider.md) |
| Agent activity step grouping | Planned — v0.1.3 | [40](docs/specs/40-product-hardening-and-agent-ux.md) §5 |
| Skills: bundled starter pack + global/shared registry | Planned (per-project skills shipped) | [29](docs/specs/29-skills-registry.md) · [30](docs/specs/30-agent-context-and-model-settings.md) |
| File-backed planning system (`plans/`) | Planned | [19](docs/specs/19-planning-system.md) |
| Inline edit / Cmd+K | Planned | [28](docs/specs/28-inline-edit-autocomplete.md) |
| LSP Phase 2 (go-to-def, rename, more languages) | Planned | [25](docs/specs/25-lsp-diagnostics.md) |

Full roadmap with phasing: [docs/specs/17-roadmap.md](docs/specs/17-roadmap.md).

---

## License

MIT
