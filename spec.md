# Tiny Llama — Application Specification

This document is the **engineering specification** for Tiny Llama: product intent, current behavior, persistence, IPC, and roadmap. For a shorter snapshot see [OVERVIEW.md](OVERVIEW.md). For a deep architectural walkthrough see [ARCHITECTURE.md](ARCHITECTURE.md) (verify against code when they disagree).

**Last aligned with codebase:** 2026 — Tauri 2, no Node sidecar, direct provider `fetch` from the webview.

---

## 1. Product overview

### 1.1 Purpose

Tiny Llama is a **minimal Cursor-like IDE** for **desktop** use:

- Multi-tab **CodeMirror 6** editor with syntax highlighting and git diff view
- **File explorer** with icon themes (Seti, VS Code icons, codicons, custom packs)
- **Git** panel for status, staging, commit, and change review
- **Terminal** (xterm.js + native PTY)
- **AI chat** with streaming and **agentic tool use** (Plan / Agent modes)
- Swappable **LLM backends**: Anthropic (cloud), Ollama and llama.cpp (local)

### 1.2 Positioning

- **Local-first / BYOM:** Run models on your machine or bring your own API keys; no Tiny Llama cloud.
- **Trust through git:** Agent file changes appear in the Git **Changes** list; review with diff highlighting and **Discard** (not a pre-write chat modal).
- **Hackable:** Small Svelte + Rust codebase; tools and prompts are project-local under `.tinyllama/`.

### 1.3 Non-goals (current)

| Non-goal | Notes |
|----------|--------|
| Browser deployment as primary product | Tauri desktop only for real use |
| Node sidecar / Pi harness | **Removed**; do not document `sidecar/` or harness IPC |
| Full LSP | Editor is syntax-highlighted text; no completions/diagnostics |
| Multi-root workspaces | Single folder per window |
| Cloud sync / accounts | All state is local |
| Cmd+K inline edit | Chat + tools only for edits |

---

## 2. Technology stack

| Layer | Technology |
|--------|------------|
| Desktop shell | **Tauri 2**, `@tauri-apps/api`, `tauri-plugin-shell` |
| UI | **Svelte 5** (runes: `$state`, `$props`, `$effect`, `$derived`) |
| Styling | **Tailwind CSS 4**, CSS variables (`globals.css`, `workbench-themes.css`, `editor-syntax.css`) |
| Editor | **CodeMirror 6** + language packs (see §10) |
| Terminal | **xterm.js**, `@xterm/addon-fit` |
| Rust | serde, **git2**, portable-pty, **notify** (watcher module present, not wired to UI), rfd, walkdir, **reqwest** (`web_fetch`) |
| AI | **Direct HTTP/SSE** from webview: [`anthropic.ts`](src/lib/providers/anthropic.ts), [`openaiCompat.ts`](src/lib/providers/openaiCompat.ts) via [`streamTurn.ts`](src/lib/agent/streamTurn.ts) |
| Token estimate | `gpt-tokenizer` (cl100k) for context meter pre-send |
| Tests | **Vitest** (`tests/unit/`), optional Ollama integration |

**Dev:** Vite 6 MPA — `index.html` (main), `settings.html` (settings window). Default dev port **14200** (`vite.config.ts`, `tauri.conf.json`).

---

## 3. High-level architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Svelte Frontend (src/)                                                   │
│  WorkbenchShell ──┬── ChatPane (agent loop, streaming, tool approval)   │
│                   ├── CenterWorkbench (editor / terminal / preview)      │
│                   └── RightSidebar (explorer, search, git)                │
│  Stores: chat, files, workbench, settings, toolPolicy, mode, iconTheme    │
│  lib/agent/     conversation.ts, streamTurn.ts                            │
│  lib/providers/ anthropic.ts, openaiCompat.ts  ──► fetch() to LLM APIs   │
│  lib/tools/     toolDefinitions.ts, toolRunner.ts ──► ipc.ts              │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ Tauri invoke + events (pty:data, pty:exit)
┌───────────────────────────────▼──────────────────────────────────────────┐
│  Rust Backend (src-tauri/src/modules/)                                    │
│  filesystem.rs   read/write/list/grep/find/tree/web_fetch                 │
│  git.rs          status, diff, stage, commit, log, discard, file@HEAD     │
│  pty.rs          create/write/resize/close                                  │
│  commands.rs     Tauri command handlers                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

**Security boundary (today):** Tool path sandboxing is enforced in **TypeScript** ([`pathUtils.ts`](src/lib/tools/pathUtils.ts)). Rust `read_file` / `write_file` accept any path the OS allows — **planned:** canonicalize against workspace root in Rust.

**Secrets (today):** API keys in **`localStorage`** (`tinyllama.settings.v3`). **Planned:** OS keychain via Stronghold; LLM HTTP in Rust so keys never touch the webview.

---

## 4. Entry points and windows

| Entry | File | Role |
|--------|------|------|
| Main | `index.html` → `src/main.ts` → `App.svelte` → `WorkbenchShell` | Primary IDE |
| Settings | `settings.html` → `src/settings-main.ts` → `SettingsWindowRoot` | Secondary window |
| Tauri | `src-tauri/src/main.rs` | `invoke_handler`, PTY manager |

**Windows:** `main` (workbench), `settings` (on demand via `open_settings_window`).

---

## 5. Workbench layout

Implemented in [`WorkbenchShell.svelte`](src/modules/workbench/WorkbenchShell.svelte):

- **Title bar** — workspace label, terminal/preview/chat/explorer toggles, folder picker, settings
- **Left** — [`ChatPane`](src/modules/agent/ChatPane.svelte) + [`ChatTabBar`](src/modules/agent/ChatTabBar.svelte)
- **Center** — [`CenterWorkbench`](src/modules/workbench/CenterWorkbench.svelte): tab strip + [`EditorSurface`](src/modules/editor/EditorSurface.svelte) / terminal / preview
- **Right** — [`RightSidebar`](src/modules/explorer/RightSidebar.svelte): Explorer, Search, **Git**
- **Bottom** — optional [`BottomDock`](src/modules/workbench/BottomDock.svelte) (terminal, stubs)
- **Footer** — [`StatusBar`](src/modules/workbench/StatusBar.svelte)

**Shortcuts:** [`src/modules/shortcuts/`](src/modules/shortcuts/) — Mod+B chat, Mod+Shift+E explorer, Mod+J bottom dock, Mod+, settings, Mod+W close tab, Alt+Shift+T terminal, etc.

---

## 6. State management

### 6.1 `settings` — `tinyllama.settings.v3`

| Field | Meaning |
|--------|---------|
| `apiKeys.anthropic`, `apiKeys.openai` | API keys (OpenAI reserved for future providers) |
| `chatBackend` | `"anthropic"` \| `"ollama"` \| `"llamacpp"` |
| `ollamaEndpoint`, `llamacppEndpoint`, `llamacppApiKey` | Local server URLs / optional llama.cpp key |
| `selectedModel`, `ollamaModels`, `llamacppModels` | Active model + discovered lists |
| `anthropicExtendedThinking` | Claude extended thinking stream |
| `anthropicContextBudget` | Optional cap (`null` = full model window) |
| `workbenchTheme` | Theme id ([`workbench-theme.ts`](src/lib/workbench-theme.ts)) |
| `webFetchAllowedHosts` | Hostname allowlist for `web_fetch` |
| `agentLimits` | `maxAgentSteps`, `maxToolCallsPerRun`, `maxToolsPerTurn` ([`agentLimits.ts`](src/lib/agentLimits.ts)) |

### 6.2 `files`

| Field | Meaning |
|--------|---------|
| `tree` | Explorer `FileEntry[]` |
| `openFiles` | Buffers: `path`, `content`, `isDirty`, `language`, optional `diffBase` |
| `activeFilePath` | Canonical path |
| `workspacePath` | Project root |

Paths normalized via [`normalizeFilePath`](src/lib/fsPath.ts).

### 6.3 `workbench` — `tinyllama.workbench.v1`

Editor / terminal / preview tabs; editor tab ids `editor:<path>`. Persisted **globally** in localStorage (terminal/preview not in per-project state).

### 6.4 `chat`

Multi-session chat, streaming flag, tool call UI state, session history list.

### 6.5 `toolPolicy` — `tinyllama.toolPolicy.v2`

Global rules + merge with [`.tinyllama/tools.json`](.tinyllama/tools.json) via `effectiveToolPolicy`. Settings UI edits global policy; project file on disk.

### 6.6 `providerUsage` — `tinyllama.providerUsage.v1`

Monthly input/output token totals per provider id (from API `usage` on responses). Used in Anthropic chat footer.

### 6.7 Project state — `.tinyllama/state.json`

[`projectState.ts`](src/lib/projectState.ts) autosaves per workspace:

- Chat `sessions`, `history`, `activeSessionId`
- Editor tab list + `activeTabId` (paths scoped to workspace)

Hydrated on folder open; saved on switch and debounced on changes.

---

## 7. Workspace and projects

**Project = one opened folder.**

| Concern | Behavior |
|---------|----------|
| Explorer | Tree rooted at `workspacePath` |
| System prompt | `.tinyllama/prompt.md` + mode base + workspace context block |
| Tool cwd / paths | `executeTool(..., workspacePath)` |
| Chat history | **Persisted** in `.tinyllama/state.json` per project |
| Editor tabs | **Persisted** per project in `state.json` |
| Global settings | API keys, theme, agent limits — machine-wide |

**Workspace resolution:** `pick_workspace_folder` writes override to OS config dir; else `current_dir` at launch ([`commands.rs`](src-tauri/src/modules/commands.rs)).

**Explorer ignore:** dotfiles, `node_modules`, `target`, `dist` (Rust list_dir).

---

## 8. AI agent system

### 8.1 Flow

1. User sends message → appended to session.
2. `buildProviderMessages()` + `buildSystemPrompt()` (mode + workspace + custom prompt).
3. `runAgentLoop()` in ChatPane:
   - For each **step** (up to `settings.agentLimits.maxAgentSteps`):
     - `streamOneTurn()` → text + optional tool calls
     - If no tools → done
     - `executeToolCallsWithApproval()` → policy gates → `executeTool()` → IPC
     - Append tool results; continue
   - Stop if **max tool calls per run** exceeded
4. `filesystemSync` + `bumpGitRefresh()` after mutating tools.

### 8.2 Providers

| Backend | Client | Streaming |
|---------|--------|-----------|
| `anthropic` | [`anthropic.ts`](src/lib/providers/anthropic.ts) | SSE |
| `ollama`, `llamacpp` | [`openaiCompat.ts`](src/lib/providers/openaiCompat.ts) | SSE |

### 8.3 Chat footer profiles

Defined in [`chatFooterProfile.ts`](src/lib/chatFooterProfile.ts):

| Backend | Stream metrics | Context budget UI | Monthly usage |
|---------|----------------|-------------------|---------------|
| Ollama | Yes | Editable menu | No |
| llama.cpp | Yes | Read-only (`· server`) | No |
| Anthropic | No | Read-only estimate | Yes (`providerUsage` store) |

### 8.4 Tool approval

When policy is `ask`, UI above composer blocks until Allow / Deny (with “allow always” option for session). Sequential execution within a turn (parallel read-only tools **planned**).

---

## 9. Tool system

### 9.1 Built-in tools (16)

See [`toolDefinitions.ts`](src/lib/tools/toolDefinitions.ts) and [`toolRunner.ts`](src/lib/tools/toolRunner.ts).

**Default policy highlights:**

- `write_file`, `create_file`, `read_file`, most read tools: **allow**
- `move_file`, `delete_file`, `run_shell`, `run_tests`, `run_script`, `web_fetch`: **ask**

### 9.2 Custom tools

Defined in Settings or `.tinyllama/tools.json`. Require a handler in `TOOL_HANDLERS` to execute; otherwise runtime returns `Unknown tool`.

### 9.3 `web_fetch`

Rust [`web_fetch`](src-tauri/src/modules/filesystem.rs) with hostname allowlist from settings.

---

## 10. Editor

### 10.1 Languages

[`getLanguageFromPath`](src/lib/ipc.ts) maps extensions to language ids.

**Loaded grammars** in [`loadCodeMirror.ts`](src/lib/editor/loadCodeMirror.ts): javascript, typescript, html, css, json, markdown, rust, python, yaml, go, cpp, c, java, sql, xml, svelte; vue → html.

**Not loaded:** toml, shell, etc. → plain text until packs added.

### 10.2 Syntax colors

Custom highlight via [`syntaxTheme.ts`](src/lib/editor/syntaxTheme.ts) + `--syntax-*` CSS variables (Settings → Syntax). Not auto-synced to every workbench preset.

### 10.3 Git diff mode

[`openGitDiffFile`](src/lib/git/openChangedFile.ts) sets `diffBase` from `git_file_at_head`; [`diffDecorations.ts`](src/lib/editor/diffDecorations.ts) highlights added/changed lines; editor read-only in diff mode.

---

## 11. Git integration

### 11.1 UI — [`GitPanel.svelte`](src/modules/explorer/GitPanel.svelte)

- Branch + refresh
- Collapsible **Staged** / **Changes** (persisted collapse in localStorage)
- File rows: icon, path, status badge
- Click → diff view; hover → Open, Discard, Stage/Unstage
- Commit message + recent log

### 11.2 Rust — [`git.rs`](src-tauri/src/modules/git.rs)

| Function | Command |
|----------|---------|
| status, branch, diff, stage, unstage, commit, log | existing |
| `git_discard` | Restore tracked file from HEAD; delete untracked |
| `git_file_at_head` | Content at HEAD for diff base |

### 11.3 Agent tools

`get_git_status`, `get_git_log`, `get_git_diff` — formatted for model context.

---

## 12. Tauri IPC

### 12.1 Commands (current)

| Command | Purpose |
|---------|---------|
| `list_dir`, `read_file`, `write_file`, `rename_entry`, `delete_entry`, `path_exists` | Filesystem |
| `find_files`, `list_dir_tree`, `grep_workspace`, `run_shell`, `web_fetch` | Search / shell / HTTP |
| `get_workspace_path`, `pick_workspace_folder` | Workspace |
| `git_*` | Git (includes `git_discard`, `git_file_at_head`) |
| `pty_*` | Terminal |
| `read_system_prompt`, `write_system_prompt` | `.tinyllama/prompt.md` |
| `read_project_state`, `write_project_state` | `.tinyllama/state.json` |
| `open_settings_window` | Settings webview |
| `icon_pack_*`, `pick_icon_pack_folder` | Icons |

**Removed / do not use:** `start_harness`, `send_to_harness`, `stop_harness`, `harness:event`.

### 12.2 Events

| Event | Purpose |
|--------|---------|
| `pty:data`, `pty:exit` | Terminal I/O |
| `fs:changed` | Defined in watcher module; **not wired** to frontend |

### 12.3 Frontend wrapper

[`ipc.ts`](src/lib/ipc.ts) — lazy Tauri API; `isTauriAvailable()` for degraded Vite-only dev.

---

## 13. Theming

- **Workbench:** `data-workbench-theme` on `<html>`; presets in `workbench-themes.css`
- **Editor chrome:** `--editor-*` variables
- **Syntax:** `--syntax-*` via syntax theme store
- **Terminal:** `--terminal-ansi-*` from theme
- **Icons:** Seti font, VS Code SVG pack, codicons, custom manifest

---

## 14. Security and secrets

See [docs/SECRETS.md](docs/SECRETS.md).

| Topic | Current | Planned |
|--------|---------|---------|
| API keys | `localStorage` v3 | OS keychain (Stronghold) |
| LLM HTTP | Webview `fetch` | Rust proxy + events |
| CSP | `null` in `tauri.conf.json` | Restrictive CSP for release |
| Path sandbox | TS tools only | Rust FS commands |
| Chat XSS | Plain text messages (no markdown HTML) | DOMPurify if markdown added |

---

## 15. Testing

```bash
npm test                    # unit tests
npm run test:ollama         # optional live Ollama
```

Representative suites: `toolRunner`, `toolPolicy`, `pathUtils`, `filesystemSync`, `agentLimits`, `chatFooterProfile`, `providerUsage`, `diffDecorations`, providers (mocked fetch).

---

## 16. Build

```bash
npm install
npm run tauri dev      # development
npm run tauri build    # release bundle
```

No sidecar build step.

---

## 17. Roadmap

Phased priorities from production review and recent implementation work.

### Phase A — Dogfooding (in progress / recent)

| Item | Status |
|------|--------|
| Configurable agent limits (steps, tool calls) | Done |
| Provider-specific chat footer | Done |
| Monthly API usage tracking (Anthropic) | Done |
| Git panel redesign + discard + diff view | Done |
| Expanded syntax grammars + custom syntax colors | Done |
| Per-project `state.json` (chat + editor tabs) | Done |
| Parallel read-only tools | Planned |
| Context overflow warnings + API usage in meter | Planned |
| Filter custom tools without handlers | Planned |

### Phase B — Trust and reliability (pre–private beta)

| Item | Notes |
|------|--------|
| Rust workspace path enforcement | All path-taking FS IPC |
| Agent error recovery | Retry, cancel cleanup, Continue after max steps |
| Workspace lock | Prevent two windows corrupting `state.json` |
| File watcher → UI | Wire `watcher.rs` to `filesystemSync` |
| Agent turn undo | Snapshot or git-based batch discard |

### Phase C — Security (before external users)

| Item | Notes |
|------|--------|
| Stronghold / keychain | Keys never in JS |
| LLM calls in Rust | `reqwest` + stream events |
| Production CSP | `tauri.conf.json` |

### Phase D — v1.0 parity (selective)

| Item | Notes |
|------|--------|
| LSP | Spawn language servers from Rust |
| Cmd+K inline edit | CodeMirror decorations |
| DeepSeek, Mistral, Perplexity | OpenAI-compat + provider registry |
| Custom tool shell executor | Optional `.tinyllama` command templates |
| Context compaction | Summarize / sliding window |
| Full provider billing APIs | Beyond local monthly estimates |

### Explicitly deferred

- Multi-root workspaces
- Cloud sync
- Mobile / web deployment as product
- Matching Cursor feature-for-feature

---

## 18. Glossary

| Term | Meaning |
|------|---------|
| Workspace / project | Root folder opened by the user |
| Agent step | One `streamOneTurn` + execution of returned tool calls |
| Tool call run | All steps for a single user message until stop or limit |
| Diff mode | Editor showing working tree with highlights vs `diffBase` (HEAD) |
| Provider usage | Local monthly token tallies from API responses |

---

## 19. Document maintenance

When changing behavior, update in order:

1. Code
2. [OVERVIEW.md](OVERVIEW.md) (snapshot)
3. This file (spec)
4. [ARCHITECTURE.md](ARCHITECTURE.md) (detailed reference, as needed)

**Authoritative source:** the repository at `HEAD`, not legacy README or sidecar docs.
