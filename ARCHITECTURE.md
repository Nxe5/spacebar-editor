# Tiny Llama — Comprehensive Architecture Reference

> **Start here:** [OVERVIEW.md](OVERVIEW.md) (accurate product snapshot) and [spec.md](spec.md) (specification + roadmap).  
> This document is a detailed reference. When it conflicts with code or those two files, **trust the code** and update the docs.

This document describes how **Tiny Llama** works end-to-end: UI layout, state, AI agent loop, tool calling chains, theming, syntax highlighting, Rust backend, and persistence. It is intended for architecture review and onboarding.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Technology Stack](#2-technology-stack)
3. [System Architecture](#3-system-architecture)
4. [Application Bootstrap](#4-application-bootstrap)
5. [Workbench UI Layout](#5-workbench-ui-layout)
6. [State Management](#6-state-management)
7. [Workspace & Project Lifecycle](#7-workspace--project-lifecycle)
8. [AI Chat Subsystem](#8-ai-chat-subsystem)
9. [Multi-Turn Tool Calling Chains](#9-multi-turn-tool-calling-chains)
10. [Tool System](#10-tool-system)
11. [Rust / Tauri Backend](#11-rust--tauri-backend)
12. [Color & Theming Systems](#12-color--theming-systems)
13. [File Icons Per File Type](#13-file-icons-per-file-type)
14. [Editor Syntax Highlighting](#14-editor-syntax-highlighting)
15. [Git Integration](#15-git-integration)
16. [Terminal (PTY)](#16-terminal-pty)
17. [Settings & Persistence](#17-settings--persistence)
18. [Keyboard Shortcuts](#18-keyboard-shortcuts)
19. [Testing Strategy](#19-testing-strategy)
20. [Extension Points & Known Limits](#20-extension-points--known-limits)
21. [Directory Map](#21-directory-map)

---

## 1. Product Overview

Tiny Llama is a **minimal Cursor-like desktop IDE** with an integrated AI chat assistant. It targets developers who want a lightweight coding workbench with:

- Multi-tab **CodeMirror 6** editor
- **File explorer** with icon themes
- **Git** panel (status, stage, commit, diff, log)
- **Terminal** (xterm.js + native PTY)
- **AI chat** with streaming responses and agentic tool use
- Swappable **LLM backends** (Anthropic, Ollama, llama.cpp)

The app runs as a **Tauri 2** desktop shell. The Svelte frontend talks to a Rust backend via Tauri `invoke` commands for filesystem, git, shell, grep, PTY, and HTTP fetch operations. AI providers are called **directly from the frontend** via `fetch` (no Node sidecar in the current codebase).

---

## 2. Technology Stack

| Layer | Technologies |
|-------|-------------|
| **Desktop shell** | Tauri 2, `@tauri-apps/api`, `tauri-plugin-shell` |
| **Frontend** | Svelte 5, Vite 6, TypeScript, Tailwind CSS 4 |
| **UI primitives** | bits-ui (shadcn-svelte style), Phosphor icons, VS Code codicons |
| **Editor** | CodeMirror 6 + language packs (JS/TS, HTML, CSS, JSON, Markdown, Rust, Python) |
| **Terminal** | xterm.js, `@xterm/addon-fit` |
| **Rust backend** | serde, git2, portable-pty, notify, rfd, walkdir, reqwest |
| **AI** | Direct HTTP/SSE to OpenAI-compatible APIs (Ollama, llama.cpp) and Anthropic Messages API |
| **Token estimation** | `gpt-tokenizer` (cl100k approximation for context meter) |
| **Testing** | Vitest (unit tests; optional Ollama integration) |

---

## 3. System Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Svelte Frontend (src/)                            │
│                                                                           │
│  WorkbenchShell ──┬── ChatPane (agent loop, streaming, tool approval)    │
│                   ├── CenterWorkbench (editor / terminal / preview tabs) │
│                   └── RightSidebar (explorer, search, git)                 │
│                                                                           │
│  Stores: chat, files, workbench, settings, toolPolicy, mode, iconTheme   │
│                                                                           │
│  lib/agent/     conversation.ts, streamTurn.ts                           │
│  lib/providers/ openaiCompat.ts, anthropic.ts  ──► fetch() to LLM APIs    │
│  lib/tools/     toolDefinitions.ts, toolRunner.ts ──► ipc.ts             │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ Tauri invoke + events (pty:data, pty:exit)
┌───────────────────────────────▼──────────────────────────────────────────┐
│                    Rust Backend (src-tauri/src/)                            │
│  filesystem.rs   read/write/list/grep/find/tree/web_fetch                  │
│  git.rs          status, diff, stage, commit, log                          │
│  pty.rs          create/write/resize/close + event emit                    │
│  commands.rs     Tauri command handlers + settings window                  │
│  icon_pack.rs    bundled icon pack paths                                   │
└──────────────────────────────────────────────────────────────────────────┘
```

**Data flow summary:**

1. User types in chat → `ChatPane` runs the agent loop.
2. Each turn calls `streamOneTurn()` → provider streams text + tool call deltas.
3. Tool calls pass through policy gates → `executeTool()` → `ipc.ts` → Rust commands.
4. Tool results are appended to provider message history → next turn.
5. Filesystem mutations trigger `filesystemSync.ts` to refresh explorer and editor tabs.

---

## 4. Application Bootstrap

| Entry | File | Role |
|-------|------|------|
| Main window | `index.html` → `src/main.ts` → `App.svelte` | Primary workbench |
| Settings window | `settings.html` → `src/settings-main.ts` | Secondary MPA window (Vite multi-page build) |

`App.svelte` renders a single child: `WorkbenchShell.svelte`.

On mount, `WorkbenchShell`:

1. Applies workbench theme from settings (`applyWorkbenchTheme`).
2. Initializes icon theme store (`iconTheme.init()`).
3. Starts project state autosave (`initProjectStateAutosave()`).
4. Registers global keyboard shortcuts.

Vite config (`vite.config.ts`):

- Dev server on port **14200** (configurable via `VITE_PORT`).
- Static assets from `static/` (icon packs at `/icon-packs/...`).
- Code splitting: codemirror, xterm, tauri into separate chunks.

---

## 5. Workbench UI Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Header: [ChatTabBar] | [WorkbenchTabBar]                                 │
├──────────────┬──────────────────────────────────────────┬───────────────┤
│              │                                          │               │
│  ChatPane    │  CenterWorkbench                         │ RightSidebar  │
│  (left)      │  - Editor tabs (CodeMirror)              │ - Activity    │
│              │  - Terminal tabs (xterm)                 │   strip       │
│  - Messages  │  - Preview tabs (iframe)                 │ - File tree   │
│  - Tool UI   │                                          │ - Search      │
│  - Input     │  [optional BottomDock: terminal/output]  │ - Git         │
│              │                                          │               │
├──────────────┴──────────────────────────────────────────┴───────────────┤
│ StatusBar: toggle panes, context token meter, settings                   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Resizable panes** (widths/heights persisted in `localStorage` key `tinyllama.paneWidths.v1`):

- Left chat pane: 200–560 px
- Right explorer pane: 200–560 px (or collapsed to 34 px activity strip)
- Bottom dock: 120–560 px

**Module locations:**

| UI Area | Primary Files |
|---------|---------------|
| Shell / layout | `src/modules/workbench/WorkbenchShell.svelte` |
| Chat | `src/modules/agent/ChatPane.svelte`, `ChatTabBar.svelte` |
| Editor / tabs | `src/modules/workbench/CenterWorkbench.svelte`, `WorkbenchTabBar.svelte` |
| Explorer | `src/modules/explorer/RightSidebar.svelte`, `FileTree.svelte`, `FileTreeRow.svelte` |
| Git | `src/modules/explorer/GitPanel.svelte`, `SourceControl.svelte` |
| Settings | `src/modules/settings/SettingsPane.svelte` (modal + popout window) |
| Status bar | `src/modules/workbench/StatusBar.svelte` |

---

## 6. State Management

Tiny Llama uses **Svelte writable/derived stores** (not a global Redux-like framework). Key stores:

### `chat` — `src/lib/stores/chat.ts`

- **Sessions**: open chat tabs + closed history (max 80 in history).
- **Messages**: `user`, `assistant`, `tool` roles.
- Assistant messages may carry `rawToolCalls` (for replay into provider format).
- Tool messages carry `toolCallId` and `toolName`.
- Streaming state: `isStreaming`, `currentToolCall` (in-progress tool card).

### `files` — `src/lib/stores/files.ts`

- `workspacePath`: root of open project.
- `tree`: explorer file tree (`FileEntry` with lazy children).
- `openFiles`: in-memory editor buffers (`OpenFile`: path, content, language, isDirty).

### `workbench` — `src/lib/stores/workbench.ts`

- Tab bar state: `tabs[]`, `activeTabId`.
- Tab kinds: `editor` | `terminal` | `preview`.
- Editor tab IDs are deterministic: `editor:{normalizedPath}`.

### `settings` — `src/lib/stores/settings.ts`

- Persisted in `localStorage` key `tinyllama.settings.v3`.
- Chat backend, API keys, model selection, Ollama/llama.cpp endpoints.
- Workbench theme, Anthropic extended thinking, web fetch allowlist.

### `toolPolicy` — `src/lib/stores/toolPolicy.ts`

- Global tool rules in `localStorage` key `tinyllama.toolPolicy.v2`.
- Derived `effectiveToolPolicy` merges project overlay from `.tinyllama/tools.json`.

### `currentMode` — `src/lib/stores/mode.ts`

- Chat mode: `chat` | `plan` | `agent`.
- Each mode defines base system prompt and allowed tool name list.

### `iconTheme` — `src/lib/stores/iconTheme.ts`

- Icon pack selection: `seti` | `vscode-icons` | `codicons` | `custom`.
- Manifest caching, custom pack path, URL resolution for SVG icons.

### Cross-store coordination

- `projectState.ts` snapshots chat + editor tabs to `.tinyllama/state.json` per workspace.
- `filesystemSync.ts` updates `files` + `workbench` after agent filesystem tools.
- `workspace.ts` handles folder open, tree building, refresh.

---

## 7. Workspace & Project Lifecycle

### Opening a folder

1. User picks folder via `pickWorkspaceFolder()` (Tauri native dialog).
2. `applyWorkspaceFolder()` → `switchProjectWorkspace()` in `projectState.ts`.
3. Previous workspace state is saved; UI tabs cleared.
4. New workspace tree loaded via `listDir`.
5. `.tinyllama/state.json` restored (chat sessions, open editor tabs).
6. `.tinyllama/prompt.md` loaded into system prompt store.
7. `.tinyllama/tools.json` merged into effective tool policy.

### Project-local files

| Path | Purpose |
|------|---------|
| `.tinyllama/state.json` | Chat sessions, history, open editor tab paths |
| `.tinyllama/prompt.md` | Custom system instructions appended to mode prompt |
| `.tinyllama/tools.json` | Per-project tool rules and custom tool schemas |

### Autosave

Debounced (~1.2 s) save when `chat` or `workbench` stores change for the active workspace. Also saved on `beforeunload`.

---

## 8. AI Chat Subsystem

### Chat modes

Defined in `src/lib/stores/mode.ts` (`MODE_CONFIG`):

| Mode | Tools exposed | Behavior |
|------|---------------|----------|
| **Chat** | None (`[]`) | Pure conversation, no file access |
| **Plan** | Read-only tools | Analysis without writes |
| **Agent** | All 16 built-in tools | Full read/write/exec |

Final tool list = **mode tools ∩ effective policy** (denied/removed tools excluded from schema sent to model).

### System prompt assembly

Built in `ChatPane.svelte` → `buildSystemPrompt()`:

1. **Mode base prompt** (`MODE_CONFIG[mode].basePrompt`)
2. **Workspace context** (`src/lib/agent/workspaceContext.ts`) — project root path
3. **Custom instructions** from `.tinyllama/prompt.md` (`src/lib/stores/systemPrompt.ts`)

### Message conversion

`src/lib/agent/conversation.ts`:

- UI history → OpenAI-style provider messages.
- `buildProviderMessages(systemPrompt, history)` prepends system message.
- `appendAssistantToolCalls()` / `appendToolResults()` extend in-flight messages during the agent loop.

### Streaming layer

`src/lib/agent/streamTurn.ts` — **`streamOneTurn()`**:

- Single abstraction over Anthropic vs OpenAI-compatible backends.
- Consumes unified `StreamEvent` stream:
  - `delta` — text chunk
  - `tool_call` — completed tool call `{ id, name, arguments }`
  - `done` — optional token usage
  - `error` — throws
- Returns `{ content, toolCalls, usage? }`.

### Providers

| Backend | File | Protocol |
|---------|------|----------|
| Ollama, llama.cpp | `src/lib/providers/openaiCompat.ts` | `POST /v1/chat/completions` SSE |
| Anthropic | `src/lib/providers/anthropic.ts` | Anthropic Messages API SSE |

Both providers incrementally assemble tool call arguments from stream deltas (OpenAI: `tool_calls[].function.arguments`; Anthropic: `input_json_delta`).

### Context meter

`src/lib/chatContext.ts` estimates tokens via `gpt-tokenizer` for the status bar display. This is approximate (Claude tokenization differs slightly).

---

## 9. Multi-Turn Tool Calling Chains

This is the core agentic loop. All orchestration lives in **`runAgentLoop()`** in `src/modules/agent/ChatPane.svelte` with **`MAX_AGENT_STEPS = 12`**.

### Sequence diagram

```
User message
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│  FOR step = 0 .. 11:                                         │
│    1. streamOneTurn(providerMessages, tools)                 │
│    2. IF toolCalls.length === 0:                             │
│         save assistant message → EXIT LOOP                   │
│    3. ELSE:                                                  │
│         save assistant message + rawToolCalls                │
│         providerMessages += assistant(tool_calls)            │
│         executeToolCallsWithApproval(toolCalls)  ◄── sequential│
│         save tool result messages to chat UI                 │
│         providerMessages += tool results                     │
│         IF step === 11: append "max steps" warning           │
│         CONTINUE to next step                                │
└─────────────────────────────────────────────────────────────┘
```

### Within a single model turn: multiple parallel tool requests

When the model returns **multiple `tool_calls` in one response**, they are executed **sequentially** (not in parallel) in `executeToolCallsWithApproval()`:

```typescript
for (const tc of toolCalls) {
  // 1. Parse JSON arguments
  // 2. If policy === "deny" → error result, continue
  // 3. If policy === "ask" → block on approval UI (Promise)
  // 4. executeTool(name, args, workspacePath)
  // 5. syncUiAfterFilesystemTool(...) on success
  // 6. Push { id, name, content } to results[]
}
```

All results from that turn are batched into `providerMessages` before the **next** `streamOneTurn()` call.

### Across turns: chaining example

**User:** "Find where `executeTool` is defined and add a comment."

| Step | Model action | Tool execution | Context grows with |
|------|-------------|----------------|-------------------|
| 1 | Calls `grep` | Runs ripgrep via Rust | grep output |
| 2 | Calls `read_file` | Reads matched file | file contents |
| 3 | Calls `write_file` | Writes modified file | success message |
| 4 | Text-only reply | (no tools) | final assistant message |

Each step is a separate LLM API call. The model sees the full conversation including prior assistant `tool_calls` and `tool` role results.

### Policy gates during execution

Before each tool runs:

| Rule | Behavior |
|------|----------|
| `allow` | Execute immediately |
| `ask` | Show approval UI; user can Allow, Allow always (persists `allow`), or Deny |
| `deny` | Skip execution; return policy error string as tool result |

Default **ask** tools: `move_file`, `delete_file`, `run_shell`, `run_tests`, `run_script`, `web_fetch`.

### Cancellation

`AbortController` passed to provider streams. Cancel also resolves pending tool approval as denied.

### UI feedback during tools

- `chat.setToolCall({ tool, input, status: "running" })` while executing.
- Tool cards rendered in message stream.
- After filesystem mutations, explorer and open editor tabs sync via `filesystemSync.ts`.

### Hard limits

- **12 model turns** per user message (not configurable in UI).
- **No parallel tool execution** within a turn.
- **Custom tools** appear in schema but `executeTool()` returns `"Unknown tool"` unless a handler is added to `TOOL_HANDLERS`.
- **Browser-only dev** (`npm run dev` without Tauri): tools fail with "requires Tauri".

---

## 10. Tool System

### Tool definitions (model-facing schema)

`src/lib/tools/toolDefinitions.ts` — 16 built-in tools in OpenAI function-calling format:

**Read / discovery:**

- `read_file`, `list_dir`, `grep`, `find_file`, `get_file_tree`
- `get_git_status`, `get_git_log`, `get_git_diff`
- `web_fetch`

**Write / execute:**

- `write_file`, `create_file`, `delete_file`, `move_file`
- `run_shell`, `run_tests`, `run_script`

Lists:

- `ALL_TOOL_NAMES` — all keys in `TOOL_DEFINITIONS`
- `READ_ONLY_TOOLS` — plan mode subset
- `WRITE_TOOLS` — mutating tools

### Tool execution (runtime)

`src/lib/tools/toolRunner.ts` — **`executeTool(name, args, workspacePath, context?)`**:

1. Requires Tauri environment.
2. Requires valid workspace path (not `/` or empty).
3. Dispatches to `TOOL_HANDLERS` map.
4. Paths resolved via `src/lib/tools/pathUtils.ts`:
   - Workspace sandbox: blocks `..` traversal
   - Absolute paths outside workspace rejected
   - `/file.txt` treated as workspace-relative

Returns `{ success: boolean, output: string }`. Errors are formatted as strings, not thrown (except caught internally).

**Special behaviors:**

- `run_tests` — auto-detects npm/cargo/pytest style test runners
- `web_fetch` — requires non-empty host allowlist from settings; Rust enforces hostname match
- `grep` — invokes `rg` (ripgrep) in Rust backend, max 500 matches

### Tool policy (schema filtering + runtime gates)

`src/lib/toolPolicy.ts`:

- `getActiveToolDefinitions(state)` — builds tool list for model (excludes denied/removed builtins, applies overrides, adds custom tools)
- `getToolsForPolicy(state, modeToolNames)` — intersects mode list with active definitions
- `resolveToolRule()` — custom tool rule > per-tool rule > default rule

Project overlay: `src/lib/projectTools.ts` loads `.tinyllama/tools.json`, merged via `mergeProjectToolsLayer()`.

### Path from model request to disk

```
Model stream → StoredToolCall { id, name, arguments: JSON string }
    → executeToolCallsWithApproval (policy)
    → executeTool (toolRunner.ts)
    → ipc.ts invoke("read_file" | "grep_workspace" | ...)
    → Rust commands.rs
    → filesystem.rs / git.rs / shell
    → ToolResult { success, output }
    → appendToolResults → next streamOneTurn
```

---

## 11. Rust / Tauri Backend

Entry: `src-tauri/src/main.rs`

Registers Tauri commands and manages `PtyManager` state.

### Modules

| Module | Responsibility |
|--------|----------------|
| `filesystem.rs` | list/read/write/delete/rename, find files, directory tree, web fetch |
| `git.rs` | git2-based status, diff, stage, unstage, commit, log, branch |
| `pty.rs` | portable-pty sessions; emits `pty:data` and `pty:exit` events |
| `commands.rs` | Tauri command wrappers, grep (spawns `rg`), shell execution |
| `icon_pack.rs` | Resolve bundled/custom icon pack directories |
| `watcher.rs` | File system watching (infrastructure) |

### Filesystem listing rules

`list_directory()` in `filesystem.rs`:

- Hides dotfiles, `node_modules`, `target`, `dist code`, simple `.gitignore` top-level names
- Sorts directories before files, case-insensitive name order

### Shell execution

`run_shell` in `commands.rs`:

- Runs in workspace directory as cwd
- Uses `sh -c` on Unix, `cmd /C` on Windows
- Default timeout 30 s (configurable via tool args)
- Returns stdout, stderr, exit code, timed_out flag

### Grep

`grep_workspace` spawns **ripgrep** (`rg`) with `--line-number`, `--no-heading`, `--max-count=500`.

### IPC command reference

| Command | Purpose |
|---------|---------|
| `list_dir`, `read_file`, `write_file`, `rename_entry`, `delete_entry`, `path_exists` | Filesystem |
| `find_files`, `list_dir_tree` | Discovery |
| `grep_workspace` | Ripgrep search |
| `run_shell` | Shell command in workspace |
| `web_fetch` | HTTP GET with host allowlist + size cap |
| `git_*` | Git operations |
| `pty_create`, `pty_write`, `pty_resize`, `pty_close` | Terminal |
| `read_system_prompt`, `write_system_prompt` | `.tinyllama/prompt.md` |
| `read_project_state`, `write_project_state` | `.tinyllama/state.json` |
| `pick_workspace_folder`, `pick_icon_pack_folder` | Native dialogs |
| `open_settings_window` | Secondary settings webview |
| `icon_pack_get_dir`, `icon_pack_refresh_bundled` | Icon pack paths |

Frontend wrapper: `src/lib/ipc.ts` (lazy-loads Tauri API, provides typed functions).

---

## 12. Color & Theming Systems

Tiny Llama has **three largely independent color systems**:

1. **Workbench chrome** — CSS custom properties (sidebar, tabs, status bar, editor shell)
2. **Explorer file icons** — per-file-type colors (Seti font colors or colored SVGs)
3. **Editor syntax tokens** — CodeMirror default highlight style (not tied to workbench theme)

### Workbench theme (global UI colors)

**Token sources:**

| File | Role |
|------|------|
| `src/styles/globals.css` | Default `:root` / `.dark` tokens (Cursor Dark palette) |
| `src/styles/workbench-themes.css` | Alternate presets via `[data-workbench-theme="..."]` |
| `src/lib/workbench-theme.ts` | Preset registry + `applyWorkbenchTheme()` |
| `src/lib/themes/cursorDark.ts` | Documented reference export (not imported at runtime) |

**Available presets:** `cursor-dark` (default), `vscode-dark`, `catppuccin-mocha`, `tokyo-night`, `one-dark-pro`, `tiny-llama`, `dracula`, `github-dark`

**Application mechanism:**

```typescript
// workbench-theme.ts
applyWorkbenchTheme(id) {
  if (id === "cursor-dark") {
    document.documentElement.removeAttribute("data-workbench-theme");
  } else {
    document.documentElement.setAttribute("data-workbench-theme", id);
  }
}
```

Called from `WorkbenchShell.svelte` and settings window when `$settings.workbenchTheme` changes.

**Key CSS variables:**

| Variable group | Used by |
|----------------|---------|
| `--background`, `--foreground`, `--sidebar-*`, `--border` | Tailwind semantic colors, layout chrome |
| `--editor-bg`, `--editor-fg`, `--editor-gutter-fg`, `--editor-line-hl`, `--editor-selection` | CodeMirror editor chrome |
| `--terminal-ansi-*` | xterm.js theme in `TerminalPane.svelte` |
| `--workbench-tab-active-indicator` | Tab bar active indicator |

Tailwind maps tokens via `@theme inline` in `globals.css`. `ModeWatcher` adds `.dark` class to `<html>`.

**Persistence:** `settings.workbenchTheme` in `localStorage` (`tinyllama.settings.v3`).

---

## 13. File Icons Per File Type

Explorer icons are rendered by **`FileIcon.svelte`** (`src/lib/components/FileIcon.svelte`), used in `FileTreeRow.svelte`.

### Icon theme store

`src/lib/stores/iconTheme.ts`:

- Storage key: `tinyllama.iconTheme.v2`
- Default theme: **`seti`** (Cursor-style)
- Themes: `seti` | `vscode-icons` | `codicons` | `custom`

### Seti icons (default) — per-file color

**Resolution order** (`src/lib/icon-packs/resolveSeti.ts`):

1. `fileNames` exact match (e.g. `dockerfile`, `makefile`)
2. `fileExtensions` (e.g. `ts` → `_typescript`)
3. `languageIds` via `setiLanguageIdFromFileName()` (`src/lib/icon-packs/setiLanguage.ts`)
4. Default `file` icon

**Manifest:** `static/icon-packs/seti/manifest.json`

Each `iconDefinitions[id]` contains:

- `fontCharacter` — private-use escape (e.g. `\E099`)
- **`fontColor`** — hex color per icon (e.g. TypeScript `#519aba`)

**Rendering:** `<span class="seti-file-icon" style="color: {setiColor}">{glyph}</span>`

Font loaded via `@font-face` for `seti.woff` in `globals.css`.

**Note:** Seti **folders** still use codicons (`codicon-folder` / `codicon-folder-opened`), not Seti folder glyphs.

### VS Code Icons theme

- Resolution: `src/lib/icon-packs/resolve.ts` (fileNames → fileExtensions → default)
- Bundled SVGs: `static/icon-packs/vscode-icons/icons/`
- Colors are embedded in SVG assets, not applied via CSS
- Sync script: `npm run sync-icons`

### Codicons theme

- Single-tone VS Code icon font
- Coarse extension-based rules in `FileIcon.svelte` (`codicon-file-code`, `codicon-python`, etc.)

### Custom icon packs

User picks folder via Tauri dialog. Expects `manifest.json` or `icons.json` + `icons/` directory.

---

## 14. Editor Syntax Highlighting

### Language detection

`getLanguageFromPath()` in `src/lib/ipc.ts` maps file extensions to language IDs:

Supported in mapping: `typescript`, `javascript`, `json`, `markdown`, `rust`, `python`, `html`, `css`, plus `svelte`, `vue`, `go`, `java`, `c`, `cpp`, `shell`, `yaml`, `toml`, `sql`, etc.

Unmapped extensions → `"plaintext"`.

Stored on `OpenFile.language` when files are opened.

### CodeMirror setup

`src/lib/editor/loadCodeMirror.ts` lazy-loads CodeMirror once per session.

**Registered grammars** (language packs actually imported):

| Language ID | CodeMirror pack |
|-------------|-----------------|
| `javascript` | `@codemirror/lang-javascript` |
| `typescript` | `@codemirror/lang-javascript` (typescript: true) |
| `html` | `@codemirror/lang-html` |
| `css` | `@codemirror/lang-css` |
| `json` | `@codemirror/lang-json` |
| `markdown` | `@codemirror/lang-markdown` |
| `rust` | `@codemirror/lang-rust` |
| `python` | `@codemirror/lang-python` |

### Editor surface

`src/modules/editor/EditorSurface.svelte`:

- Picks `cm.languageExtensions[file.language]` if present; otherwise **no grammar** (plain text).
- **Gap:** `.svelte`, `.go`, `.yaml`, etc. get a language ID but no CodeMirror pack → no syntax highlighting.
- `editorTheme()` applies **chrome colors only** from CSS variables (`--editor-bg`, `--editor-fg`, gutters, selection, cursor).

### Syntax token colors

`basicSetup` from `codemirror` includes default `syntaxHighlighting` (CodeMirror's built-in token styles). There is **no custom `HighlightStyle`**, no link to workbench theme, and **no per-file-extension token palette**.

**Implication:** A TypeScript file shows a blue Seti icon in the explorer but keyword/string colors come from CodeMirror's fixed default palette—the same across all grammars. Changing workbench theme does not recolor syntax tokens.

### Editor state per file

`EditorSurface` keeps a `Map<path, EditorState>` so switching tabs preserves undo history and cursor position. Document changes update `files.updateFileContent()` and mark buffer dirty. Save writes via `writeFile()` IPC.

---

## 15. Git Integration

**Frontend:** `GitPanel.svelte`, `SourceControl.svelte` in explorer sidebar.

**Backend:** `src-tauri/src/modules/git.rs` using **git2**.

**Operations:**

- Current branch
- Status (staged/unstaged/untracked)
- Diff (workspace or per-file)
- Stage / unstage
- Commit
- Log (limited entries)

**Agent tools:** `get_git_status`, `get_git_log`, `get_git_diff` wrap the same backend via `toolRunner.ts`, formatting output for the model.

---

## 16. Terminal (PTY)

**Frontend:** `src/modules/terminal/TerminalPane.svelte`

- xterm.js with FitAddon
- Theme from CSS variables (`buildXtermTheme()` reads `--terminal-ansi-*`, `--editor-bg`, `--editor-fg`)
- Listens to `pty:data` / `pty:exit` Tauri events

**Backend:** `src-tauri/src/modules/pty.rs`

- `PtyManager` holds sessions keyed by UUID
- `pty_create(cwd?)` spawns shell in workspace or home
- `pty_write`, `pty_resize`, `pty_close`

**Tab integration:** Terminal tabs in workbench store reference `sessionId`. New terminal: `Alt+Shift+T` or status bar action → `ptyCreate()` → `workbench.addTerminalTab(id)`.

---

## 17. Settings & Persistence

### Global settings (`tinyllama.settings.v3`)

| Setting | Purpose |
|---------|---------|
| `chatBackend` | `anthropic` \| `ollama` \| `llamacpp` |
| `apiKeys.anthropic` | Claude API key |
| `ollamaEndpoint` / `llamacppEndpoint` | Local server URLs |
| `selectedModel` | Active model ID |
| `anthropicExtendedThinking` | Anthropic thinking stream flag |
| `workbenchTheme` | Color theme preset |
| `webFetchAllowedHosts` | Hostname allowlist for `web_fetch` tool |
| `anthropicContextBudget` | Optional context limit hint |

Settings UI: `SettingsPane.svelte` (in-app modal or separate Tauri window via `settings.html` MPA).

### Other localStorage keys

| Key | Content |
|-----|---------|
| `tinyllama.toolPolicy.v2` | Global tool rules |
| `tinyllama.iconTheme.v2` | Icon pack selection |
| `tinyllama.paneWidths.v1` | Chat/explorer/bottom pane sizes |

### Secrets

Documented in `docs/SECRETS.md`. API keys stored in localStorage (desktop app context).

---

## 18. Keyboard Shortcuts

Handled by `src/modules/shortcuts/dispatcher.ts` (registered on `WorkbenchShell`).

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd+,` | Open settings |
| `Ctrl/Cmd+W` | Close active workbench tab |
| `Ctrl/Cmd+B` | Toggle chat pane |
| `Ctrl/Cmd+Shift+E` | Toggle explorer |
| `Ctrl/Cmd+J` | Toggle bottom dock |
| `Alt+Shift+T` | New terminal tab |
| `Alt+Shift+P` | New preview tab |
| `Alt+Shift+X` | Close all workbench tabs |

Shortcuts ignored when focus is in input, textarea, CodeMirror, or xterm.

---

## 19. Testing Strategy

**Runner:** Vitest (`npm test`)

**Unit tests** (`tests/unit/`):

- `toolRunner.test.ts` — tool dispatch and path handling
- `toolPolicy.test.ts` — policy merge and rules
- `iconTheme.test.ts`, `resolveSeti.test.ts` — icon resolution
- `providerHealth.test.ts` — backend connectivity checks

**Integration:** `tests/integration/ollama.test.ts` (optional, `npm run test:ollama` with `RUN_OLLAMA_TESTS=1`)

See `tests/README.md` for tool policy testing notes.

---

## 20. Extension Points & Known Limits

### Extension points

| Area | How to extend |
|------|---------------|
| New LLM provider | Add provider in `src/lib/providers/`, wire in `streamTurn.ts` and settings |
| New built-in tool | Add schema in `toolDefinitions.ts`, handler in `toolRunner.ts`, Rust command if needed |
| Custom tools | Define in Settings or `.tinyllama/tools.json` (schema only until handler added) |
| Workbench theme | Add preset to `workbench-themes.css` + `WORKBENCH_THEME_OPTIONS` |
| Icon pack | Bundle under `static/icon-packs/` or user custom folder |
| CodeMirror language | Import pack in `loadCodeMirror.ts`, map in `getLanguageFromPath()` |

### Known limits

- **12 agent steps** per user message
- **Sequential tool execution** only (no parallel batching)
- **Custom tools** not executable without new handlers
- **Tools require Tauri** — plain Vite dev mode cannot run agent tools
- **Syntax highlighting** limited to 8 CodeMirror grammars despite broader extension mapping
- **Syntax colors** not tied to workbench theme
- **Simple gitignore** filtering in explorer (not full gitignore semantics)
- **README sidecar references** are legacy; current architecture uses direct provider fetch

---

## 21. Directory Map

```
tiny-llama/
├── ARCHITECTURE.md          ← this document
├── OVERVIEW.md              ← shorter summary
├── index.html / settings.html
├── src/
│   ├── App.svelte
│   ├── main.ts / settings-main.ts
│   ├── modules/
│   │   ├── agent/           ChatPane, ChatTabBar
│   │   ├── workbench/       WorkbenchShell, CenterWorkbench, tabs, status bar
│   │   ├── explorer/        File tree, search, git panels
│   │   ├── editor/          EditorSurface (CodeMirror)
│   │   ├── terminal/        TerminalPane (xterm)
│   │   ├── settings/        SettingsPane
│   │   └── shortcuts/       Keyboard dispatcher
│   ├── lib/
│   │   ├── agent/           conversation, streamTurn, workspaceContext
│   │   ├── providers/       openaiCompat, anthropic
│   │   ├── tools/           toolDefinitions, toolRunner, pathUtils
│   │   ├── stores/          chat, files, workbench, settings, toolPolicy, mode, iconTheme
│   │   ├── icon-packs/      Seti/VSCode icon resolution
│   │   ├── editor/          loadCodeMirror
│   │   ├── components/      FileIcon, ui primitives
│   │   ├── ipc.ts           Tauri invoke wrappers
│   │   ├── projectState.ts  Workspace persistence
│   │   ├── filesystemSync.ts
│   │   ├── toolPolicy.ts
│   │   └── workbench-theme.ts
│   └── styles/
│       ├── globals.css
│       └── workbench-themes.css
├── static/icon-packs/       Bundled Seti + vscode-icons assets
├── src-tauri/src/
│   ├── main.rs
│   └── modules/             filesystem, git, pty, commands, icon_pack, watcher
└── tests/unit/              Vitest unit tests
```

---

## Quick Reference: Tool Chain vs Colors

| Concern | Mechanism | Per file type? |
|---------|-----------|----------------|
| Agent tool chains | Up to 12 turns; sequential tools per turn; results in provider context | N/A |
| Explorer icon color | Seti `fontColor` or SVG asset | **Yes** |
| Editor background/text | Workbench CSS variables | No (global) |
| Syntax keyword/string colors | CodeMirror default highlight | By token role, not extension |
| Terminal colors | `--terminal-ansi-*` from theme | No (global) |

---

*Generated for architecture review. For a shorter summary, see [OVERVIEW.md](./OVERVIEW.md). For setup and development commands, see [README.md](./README.md).*
