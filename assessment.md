# Tiny Llama — Application Assessment

> **Purpose:** A detailed technical assessment of the Tiny Llama codebase — what it is, how it is structured, and how every major subsystem fits together.  
> **Audience:** Developers onboarding to the project, reviewers, or anyone evaluating the architecture.  
> **Last updated:** May 2026 (reflects current implementation on `main`).

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Technology stack](#2-technology-stack)
3. [Repository layout](#3-repository-layout)
4. [Runtime architecture](#4-runtime-architecture)
5. [Application bootstrap](#5-application-bootstrap)
6. [Workbench UI](#6-workbench-ui)
7. [State management](#7-state-management)
8. [AI chat & agent subsystem](#8-ai-chat--agent-subsystem)
9. [LLM providers](#9-llm-providers)
10. [Tool system](#10-tool-system)
11. [IPC layer & Tauri backend](#11-ipc-layer--tauri-backend)
12. [Persistence & configuration](#12-persistence--configuration)
13. [Git integration](#13-git-integration)
14. [Editor, terminal & preview](#14-editor-terminal--preview)
15. [Theming & appearance](#15-theming--appearance)
16. [System prompts](#16-system-prompts)
17. [Settings](#17-settings)
18. [Keyboard shortcuts](#18-keyboard-shortcuts)
19. [Build, dev & deployment](#19-build-dev--deployment)
20. [Testing](#20-testing)
21. [Security model](#21-security-model)
22. [Known gaps & partial features](#22-known-gaps--partial-features)
23. [Extension points](#23-extension-points)

---

## 1. Executive summary

**Tiny Llama** is a local-first desktop IDE with an integrated AI coding agent. It targets developers who want a hackable, Cursor-like workbench without mandatory cloud lock-in: bring your own model (Ollama, llama.cpp, Anthropic, or DeepSeek) and keep code on disk under normal git workflows.

### Core design principles

| Principle | Implementation |
|-----------|----------------|
| **Local-first** | Files live on disk; agent writes through Rust commands; changes appear in Git for review |
| **No Node sidecar at runtime** | Agent loop and LLM HTTP calls run in the webview; only Rust handles OS integration |
| **Bring your own model (BYOM)** | Four backends, user-supplied API keys or local endpoints |
| **Trust through git** | Staged/unstaged diffs, discard, checkpoints for chat rewind |
| **Policy-gated tools** | Each tool can be allow / ask / deny; project overrides in `.tinyllama/tools.json` |

### What works today

- Multi-tab workbench: chat, CodeMirror editor, xterm terminal, HTML preview
- Three chat modes: **Chat** (no tools), **Plan** (read-only tools), **Agent** (all tools)
- 16 built-in agent tools (read, write, grep, git, shell, web fetch, etc.)
- Four LLM backends with streaming, native tool calls, and text-tool fallback
- Experimental context compaction (manual + auto before agent turns)
- Multi-file system prompts (`.tinyllama/prompts/`)
- Per-project autosaved state (chat sessions + editor tabs)
- Frameless Tauri window with custom titlebar controls

### What requires the desktop app

Opening `http://localhost:14200` in a browser (`pnpm dev`) loads the UI for frontend work, but **filesystem, git, shell, PTY, and tool execution require Tauri** (`pnpm tauri dev`). Without Tauri, the workbench renders but cannot open folders or run the agent against real files.

---

## 2. Technology stack

### Frontend (webview)

| Layer | Technology | Version / notes |
|-------|------------|-----------------|
| Framework | Svelte 5 | Runes (`$state`, `$derived`, `$effect`), `mount()` API |
| Build | Vite 6 | MPA: `index.html` + `settings.html` |
| Styling | Tailwind CSS 4 | `@tailwindcss/vite`; workbench CSS variables |
| UI primitives | bits-ui, shadcn-svelte patterns | Dialog, tabs, select, dropdown, tooltip |
| Editor | CodeMirror 6 | Lazy-loaded language packs, diff decorations |
| Terminal | xterm.js + FitAddon | Theme from CSS custom properties |
| Icons | phosphor-svelte, @vscode/codicons, Seti, bundled VS Code icons | |
| Markdown | marked | Chat message rendering |
| Toasts | svelte-sonner | |
| Dark/light | mode-watcher | |

### Backend (native)

| Layer | Technology | Role |
|-------|------------|------|
| Shell | Tauri 2 | Webview host, IPC, window management |
| Language | Rust | Filesystem, git, grep, shell, PTY, HTTP fetch |
| Git | git2 | Status, diff, stage, commit, checkpoints |
| PTY | portable-pty | Native terminal sessions |
| Search | ripgrep (`rg`) | Workspace grep tool |
| Plugins | tauri-plugin-shell | Open external URLs |

### Dev tooling

| Tool | Role |
|------|------|
| pnpm | Package manager (`packageManager` pinned in `package.json`) |
| Vitest | Unit tests (~285+ tests) |
| TypeScript 5 | Frontend typing |
| Tauri CLI | `pnpm tauri dev` / `pnpm tauri build` |

---

## 3. Repository layout

```
tiny-llama/
├── index.html              # Main workbench entry
├── settings.html           # Settings popout window entry
├── src/
│   ├── main.ts             # Main bootstrap
│   ├── settings-main.ts    # Settings window bootstrap
│   ├── App.svelte          # Root → WorkbenchShell
│   ├── modules/            # Feature UI (workbench panes)
│   ├── lib/                # Shared logic, stores, providers, tools
│   └── styles/             # Global CSS, themes, syntax
├── src-tauri/
│   └── src/
│       ├── main.rs         # Tauri entry, command registration
│       └── modules/        # Rust: commands, fs, git, pty, icons
├── static/                 # Public assets (icon packs)
├── icons/                  # App UI SVG icons
├── docs/                   # Architecture, overview, numbered specs
├── tests/                  # Vitest unit + integration
├── scripts/                # Dev helpers (free port, icon sync, Ollama pull)
├── vite.config.ts
├── vitest.config.ts
├── package.json
└── assessment.md           # This document
```

### `src/modules/` — feature UI

| Directory | Responsibility |
|-----------|----------------|
| `workbench/` | Shell layout, tab bars, center area, status bar, bottom dock, window controls |
| `agent/` | Chat pane, chat tabs, composer, agent loop UI, tool cards, activity feed |
| `explorer/` | File tree, git panel, prompt panel, right sidebar |
| `editor/` | CodeMirror surface per editor tab |
| `terminal/` | xterm.js PTY pane |
| `preview/` | Localhost iframe preview |
| `settings/` | Settings pane (modal + popout), provider guides |
| `shortcuts/` | Keyboard shortcut registry and dispatcher |
| `feedback/` | In-app feedback dialog |

### `src/lib/` — shared logic

| Directory | Responsibility |
|-----------|----------------|
| `stores/` | Svelte writable/derived stores (chat, files, settings, …) |
| `agent/` | Stream turn, conversation shaping, compaction, synthesis, rewind |
| `providers/` | Anthropic, DeepSeek, OpenAI-compat (Ollama, llama.cpp) |
| `tools/` | Tool definitions, runner, path utils, git formatting |
| `editor/` | CodeMirror loader, syntax colors, diff decorations, format |
| `systemPrompts/` | Multi-file prompt types, config, workspace I/O |
| `icon-packs/` | Seti / VS Code icon resolution |
| `components/` | Reusable UI (FileIcon, ToolCallCard, SystemPromptsManager, …) |
| `components/ui/` | shadcn-style primitives (button, dialog, tabs, …) |

### `src-tauri/src/modules/` — Rust backend

| Module | File | Role |
|--------|------|------|
| `commands` | `commands.rs` | Tauri command wrappers, settings window, grep spawn |
| `filesystem` | `filesystem.rs` | Read/write/list/find/tree, web_fetch with host allowlist |
| `git` | `git.rs` | Full git2 integration + checkpoint/restore |
| `pty` | `pty.rs` | Create/write/resize/close PTY; emit `pty:data` / `pty:exit` |
| `icon_pack` | `icon_pack.rs` | Bundled and custom icon pack directories |
| `watcher` | `watcher.rs` | Filesystem watching infrastructure (**not wired to UI**) |

---

## 4. Runtime architecture

Tiny Llama is a **two-layer** application: a Svelte webview and a Rust native host connected by Tauri IPC.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Tauri 2 Desktop Process                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                     Webview (Chromium)                           │  │
│  │  WorkbenchShell → ChatPane / Editor / Terminal / Explorer         │  │
│  │       │                                                            │  │
│  │       ├── lib/providers/*.ts  ──HTTP fetch──►  LLM APIs           │  │
│  │       │         (Anthropic, DeepSeek, Ollama, llama.cpp)           │  │
│  │       │                                                            │  │
│  │       └── lib/tools/toolRunner.ts ──invoke──►  lib/ipc.ts         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                              │ Tauri IPC (invoke + events)               │
│  ┌───────────────────────────▼───────────────────────────────────────┐  │
│  │                     Rust (src-tauri)                               │  │
│  │  filesystem · git (git2) · grep (rg) · run_shell · web_fetch      │  │
│  │  PTY (portable-pty) · icon packs · project state files              │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Critical boundary: what runs where

| Concern | Layer | Why |
|---------|-------|-----|
| LLM streaming | Webview | Direct `fetch()` to provider APIs; no Rust proxy |
| Tool execution | Webview → Rust | `toolRunner` calls `ipc.ts` → Tauri `invoke` |
| File I/O | Rust | Sandboxed workspace paths, consistent with git |
| Git operations | Rust | git2 crate, checkpoint refs for rewind |
| Terminal | Rust PTY + webview xterm | Bytes flow via Tauri events |
| Settings / theme | Webview localStorage | Global prefs never touch disk via Rust |
| Project state | Rust (or memory fallback) | `.tinyllama/state.json` on workspace open |

### Agent turn data flow

```
User sends message (ChatPane)
  │
  ├─► buildSystemPrompt(mode + workspace context + system prompts)
  ├─► maybeAutoCompactBeforeTurn()          [if compaction enabled]
  │
  └─► loop (until model stops or limits hit):
        streamOneTurn()                     [providers/*.ts, SSE]
          ├─ text deltas → chat store
          ├─ thinking deltas (Anthropic)
          └─ tool_call events
        executeToolCallsWithApproval()
          ├─ policy: allow | ask (UI) | deny
          └─ executeTool() → ipc → Rust
        append tool results to message history
  │
  ├─► optional synthesis pass               [synthesis.ts]
  ├─► filesystemSync()                      [refresh explorer + editor tabs]
  ├─► bumpGitRefresh()
  └─► persistCurrentProjectState()            [debounced autosave]
```

There is **no Node.js process** at runtime. Node is used only during `pnpm dev`, `pnpm build`, and `pnpm test`.

---

## 5. Application bootstrap

### Main window

```
index.html
  └── /src/main.ts
        ├── imports: globals.css, editor-syntax.css, workbench-themes.css, codicons
        └── mount(App, { target: #app })
              └── App.svelte
                    └── WorkbenchShell.svelte
```

**`src/main.ts`** uses Svelte 5's `mount()` (not the legacy `new App()` constructor).

**`WorkbenchShell.svelte`** is the real application root. On mount it initializes:

1. `applyWorkbenchTheme($settings.workbenchTheme)` — sets `data-workbench-theme` on `<html>`
2. `iconTheme.init()` — loads Seti/VS Code/codicons manifest
3. `syntaxTheme.init()`, `editorChrome.init()`, `explorerAppearance.init()`, `chatAppearance.init()`
4. `initProjectStateAutosave()` — debounced writes to `.tinyllama/state.json`
5. Global `keydown` → `dispatchWorkbenchShortcut()`
6. `beforeunload` → `persistCurrentProjectState()`

It also renders ambient UI: `ModeWatcher`, `Toaster`, modal `SettingsPane`, `FeedbackDialog`.

### Settings popout window

```
settings.html
  └── /src/settings-main.ts
        └── SettingsWindowRoot.svelte
              └── SettingsPane variant="page"
```

Tauri command `open_settings_window` creates or focuses a secondary webview labeled `"settings"` loading `settings.html`. This is a **multi-page app (MPA)** pattern — settings is not a route inside the main SPA.

### Tauri entry

**`src-tauri/src/main.rs`**:

- Registers `tauri_plugin_shell`
- Manages `PtyManager` as Tauri state
- Registers ~35 `invoke` handlers
- In debug builds, opens devtools on the main window automatically

---

## 6. Workbench UI

### Layout diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Titlebar: "Tiny Llama" (drag region)              [─ □ ✕] WindowControls │
├──────────────────────────────────────────────────────────────────────────┤
│ Tab strip:  [Chat tabs …]  |  [Editor / Terminal / Preview tabs …]       │
├────────────────┬─────────────────────────────────────┬───────────────────┤
│                │                                     │                   │
│   ChatPane     │         CenterWorkbench             │   RightSidebar    │
│                │   ┌─────────────────────────────┐   │   ┌─────────────┐ │
│  · messages    │   │ EditorSurface / Terminal /  │   │   │ FileTree    │ │
│  · tool cards  │   │ PreviewPane (active tab)    │   │   │ GitPanel    │ │
│  · composer    │   └─────────────────────────────┘   │   │ PromptPanel │ │
│  · context     │   ┌─────────────────────────────┐   │   └─────────────┘ │
│    meter       │   │ BottomDock (optional)       │   │                   │
│                │   │ terminal / debug / serial   │   │                   │
│                │   └─────────────────────────────┘   │                   │
├────────────────┴─────────────────────────────────────┴───────────────────┤
│ StatusBar: pane toggles · explorer tabs · git branch · model · settings  │
└──────────────────────────────────────────────────────────────────────────┘
```

### Pane components

| Component | File | Role |
|-----------|------|------|
| Shell | `WorkbenchShell.svelte` | Grid layout, resize handles, panel visibility |
| Chat | `ChatPane.svelte` | Messages, composer, agent loop, model picker, compaction |
| Chat tabs | `ChatTabBar.svelte` | Multi-session tabs + history |
| Center | `CenterWorkbench.svelte` | Switches active editor/terminal/preview tab |
| Workbench tabs | `WorkbenchTabBar.svelte` | Editor/terminal/preview tab strip |
| Bottom dock | `BottomDock.svelte` | Optional lower terminal area |
| Right sidebar | `RightSidebar.svelte` | Hosts explorer/git/prompt panels |
| File tree | `FileTree.svelte`, `FileTreeRow.svelte` | Workspace tree with git decorations |
| Git | `GitPanel.svelte` | Status, stage, commit, diff navigation |
| Prompts | `PromptPanel.svelte` | System prompts sidebar (wraps `SystemPromptsManager`) |
| Status bar | `StatusBar.svelte` | Model indicator, context usage, toggles |
| Window controls | `WindowControls.svelte` | Minimize/maximize/close (Tauri only) |

### Resizable panes

Pane widths persist in **localStorage** key `tinyllama.paneWidths.v1`:

| Edge | Min | Max | Default |
|------|-----|-----|---------|
| Left (chat) | 200px | 560px | 320px |
| Right (explorer) | 200px | min(560px, 45% viewport) | 280px |
| Bottom dock | 120px | min(560px, 55% viewport) | 220px |

### Workbench tab types

Defined in `src/lib/stores/workbench.ts`:

| Kind | Content | Created by |
|------|---------|------------|
| `editor` | CodeMirror tab for a file path | Open from explorer, agent, git |
| `terminal` | xterm PTY session | Status bar, shortcut, `ptyCreate` |
| `preview` | iframe to localhost URL | Workbench action |

### Explorer sidebar tabs

`src/lib/explorerPanel.ts` defines: `files`, `git`, `prompt`. The status bar activity icons toggle which panel is visible in the right sidebar.

### Unwired UI

- **`SearchPanel.svelte`** exists but is not imported anywhere (search is a TODO).
- **Bottom dock Debug/Serial tabs** are placeholders.

---

## 7. State management

All application state flows through Svelte stores in `src/lib/stores/`. Components subscribe with `$store` syntax or `get()` for one-shot reads inside async functions.

### Core stores

#### `chat` (`chat.ts`)

The largest store. Manages:

- **Sessions** — multiple chat tabs per project (`id`, `title`, `messages`, `updatedAt`)
- **History** — closed sessions available in history picker
- **Active session** — derived from `activeSessionId`
- **Streaming state** — `isStreaming`, partial content, thinking text
- **Tool call UI** — pending approvals, tool result cards
- **Compaction metadata** — `compactedAt`, `compactionCount` per session
- **Message types** — user, assistant, tool, system, agent-turn groupings

Persisted in `.tinyllama/state.json` via `projectState.ts`.

#### `files` (`files.ts`)

- `workspacePath` — root folder (null until user opens folder)
- `tree` — nested `FileEntry[]` from Rust `list_dir` / tree builder
- `openFiles` — map of path → `{ content, dirty, diffBase?, … }`
- `activeFilePath` — which file the editor shows

Runtime only (file contents re-read from disk on open).

#### `workbench` (`workbench.ts`)

- `tabs` — editor / terminal / preview tab list
- `activeTabId`
- Methods: `openEditorTab`, `addTerminalTab`, `addPreviewTab`, `closeTab`, `hydrateFromProjectState`

Editor tab list persisted in project state; terminal/preview tabs are session-only.

#### `settings` (`settings.ts`)

Global preferences in localStorage key `tinyllama.settings.v3`:

| Category | Fields (representative) |
|----------|-------------------------|
| Providers | `chatBackend`, API keys, endpoints, model arrays per backend |
| Models | `selectedModel`, `showInPicker`, context windows |
| Agent | `agentLimits` (max steps, tools per turn, etc.) |
| Compaction | `agentCompaction` (enable, auto, threshold, keep recent, model override) |
| Editor | word wrap, format-on-save, uniform tab width |
| Theme | `workbenchTheme` |
| Network | `webFetchAllowedHosts` |
| Roles | `modelRoles` (chat / compaction / autocomplete overrides) |
| Server templates | Ollama / llama.cpp launch command templates |

Env var merge: `envApiKeys.ts` + Vite `define` injects `__TINYLLAMA_ENV_*_API_KEY__` at build time.

#### `toolPolicy` (`toolPolicy.ts`)

- Global tool rules: `allow` | `ask` | `deny` per built-in tool
- Custom tool definitions (name, description, JSON schema)
- **`effectiveToolPolicy`** (derived) — merges global policy with `.tinyllama/tools.json` project layer via `projectTools.ts`

Persisted: `tinyllama.toolPolicy.v2`.

#### `currentMode` (`mode.ts`)

Runtime chat mode: `chat` | `plan` | `agent`. See [§8](#8-ai-chat--agent-subsystem).

#### `systemPrompts` (`systemPrompts.ts`)

Multi-file prompt manifest + cached file contents. See [§16](#16-system-prompts).

Derived: **`activeSystemPromptText`** — enabled prompts matching current mode, concatenated.

### Appearance stores

| Store | File | Persists | Controls |
|-------|------|----------|----------|
| `iconTheme` | `iconTheme.ts` | localStorage v2 | Seti / vscode-icons / codicons / custom pack path |
| `syntaxTheme` | `syntaxTheme.ts` | localStorage | CodeMirror token colors (`--syntax-*`) |
| `editorChrome` | `editorChrome.ts` | localStorage | Editor bg, gutter, cursor, selection |
| `explorerAppearance` | `explorerAppearance.ts` | localStorage | Panel colors, font size, git decoration colors |
| `chatAppearance` | `chatAppearance.ts` | localStorage | Chat colors, waiting animation style |

### Auxiliary stores

| Store | Role |
|-------|------|
| `backendStatus` | Polled provider health for status bar dot |
| `providerUsage` | Anthropic monthly token totals |
| `gitRefresh` | Counter bump → GitPanel re-fetches |
| `editorErrorCountsByRel` | Per-file error counts (future LSP hook) |

### Cross-store orchestration

| Module | Coordinates |
|--------|-------------|
| `projectState.ts` | Snapshots `chat` + `workbench` editor tabs → `.tinyllama/state.json` |
| `filesystemSync.ts` | After agent mutations, refreshes `files` tree and open editor buffers |
| `workspace.ts` | `applyWorkspaceFolder()` — sets workspace, loads tree, project state, prompts, tools |

---

## 8. AI chat & agent subsystem

The agent lives primarily in **`ChatPane.svelte`** with supporting modules under **`src/lib/agent/`**.

### Chat modes

Defined in `src/lib/stores/mode.ts`:

| Mode | Tools available | Base system prompt intent |
|------|-----------------|---------------------------|
| **chat** | None (`[]`) | General Q&A, no filesystem access |
| **plan** | 9 read-only tools | Analyze and recommend without writes |
| **agent** | All 16 tools | Full read/write/exec implementation |

**Effective tools** sent to the model:

```
modeTools ∩ policyAllowedTools \ deniedTools
```

If the intersection is empty in plan/agent mode, the UI warns and may block sending.

### System prompt assembly

`ChatPane.buildSystemPrompt()` concatenates:

1. **`MODE_CONFIG[mode].basePrompt`** — mode-specific instructions
2. **`buildWorkspaceContextBlock()`** — workspace path, optional tree snippet (`workspaceContext.ts`)
3. **`TOOL_USE_INSTRUCTION`** — when tools are enabled (format, parallel calls, path rules)
4. **`TOOL_SUMMARY_INSTRUCTION`** — asks model to summarize after tool rounds
5. **`activeSystemPromptText`** — combined `.tinyllama/prompts/*.md` for current mode

### Single turn streaming — `streamTurn.ts`

**`streamOneTurn()`** is the unified entry for one model round:

| Backend | Client | Protocol |
|---------|--------|----------|
| `anthropic` | `providers/anthropic.ts` | Messages API SSE, extended thinking, tool_use blocks |
| `deepseek` | `providers/deepseek.ts` | OpenAI-compat at `api.deepseek.com` |
| `ollama` | `providers/openaiCompat.ts` | `POST /v1/chat/completions` SSE |
| `llamacpp` | `providers/openaiCompat.ts` | Same OpenAI-compat |

Returns: `{ content, thinking, toolCalls, usage }`.

Callbacks stream deltas into the chat store for live UI updates.

**`resolveStreamCredentials()`** maps backend → API key + base URL from settings.

### Multi-turn agent loop

After each `streamOneTurn()`:

1. If tool calls present → **`executeToolCallsWithApproval()`**
2. Policy gate per tool (allow runs immediately; ask shows approval chip; deny returns error to model)
3. Limits enforced: `maxAgentSteps`, `maxToolCallsPerRun`, `maxToolsPerTurn` (`agentLimits.ts`)
4. Context budget checked (`contextBudget.ts`, `chatContext.ts`) — may stop loop early
5. Tool results appended via **`buildProviderMessages()`** (`conversation.ts`)
6. Loop continues until model returns no tools, user stops, or limit hit

### Text tool fallback — `textToolCalls.ts`

Some local models lack native function calling. The parser extracts JSON or markdown fenced tool calls from plain text and converts them to `StoredToolCall` objects so the same execution path runs.

### Synthesis pass — `synthesis.ts`

If the model stops after a tool-only round without a user-facing summary, an optional extra turn nudges the model to explain what it did.

### Activity & status UX

| Module | Role |
|--------|------|
| `activity.ts` | Whimsical labels during tool execution |
| `streamingStatusWord.ts` | Rotating status word while streaming |
| `toolDisplay.ts` | Human-readable tool card labels, path extraction |

### Chat rewind — `chatRewind.ts`

Restores conversation to a prior point using git checkpoints:

1. `git_create_checkpoint` before risky agent work
2. On rewind: `git_restore_checkpoint` + truncate message history in chat store

### Context compaction (experimental)

| File | Role |
|------|------|
| `agentCompaction.ts` | Settings types, thresholds, normalization |
| `compactHistory.ts` | Slice history, build summary prompt, produce synthetic user/assistant pair |
| `sessionCompaction.ts` | `compactChatSession()`, `maybeAutoCompactBeforeTurn()` |
| `compactionModel.ts` | Resolve model for summaries (active chat model or override) |

**Strategy:**

1. Take first user message + last 20 messages (configurable slice logic in `compactHistory.ts`)
2. Call summary model with compaction prompt
3. Replace compacted range with one synthetic exchange
4. Keep last N raw turns (`compactKeepRecentTurns`, default 6)
5. Record `compactedAt` and increment `compactionCount` on session

**Triggers:**

- Manual: footer button in ChatPane
- Auto: before agent turn when enabled and context usage exceeds threshold %

Settings: **Experimental → Compaction** in SettingsPane.

---

## 9. LLM providers

All provider code lives in **`src/lib/providers/`**. Every call is **`fetch()` from the webview** — Rust does not proxy LLM traffic.

### Provider summary

| Backend | Default endpoint | Auth | Special features |
|---------|------------------|------|------------------|
| **Ollama** | `http://localhost:11434` | Optional API key header | `num_ctx`, model list via `/api/tags`, pull/delete helpers |
| **llama.cpp server** | `http://localhost:8080` | Optional Bearer token | Server template in settings, health probe |
| **Anthropic** | `api.anthropic.com` | `x-api-key` | Extended thinking, native tool_use, usage tracking |
| **DeepSeek** | `api.deepseek.com` | Bearer token | OpenAI-compat chat completions |

### Supporting modules

| Module | Role |
|--------|------|
| `openaiCompat.ts` | Shared SSE parser, tool call delta assembly, `fetchModels` |
| `ollamaClient.ts` | Ollama-specific endpoints (tags, pull, delete) |
| `llamaCppClient.ts` | llama.cpp server discovery |
| `inferenceOptions.ts` | Temperature, max tokens, Ollama `num_ctx`, think flag |
| `modelPicker.ts` | Filter models with `showInPicker` |
| `modelRoles.ts` | Override which model handles chat vs compaction vs autocomplete |
| `providerHealth.ts` | HTTP probes for status bar green/yellow/red |
| `cloudModelCatalog.ts` | Anthropic/DeepSeek model seed lists + catalog fetch |
| `envApiKeys.ts` | Merge `.env` keys into settings on load |

### Model selection UX

ChatPane model menu groups by provider. A provider section appears only when:

- **Ollama:** server reachable + at least one model enabled in picker
- **llama.cpp:** server reachable + models loaded
- **Anthropic / DeepSeek:** valid API key + successful catalog fetch

Settings allows per-model **“show in chat picker”** checkboxes for Ollama and cloud providers.

---

## 10. Tool system

### Built-in tools (16)

Defined in **`src/lib/tools/toolDefinitions.ts`**:

**Read / discovery (Plan mode + Agent):**

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents |
| `list_dir` | List directory entries |
| `grep` | Ripgrep search (max 500 matches) |
| `find_file` | Find files by glob/substring |
| `get_file_tree` | Nested directory tree |
| `get_git_status` | Changed/staged/untracked files |
| `get_git_log` | Recent commits |
| `get_git_diff` | Diff against HEAD |
| `web_fetch` | HTTP GET (hostname allowlist) |

**Write / execute (Agent only):**

| Tool | Description |
|------|-------------|
| `write_file` | Write or overwrite file |
| `create_file` | Create new file (fail if exists) |
| `delete_file` | Delete file or directory recursively |
| `move_file` | Rename/move |
| `run_shell` | Execute shell command in workspace |
| `run_tests` | Run test command (convenience wrapper) |
| `run_script` | Run npm/pnpm script by name |

### Execution path

```
Model emits tool_call
  → StoredToolCall in chat store
  → executeToolCallsWithApproval (ChatPane)
  → executeTool (toolRunner.ts)
  → TOOL_HANDLERS[name](args, context)
  → ipc.ts invoke → Rust command
  → result string → tool message in history
```

**`toolRunner.ts`** checks `isTauriAvailable()` — browser-only dev returns a clear error.

### Path sandboxing

**`src/lib/tools/pathUtils.ts`** resolves workspace-relative paths, normalizes separators, and rejects `..` traversal outside the workspace root.

### Tool policy

Default **ask** (requires user approval) for destructive or risky tools:

- `move_file`, `delete_file`, `run_shell`, `run_tests`, `run_script`, `web_fetch`

User can override globally in Settings → Tools, or per-project in **`.tinyllama/tools.json`**.

### Custom tools

Settings allows defining custom tools (name, description, JSON schema). They appear in policy and can be sent to the model, but **`TOOL_HANDLERS` must have a matching handler** for execution — custom tools are primarily schema/policy placeholders unless wired.

### Git output formatting

**`gitFormat.ts`** formats git status/log/diff output into concise strings for model consumption.

---

## 11. IPC layer & Tauri backend

### IPC facade — `src/lib/ipc.ts`

**Tauri detection:** checks `window.__TAURI__` or `window.__TAURI_INTERNALS__` (set when `withGlobalTauri: true` in `tauri.conf.json`).

**Lazy loading:** `@tauri-apps/api/core` and `event` are dynamically imported on first invoke to avoid breaking pure web dev builds.

**`ensureTauriApi()`** rejects with a helpful message if invoked without Tauri.

### Tauri commands (complete list)

Registered in **`src-tauri/src/main.rs`**:

| Category | Command | Rust module |
|----------|---------|-------------|
| **Filesystem** | `list_dir`, `read_file`, `write_file`, `rename_entry`, `delete_entry`, `path_exists` | filesystem |
| **Discovery** | `find_files`, `list_dir_tree`, `grep_workspace` | filesystem / commands |
| **Shell** | `run_shell` | commands |
| **Network** | `web_fetch` | filesystem (host allowlist enforced) |
| **Git** | `git_current_branch`, `git_status`, `git_diff`, `git_stage`, `git_unstage`, `git_commit`, `git_log`, `git_file_at_head`, `git_discard`, `git_create_checkpoint`, `git_restore_checkpoint`, `git_is_repo` | git |
| **Terminal** | `pty_create`, `pty_write`, `pty_resize`, `pty_close` | pty |
| **Project** | `read_project_state`, `write_project_state`, `read_system_prompt`, `write_system_prompt`, `ensure_system_prompts_layout` | commands / filesystem |
| **Workspace** | `get_workspace_path`, `pick_workspace_folder` | commands |
| **Window** | `open_settings_window` | commands |
| **Icons** | `icon_pack_get_dir`, `icon_pack_refresh_bundled`, `pick_icon_pack_folder` | icon_pack |

### Tauri events

| Event | Direction | Payload |
|-------|-----------|---------|
| `pty:data` | Rust → webview | Terminal output bytes |
| `pty:exit` | Rust → webview | PTY session ended |

### Web-only behavior (`pnpm dev`)

| Feature | Behavior without Tauri |
|---------|--------------------------|
| Workbench UI | Renders fully |
| Open folder | Toast error — requires desktop |
| Tool execution | Fails with explicit message |
| Terminal | Unavailable |
| Git panel | Empty / error on fetch |
| Project state | In-memory fallback per workspace path |
| `openExternalUrl` | Falls back to `window.location.href` |

### Dev workspace override

Rust reads optional **`~/.config/tiny-llama/workspace_root.txt`** to pin a workspace path for development/testing without using the folder picker every launch.

---

## 12. Persistence & configuration

### Global (localStorage)

| Key | Content |
|-----|---------|
| `tinyllama.settings.v3` | All settings (providers, themes, limits, compaction, …) |
| `tinyllama.toolPolicy.v2` | Global tool allow/ask/deny + custom tools |
| `tinyllama.iconTheme.v2` | Icon theme id + custom pack path |
| `tinyllama.paneWidths.v1` | Left/right/bottom pane dimensions |
| Syntax/editor/explorer/chat appearance keys | Per-store localStorage in respective modules |
| `tinyllama.providerUsage.v1` | Anthropic token usage totals |

API keys are stored in localStorage (not OS keychain) with optional env override at build/dev time.

### Per-project (`.tinyllama/` directory)

Created when user initializes project features or on first agent use:

| Path | Purpose |
|------|---------|
| `.tinyllama/state.json` | Chat sessions, history, open editor tabs (version 1) |
| `.tinyllama/prompts.json` | System prompt manifest (entries, enabled flags, modes) |
| `.tinyllama/prompts/*.md` | Individual prompt files (chat, plan, agent, custom) |
| `.tinyllama/tools.json` | Project tool policy overrides + custom tool schemas |
| `.tinyllama/prompt.md` | **Legacy** single prompt file (still read by Rust; migrated to `prompts/agent.md`) |

### Project state lifecycle

**`projectState.ts`:**

1. **`buildProjectStateSnapshot(workspacePath)`** — reads current `chat` + `workbench` stores, filters editor tabs to workspace paths
2. **`parseProjectState(raw)`** — validates version and shape
3. **`initProjectStateAutosave()`** — subscribes to store changes, debounces writes (~500ms)
4. **`persistCurrentProjectState()`** — immediate flush (beforeunload, workspace switch)
5. **Browser fallback:** `memoryByWorkspace` Map when Tauri unavailable

Loaded on **`applyWorkspaceFolder()`** in `workspace.ts`.

---

## 13. Git integration

### UI — `GitPanel.svelte`

- Shows current branch (from `git_current_branch`)
- Collapsible **Staged** and **Changes** sections
- File rows with status badges: Modified, Added, Deleted, Untracked
- Actions: stage, unstage, discard, open diff in editor
- Commit message input + recent log
- Refreshes when **`gitRefresh`** store increments (after agent file mutations)

### Rust — `git.rs`

Uses **git2** crate for all operations. Notable features:

- Porcelain-style status for UI
- Unified diff output for tool and panel
- **`git_create_checkpoint` / `git_restore_checkpoint`** — special refs for chat rewind
- **`git_discard`** — restore file from HEAD

### Explorer decorations

**`treeGitDecorations.ts`** applies git status colors/icons to file tree rows using data from the git panel / status poll.

### Agent tools

Git read tools (`get_git_status`, `get_git_log`, `get_git_diff`) format output via **`gitFormat.ts`** for token-efficient model context.

### Open changed file

**`git/openChangedFile.ts`** opens a file in the editor — normal view or diff view depending on context (uses `diffBase` on `OpenFile` for diff decorations).

---

## 14. Editor, terminal & preview

### Editor — CodeMirror 6

**`EditorSurface.svelte`** hosts one CodeMirror instance per editor tab.

**`loadCodeMirror.ts`** lazy-loads:

- Core: `@codemirror/state`, `@codemirror/view`, commands, search, lint, autocomplete
- Languages: JS/TS, HTML, CSS, JSON, Markdown, Rust, Python, YAML, Go, C/C++, Java, SQL, XML, Svelte (+ Vue→HTML fallback)

Features:

- **Syntax highlighting** from `syntaxTheme` store (`--syntax-*` CSS variables)
- **Editor chrome** from `editorChrome` store (background, gutter, cursor, selection)
- **Git diff decorations** via `diffDecorations.ts` when `OpenFile.diffBase` is set
- **Format on save** via Prettier (`formatDocument.ts`) when enabled in settings
- **Word wrap** toggle from settings
- **Uniform tab width** option for header tabs
- **Middle-click scroll** (`middleClickScroll.ts`)
- Save writes through `writeFile` IPC

### Terminal — xterm.js + PTY

**`TerminalPane.svelte`:**

- Creates xterm instance with theme from `--terminal-ansi-*` CSS variables
- FitAddon resizes terminal to container
- **`pty_create(cwd)`** spawns Rust PTY (optional workspace cwd)
- Input → `pty_write`; output ← `listenPtyData`
- Exit ← `listenPtyExit`

Terminals can live in **center workbench tabs** or the **bottom dock**.

### Preview — localhost iframe

**`PreviewPane.svelte`:**

- Loads URLs in a sandboxed iframe
- **`isLocalPreviewUrl()`** (`previewUrl.ts`) restricts to `http(s)://localhost` and `127.0.0.1` only
- Reload and “open in browser” actions

Preview tabs are created from workbench actions (e.g. default `http://127.0.0.1:5173`).

---

## 15. Theming & appearance

Tiny Llama has **three independent color systems** plus component-specific overrides.

### 1. Workbench theme

| File | Role |
|------|------|
| `src/styles/globals.css` | Default `:root` / `.dark` tokens (VS Code Dark palette) |
| `src/styles/workbench-themes.css` | Alternate presets via `[data-workbench-theme="…"]` |
| `src/lib/workbench-theme.ts` | Preset registry + `applyWorkbenchTheme()` |

**Presets:** vscode-dark (default), cursor-dark, catppuccin-mocha, tokyo-night, one-dark-pro, tiny-llama, dracula, github-dark

Applied by setting `data-workbench-theme` on `<html>` from settings.

### 2. Syntax colors

| File | Role |
|------|------|
| `src/styles/editor-syntax.css` | Base syntax token rules |
| `src/lib/editor/syntaxColors.ts` | Field definitions |
| `src/lib/stores/syntaxTheme.ts` | User overrides persisted to localStorage |

Settings → Appearance → Syntax.

### 3. Component appearance stores

| Store | Settings section | Controls |
|-------|------------------|----------|
| `editorChrome` | Appearance → Editor | Editor bg, fg, gutter, line highlight, selection, cursor |
| `explorerAppearance` | Appearance → Explorer | Panel bg, selection, git decoration colors, font/icon sizes |
| `chatAppearance` | Appearance → Chat | Thought labels, activity colors, waiting animation style |

These inject CSS custom properties at runtime on `<html>` or scoped containers.

### File icons

| Theme | Mechanism |
|-------|-----------|
| **Seti** (default) | WOFF font + `resolveSeti.ts` |
| **VS Code Icons** | Bundled SVGs in `static/icon-packs/vscode-icons/` + manifest |
| **Codicons** | `@vscode/codicons` font |
| **Custom** | User-selected folder with `manifest.json` |

**`FileIcon.svelte`** resolves icon from extension/name using active theme.

### Terminal colors

**`TerminalPane.svelte`** reads `--terminal-ansi-*` from workbench theme and passes them to xterm's `theme` option.

---

## 16. System prompts

Multi-file, mode-scoped prompts replace the legacy single `.tinyllama/prompt.md` file.

### On-disk layout

```
.tinyllama/
  prompts.json              # manifest: entries[], enabled, modes[], title, filename
  prompts/
    chat.md                 # default Chat mode prompt
    plan.md                 # default Plan mode prompt
    agent.md                # default Agent mode prompt
    my-custom.md            # user-added prompts
```

### Module map

| File | Role |
|------|------|
| `systemPrompts/types.ts` | `SystemPromptEntry`, `SystemPromptsConfig`, `SystemPromptsState` |
| `systemPrompts/config.ts` | Defaults, normalization, `combinePromptContents()`, mode helpers |
| `systemPrompts/workspace.ts` | Read/write manifest and `.md` files |
| `stores/systemPrompts.ts` | Store API: load, initialize, add/remove, setModes, setEnabled |
| `components/SystemPromptsManager.svelte` | Shared UI (Settings + sidebar) |
| `explorer/PromptPanel.svelte` | Thin sidebar wrapper |

### Mode scoping

Each entry has **`modes: ChatMode[]`**. Empty array = applies to all modes. Only **enabled** entries whose modes include the current mode are concatenated into **`activeSystemPromptText`**.

### UI behavior

- Lists default Chat/Plan/Agent entries even before files exist on disk
- **Create prompt files** button writes directory + JSON + default `.md` files
- Clicking a row opens the prompt in the editor (not inline textarea)
- Row layout: title/filename, enable checkbox, caret dropdown for mode checkboxes

### Rust support

- **`ensure_system_prompts_layout`** — creates directory structure (used when initializing)
- Legacy **`read_system_prompt` / `write_system_prompt`** still target `.tinyllama/prompt.md`

---

## 17. Settings

**`SettingsPane.svelte`** is the single settings UI used two ways:

1. **Modal overlay** in main window (`settingsOpen` state in WorkbenchShell)
2. **Full page** in popout window (`SettingsWindowRoot.svelte`, `variant="page"`)

### Settings sections

| Section ID | Label | Contents |
|------------|-------|----------|
| `general` | General | Editor prefs, workbench theme, icon theme, chat backend, system prompts |
| `providers-ollama` | Ollama | Endpoint, API key, model grid, context, server guide |
| `providers-llamacpp` | llama.cpp | Endpoint, models, server template, launch commands |
| `providers-anthropic` | Anthropic | API key, model catalog, extended thinking, context cap |
| `providers-deepseek` | DeepSeek | API key, model catalog |
| `tools` | Tools | Agent limits, per-tool policy, web fetch allowlist, custom tools |
| `experimental-compaction` | Compaction | Enable, auto-compact, threshold %, keep recent N, model override |
| `experimental-autocomplete` | Autocomplete | Placeholder settings (feature not implemented) |
| `appearance-editor` | Editor | Editor chrome color pickers |
| `appearance-syntax` | Syntax | Token color overrides |
| `appearance-explorer` | Explorer | Panel + git decoration colors |
| `appearance-chat` | Chat activity | Chat colors, waiting animation |
| `keybindings` | Keybindings | Displays shortcut defaults (read-only reference) |

Embedded components: **`SystemPromptsManager`**, **`ProviderServerGuide.svelte`**, **`OllamaOverridePanel.svelte`**.

---

## 18. Keyboard shortcuts

**`src/modules/shortcuts/`**:

| File | Role |
|------|------|
| `defaults.ts` | `SHORTCUT_DEFAULTS` — canonical binding list |
| `registry.ts` | Normalized shortcut matching |
| `dispatcher.ts` | `dispatchWorkbenchShortcut()` — maps key events to workbench actions |

**`WorkbenchShell`** listens on `svelte:window onkeydown` and dispatches:

- Toggle chat / explorer / bottom panels
- Open settings
- New terminal
- New preview tab
- Close all workbench tabs/windows

Settings → Keybindings shows the list for user reference (rebinding UI not yet implemented).

---

## 19. Build, dev & deployment

### npm scripts

| Script | Command | Use |
|--------|---------|-----|
| `pnpm dev` | `free-dev-port.mjs && vite` | Web-only UI dev |
| `pnpm tauri dev` | Tauri + beforeDevCommand (`pnpm dev`) | Full desktop app |
| `pnpm build` | `vitest run && vite build` | Production build (tests gate) |
| `pnpm build:skip-tests` | `vite build` | Fast production build |
| `pnpm preview` | `vite preview` | Serve `dist/` locally |
| `pnpm test` | `vitest run` | Unit tests |

### Vite configuration (`vite.config.ts`)

| Setting | Value |
|---------|-------|
| Dev port | **14200** (override: `VITE_PORT` or `PORT`) |
| `strictPort` | `true` — fails if port busy |
| MPA entries | `index.html`, `settings.html` |
| Alias | `$lib` → `src/lib` |
| Public dir | `static/` |
| Manual chunks | codemirror, xterm, tauri |
| Env define | Injects Anthropic/DeepSeek API keys from `.env` |
| Plugin order | Svelte `enforce: "pre"` **before** `@tailwindcss/vite` (fixes SFC CSS extraction) |

### Tauri configuration (`src-tauri/tauri.conf.json`)

| Setting | Value |
|---------|-------|
| `beforeDevCommand` | `pnpm dev` |
| `devUrl` | `http://localhost:14200` |
| `beforeBuildCommand` | `pnpm build` |
| `frontendDist` | `../dist` |
| Main window | Frameless, 1200×800, min 800×600 |
| `withGlobalTauri` | `true` |

### Dev port helper

**`scripts/free-dev-port.mjs`** kills any process listening on 14200 before starting Vite (uses `lsof`, `kill-port`, `fuser` on Linux). Prevents stale Vite instances from blocking Tauri dev.

### Prerequisites

- Node 18+, pnpm 9+
- Rust 1.70+, Tauri 2 platform dependencies
- Optional: Ollama or llama.cpp server for local models
- Optional: ripgrep (`rg`) on PATH for grep tool

### Common dev issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| **Connection refused** on localhost:14200 | Vite not running | Run `pnpm dev` or `pnpm tauri dev` |
| Blank browser page | Wrong port (not 14200) | Use `http://localhost:14200` |
| Tools/git don't work in browser | Expected — Tauri required | Use `pnpm tauri dev` |
| Port already in use | Stale process | `scripts/free-dev-port.mjs` runs automatically on dev start |

---

## 20. Testing

### Layout

```
tests/
  unit/                    # ~50 Vitest files, 285+ tests
  integration/
    ollama.test.ts         # RUN_OLLAMA_TESTS=1
    deepseek.test.ts       # RUN_DEEPSEEK_TESTS=1 + API key
  README.md
```

### Configuration

**`vitest.config.ts`:** Node environment, `$lib` alias, includes `tests/**/*.test.ts`, loads `.env` for integration keys.

### Coverage by area

| Area | Example test files |
|------|-------------------|
| Agent / compaction | `compactHistory.test.ts`, `agentCompaction.test.ts`, `compactionModel.test.ts`, `textToolCalls.test.ts`, `agentSynthesis.test.ts` |
| Tools | `toolRunner.test.ts`, `toolPolicy.test.ts`, `pathUtils.test.ts` |
| Providers | `providers/openaiCompat.test.ts`, `anthropic.test.ts`, `deepseek.test.ts` |
| State | `projectState.test.ts`, `filesStore.test.ts`, `systemPrompts.test.ts` |
| Context | `contextBudget.test.ts`, `chatContext.test.ts`, `agentLimits.test.ts` |
| UI / theme | `workbenchTheme.test.ts`, `chatAppearance.test.ts`, `iconTheme.test.ts` |
| Editor | `diffDecorations.test.ts`, `formatDocument.test.ts` |

### What is not tested

- **Rust backend** — no `#[cfg(test)]` integration; validated manually via Tauri
- **E2E browser** — no Playwright/Cypress suite
- **PTY terminal** — manual only

---

## 21. Security model

Tiny Llama is a **developer tool**, not a multi-tenant sandbox. Security assumptions:

| Surface | Mitigation |
|---------|------------|
| **Filesystem tools** | Paths resolved relative to workspace; `..` blocked in `pathUtils.ts` |
| **Shell execution** | Runs in user context with workspace cwd; policy default **ask** |
| **web_fetch** | Hostname allowlist from settings; enforced in Rust `web_fetch` |
| **API keys** | localStorage + optional env; not in OS keychain |
| **Preview iframe** | localhost/127.0.0.1 only |
| **LLM data** | Sent directly from webview to provider; no Tiny Llama cloud |

Users are expected to review agent changes via Git before committing.

---

## 22. Known gaps & partial features

| Feature | Status |
|---------|--------|
| **Search panel** | `SearchPanel.svelte` exists, not wired to sidebar |
| **Bottom dock Debug/Serial** | Placeholder tabs only |
| **Autocomplete** | Settings UI only; no inference hook |
| **LSP / diagnostics** | `editorErrorCountsByRel` stub; no language server |
| **Cmd+K inline edit** | Not started |
| **File-backed plans** (`plans/` directory) | Not started |
| **FS watcher → UI refresh** | `watcher.rs` exists, not connected |
| **OS keychain for API keys** | Not implemented |
| **LLM calls in Rust** | Not started (all HTTP in webview) |
| **Shortcut rebinding** | Display-only in settings |
| **Compaction UI divider** | Session compaction works; no visual “compacted above” marker in transcript |
| **Web-only workspace** | UI renders but cannot open folders or run tools |

---

## 23. Extension points

Developers extending Tiny Llama will most often touch:

| Goal | Where to start |
|------|----------------|
| Add a built-in tool | `toolDefinitions.ts` → handler in `toolRunner.ts` → Rust command if needed |
| Add LLM provider | New file in `providers/` → branch in `streamTurn.ts` → settings UI |
| Change agent behavior | `mode.ts` base prompts, `ChatPane.svelte` loop, `agentLimits.ts` |
| New workbench panel | Module under `src/modules/`, wire into `WorkbenchShell.svelte` |
| New settings section | Section type + nav entry in `SettingsPane.svelte` |
| New workbench theme | Entry in `workbench-theme.ts` + CSS block in `workbench-themes.css` |
| Project-level config | `.tinyllama/*.json` pattern + loader in `lib/` |

### Design constraints to respect

1. **Keep LLM HTTP in the webview** unless there is a strong reason to proxy through Rust.
2. **All filesystem mutations** should go through Rust commands for consistent path handling and git visibility.
3. **Tool policy** must gate both schema (what the model sees) and execution (what actually runs).
4. **Project state version** — bump `PROJECT_STATE_VERSION` and add migration when changing snapshot shape.
5. **Tauri guards** — use `isTauriAvailable()` before invoke; provide clear toasts in browser dev.

---

## Related documentation

| Document | Focus |
|----------|-------|
| [README.md](README.md) | User-facing overview, quick start, feature list |
| [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) | Architecture reference (implementation-aligned) |
| [docs/overview/OVERVIEW.md](docs/overview/OVERVIEW.md) | Product snapshot |
| [docs/specs/README.md](docs/specs/README.md) | Numbered specification index |
| [tests/README.md](tests/README.md) | How to run tests |

---

*This assessment was produced from direct inspection of the codebase structure, source files, and existing documentation. It describes the application as implemented, not a future roadmap.*
