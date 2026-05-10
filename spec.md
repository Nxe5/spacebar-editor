# Tiny Llama — Application Specification

This document describes the **Tiny Llama** desktop application: purpose, architecture, runtime behavior, persistence, IPC, and extension points. It is intended for contributors and for keeping product and engineering decisions in one place.

---

## 1. Product overview

**Tiny Llama** is a **minimal Cursor-like IDE** for desktop: a single window combining **AI chat**, **file explorer**, **multi-tab editor** (CodeMirror 6), **integrated terminal** (xterm + PTY), optional **preview** and **bottom dock**, and **settings**. The app targets developers who want a small, hackable shell around a coding agent (Pi-style harness) with optional **Anthropic**, **Ollama**, or **llama.cpp** backends.

**Non-goals (today):** full LSP, Git UI beyond a stub panel, multi-root workspaces, cloud sync, mobile.

---

## 2. Technology stack

| Layer | Technology |
|--------|------------|
| Desktop shell | **Tauri 2** (Rust), WebKit-based webview |
| UI | **Svelte 5** (runes: `$state`, `$props`, `$effect`, `$derived` where used) |
| Styling | **Tailwind CSS 4** (`@tailwindcss/vite`), shared **CSS variables** for workbench/editor/terminal |
| Editor | **CodeMirror 6** (`codemirror`, language packages for JS/TS, HTML, CSS, JSON, MD, Rust, Python) |
| Terminal | **xterm.js** + `@xterm/addon-fit`; PTY via Tauri commands |
| Agent runtime | **Node sidecar** (`sidecar/`, compiled to `sidecar/dist/index.js`) — JSON-RPC over stdin/stdout; events emitted as JSON lines to stdout, forwarded by Rust as Tauri events |
| Bundler | **Vite 6** — multi-page app: `index.html` (main), `settings.html` (settings window) |
| Types / checks | TypeScript, `svelte-check`, Vitest |

**Dev server:** default port **14200** (`vite.config.ts`, `tauri.conf.json` `build.devUrl`) to avoid collisions with common ports. `scripts/free-dev-port.mjs` runs before `npm run dev` to free the port when possible.

---

## 3. High-level architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Webview (Svelte) — WorkbenchShell                               │
│  ├─ ChatPane          ├─ CenterWorkbench (tabs + EditorSurface) │
│  │   harness IPC       │   Terminal / Preview overlays            │
│  └─ …                 └─ RightSidebar (Explorer / Search / SCM)    │
├─────────────────────────────────────────────────────────────────┤
│  Tauri (Rust)                                                     │
│  ├─ invoke: FS, workspace, harness control, PTY, settings window │
│  └─ events: harness:event, pty:data, pty:exit                      │
├─────────────────────────────────────────────────────────────────┤
│  Sidecar (Node) — Pi-style harness, model routing, tools          │
└─────────────────────────────────────────────────────────────────┘
```

- **UI** never talks to the network for Anthropic/Ollama directly for the full agent loop in all paths; the **sidecar** performs provider calls and tool execution as configured by the harness.
- **Filesystem** reads/writes go through **Tauri** (`read_file`, `write_file`, `list_dir`) so the webview stays sandboxed relative to OS APIs.

---

## 4. Entry points and windows

| Entry | File | Role |
|--------|------|------|
| Main shell | `index.html` → `src/main.ts` | Imports global styles, mounts `App.svelte` → `WorkbenchShell` |
| Settings popout | `settings.html` → `src/settings-main.ts` | Separate webview window (`SettingsWindowRoot`); same CSS tokens |
| Tauri binary | `src-tauri/src/main.rs` | Registers plugins, state (`SharedSidecar`, `PtyManager`), **invoke_handler** |

**Tauri windows**

- **`main`** — primary workbench (`WorkbenchShell`).
- **`settings`** — created on demand via `open_settings_window` (`commands.rs` + `WebviewWindowBuilder`).

**Capabilities** (`src-tauri/capabilities/default.json`): `core:default`, `shell:default` for windows `main` and `settings`.

---

## 5. Workbench layout (UI)

Implemented in **`WorkbenchShell.svelte`**:

- **Title bar** — workspace label, actions: Terminal, Preview, close-all, toggle chat / bottom / explorer, pick folder, settings (modal + external window).
- **Left** — **Chat** (`ChatPane`) in a fixed-width aside; optional resize divider (visual only in current code).
- **Center** — **`CenterWorkbench`**: horizontal **tab strip** (editor / terminal / preview tabs) + content area.
  - **Editor** — `EditorSurface` (CodeMirror); hidden when active tab is not `editor` (CSS `hidden`).
  - **Terminal / Preview** — full-bleed overlays when those tab kinds are active.
- **Right** — **`RightSidebar`**: secondary pane (Explorer, Search, Source Control stub) + **activity bar** (icon strip). Explorer defaults to **open** (`secondaryOpen`).

**Bottom dock** — toggled from header; hosts **`BottomDock`** (Terminal stub, Debug Console stub, Serial stub) with its own tab strip.

**Status bar** — `StatusBar.svelte` at the foot of the shell.

**Keyboard shortcuts** — `src/modules/shortcuts/` (`defaults.ts`, `registry.ts`, `dispatcher.ts`): e.g. Mod+B chat, Mod+Shift+E explorer, Mod+J bottom, Mod+, settings, Mod+Shift+` new terminal, Mod+W close tab (when wired to dispatcher from `WorkbenchShell`).

---

## 6. Frontend modules (`src/modules/`)

| Module | Responsibility |
|--------|----------------|
| `workbench/` | Shell layout, center tabs, bottom dock, status bar |
| `agent/` | `ChatPane` — sessions, model picker, harness lifecycle, streaming UI, context meter, tool approval UI |
| `explorer/` | `RightSidebar`, `FileTree`, `FileTreeRow`, `SearchPanel`, `SourceControl` (stubs where noted) |
| `editor/` | `EditorSurface` — async CM load, per-path `EditorState` cache, save (Ctrl/Cmd+S) |
| `terminal/` | `TerminalPane` — xterm, PTY IPC, theme sync |
| `preview/` | `PreviewPane` — embedded preview (URL-driven) |
| `settings/` | `SettingsPane` (modal), `SettingsWindowRoot` (dedicated window) |
| `shortcuts/` | Global shortcut dispatch |

**Design system:** `src/lib/components/ui/` — bits-ui / shadcn-style primitives (button, dialog, tabs, select, etc.).

---

## 7. State management (Svelte stores)

All stores are **classic `writable` / `derived`** unless noted; persistence uses **`localStorage`** keys below.

### 7.1 `settings` (`src/lib/stores/settings.ts`)

**Key:** `tinyllama.settings.v1`

| Field | Meaning |
|--------|---------|
| `apiKeys.anthropic`, `apiKeys.openai` | API keys (OpenAI reserved for future routing) |
| `chatBackend` | `"anthropic"` \| `"ollama"` \| `"llamacpp"` |
| `harnessKind` | `"pi-latest"` \| `"pi-minimal"` (see `HARNESS_OPTIONS`) |
| `lastBundledPiSdkVersion` | Sidecar-reported Pi SDK version string |
| `ollamaEndpoint`, `llamacppEndpoint`, `llamacppApiKey` | Local / OpenAI-compatible endpoints |
| `selectedModel` | Model id string (Anthropic id from `AVAILABLE_MODELS`, or installed Ollama tag, or llama.cpp row id) |
| `lastOllamaModelId` | Last chosen Ollama tag when present in `ollamaModels` |
| `ollamaModels`, `llamacppModels` | `ModelConfig[]` — id, name, provider, `contextWindow`, optional `contextLimitMax` (Ollama) |
| `anthropicExtendedThinking` | Claude extended thinking toggle (sidecar enforces model support) |
| `workbenchTheme` | Theme id (see §12) |
| `anthropicContextBudget` | `null` = full model window; else cap for context meter / requests |

`AVAILABLE_MODELS` lists **Anthropic** and **OpenAI** catalog entries for UI; only Anthropic path is fully wired through the sidecar today for cloud Claude.

### 7.2 `files` (`src/lib/stores/files.ts`)

| Field | Meaning |
|--------|---------|
| `tree` | `FileEntry[]` explorer roots (from `list_dir` + `normalizeFileEntry`) |
| `openFiles` | Open buffers (`path`, `name`, `content`, `isDirty`, `language`) |
| `activeFilePath` | Canonical path string (`normalizeFilePath`) |
| `workspacePath` | Current workspace root |

**Path rule:** all stored paths use **`normalizeFilePath`** (`src/lib/fsPath.ts`: trim, `\` → `/`) so explorer, tabs, and `activeFile` derived store stay consistent across OS APIs.

### 7.3 `workbench` (`src/lib/stores/workbench.ts`)

**Key:** `tinyllama.workbench.v1`

| Field | Meaning |
|--------|---------|
| `tabs` | `WorkbenchTab[]` — `kind`: `editor` \| `terminal` \| `preview` |
| `activeTabId` | Current tab id (editor tabs use `editor:<normalizedPath>`) |

**Important API:** `ensureEditorTab`, `setActiveTab`, `closeTab`, `hydrateEditorTabs`, `syncFromOpenFiles`, `closeAllTabs`, terminal/preview helpers.

Persisted editor tabs are **normalized** on load so ids match `editorTabId(path)`.

### 7.4 `chat` (`src/lib/stores/chat.ts`)

Sessions (multi-tab chat), `history` of closed sessions (`MAX_HISTORY`), `isStreaming`, `currentToolCall`, title heuristics from first assistant reply.

### 7.5 `toolPolicy` (`src/lib/stores/toolPolicy.ts`)

`mode`: `allow_all` vs whitelist-driven confirm path; used on Anthropic-style tool flows (see harness / UI).

---

## 8. Workspace resolution

**Rust** (`commands.rs`):

1. If `workspace_root.txt` exists under OS config dir (`tiny-llama/`) and contains a valid directory path → **override**.
2. Else **`std::env::current_dir()`** (process CWD, typically project dir in dev).

**Frontend** (`applyWorkspaceFolder` in `src/lib/workspace.ts`): sets `workspacePath`, `list_dir`, `files.setTree` with **normalized** `FileEntry` rows.

**Explorer filter** (`filesystem.rs`): skips dotfiles, `node_modules`, `target`, `dist`.

---

## 9. Tauri IPC (commands and events)

### 9.1 Commands (`invoke`)

| Command | Purpose |
|---------|---------|
| `list_dir` | Directory listing → `Vec<FileEntry>` (JSON) |
| `read_file` | UTF-8 file read |
| `write_file` | UTF-8 file write |
| `get_workspace_path` | Resolved workspace root string |
| `pick_workspace_folder` | Native picker; persists override file |
| `start_harness` | Spawns Node sidecar if not running |
| `send_to_harness` | JSON-RPC line to sidecar stdin; returns numeric request id |
| `stop_harness` | Stops sidecar |
| `open_settings_window` | Shows/focuses `settings` webview |
| `pty_create` | New PTY session id (optional `cwd`) |
| `pty_write` | Write bytes to PTY |
| `pty_resize` | Cols/rows |
| `pty_close` | Tear down session |

### 9.2 Events (`listen`)

| Event | Payload shape (conceptually) |
|--------|-------------------------------|
| `harness:event` | `{ id, event, data }` — mirrors sidecar RPC events |
| `pty:data` | `{ id, data }` |
| `pty:exit` | `{ id, code }` |

**Frontend wrapper:** `src/lib/ipc.ts` — lazy-loads `@tauri-apps/api`, `isTauriAvailable()` for browser-only `npm run dev` (degraded UX: no FS, no harness, no PTY).

---

## 10. Sidecar (Node harness)

**Location:** `sidecar/` — build output **`sidecar/dist/index.js`** (path resolved in Rust `get_sidecar_path`: CWD-relative, then parent).

**Protocol:** newline-delimited **JSON** per line.

- **Inbound (Rust → Node):** `{ id, method, params }`.
- **Outbound (Node → Rust):** same shape as `HarnessEvent` / `RpcEvent`; Rust emits `harness:event`.

**Responsibilities:** harness factory (`harnessFactory.ts`), Pi adapters (`adapters/`), model providers (`models/`), tool policy / approvals, streaming chat loop. **Config** pushed on `start` with API keys, backend, model list, harness kind, etc. (see `ChatPane` / IPC `sendToHarness`).

**Concurrency:** sidecar serializes non-chat operations (`enqueueNonChat`); chat uses abort controller per request.

---

## 11. Chat and editor integration

### 11.1 Chat (`ChatPane.svelte`)

- Starts harness on demand (`startHarness`, `listenHarnessEvents`).
- Sends chat via `sendToHarness` with message + history; renders deltas (content, thinking, tool cards) using stream reducers (`harnessStreamDisplay.ts`).
- **Ollama:** fetches tags, merges recommended models, context options (`ollamaClient.ts`); chat readiness tied to catalog + selected installed model.
- **Context meter:** estimates tokens (`chatContext.ts`, `gpt-tokenizer`); footer shows usage vs cap; **clickable budget** for Ollama / llama.cpp / Anthropic caps (`anthropicContextBudget`).
- **Tool approval:** banner when harness requests confirmation; `approve_tool` / deny over IPC.

### 11.2 Editor (`EditorSurface.svelte`)

- Lazy-imports CodeMirror; **`cmReady`** gates effects.
- **`$effect`** wires `activeTab`, `activeFile`, `editorPaths`: requires `activeTab.kind === "editor"` **and** non-null **`activeFile`** (must match normalized paths in `files` store).
- Per-file `EditorState` in a `Map` by path; **prune** when path leaves `editorPaths`.
- After `setState` / create: **`tick()` + `requestMeasure()`** for layout.

### 11.3 Center tabs

Tab strip uses **`--workbench-tab-active-indicator`** (see §12); active tab has bottom accent (`::after`).

---

## 12. Theming

- **Default tokens:** `src/styles/globals.css` (`:root` / `.dark`) — editor, shadcn-compatible semantic colors, activity bar, terminal ANSI, **`--workbench-tab-active-indicator`** (defaults to `var(--primary)`).
- **Presets:** `src/styles/workbench-themes.css` — selector `.dark[data-workbench-theme="<id>"]` for Catppuccin, Tokyo Night, One Dark Pro, **Tiny Llama** (One Dark Pro–style palette), Dracula, GitHub Dark.
- **Registry:** `src/lib/workbench-theme.ts` — `WORKBENCH_THEME_OPTIONS`, `applyWorkbenchTheme()` sets `data-workbench-theme` on `<html>` (cleared for `vscode-dark`).

Settings and shell call `applyWorkbenchTheme` when `workbenchTheme` changes.

---

## 13. Terminal

- **Workbench terminal tab** — PTY in center area (`pty_create` with workspace cwd).
- **Bottom dock terminal** — separate PTY when dock is open (`BottomDock.svelte`).
- **Theme:** terminal colors follow CSS variables set by workbench theme; `TerminalPane` reacts to theme id.

---

## 14. Preview

`PreviewPane` loads a URL (default dev server hint `http://127.0.0.1:5173`); opened as a **preview** workbench tab from header.

---

## 15. Security and secrets

- **No secrets in repo** — see `docs/SECRETS.md`.
- **Settings keys** live in **localStorage** (`tinyllama.settings.v1`); not OS keychain.
- **CSP** in `tauri.conf.json` is currently **`null`** (relaxed); tighten for production if loading remote content.
- **Filesystem** — only paths reachable via normal OS permissions for the running user; no sandboxed virtual FS.

---

## 16. Testing

| Command | Scope |
|---------|--------|
| `npm test` | Vitest unit tests (`tests/unit/`) |
| `npm run test:ollama` | Optional integration against live Ollama (`RUN_OLLAMA_TESTS=1`) |

Representative units: `chatContext`, `harnessStreamDisplay`, `toolPolicy`, Ollama stream mapping.

---

## 17. Build and release

```bash
npm install
cd sidecar && npm install && npm run build && cd ..
npm run tauri dev    # dev
npm run tauri build  # release bundle
```

**Sidecar must be built** before Tauri can start the harness (`get_sidecar_path` error if missing).

**Identifier:** `dev.tinyllama.app` in `tauri.conf.json` (note macOS `.app` suffix warning in Tauri logs).

---

## 18. Extension points (documented in README)

- New harness adapters: `sidecar/src/adapters/`, register in `harnessFactory` / `index.ts`.
- New workbench themes: add CSS block + option in `workbench-theme.ts`.
- New languages in editor: extend `EditorSurface` lazy imports + `getLanguageFromPath` / `languageExtensions` map.

---

## 19. Known gaps and roadmap (informal)

From `README.md` / stubs: Git depth, LSP, rich file search, inline tool diffs, serial backend, debug console wiring, optional OpenAI-first chat path in UI.

---

## 20. Glossary

| Term | Meaning |
|------|---------|
| Harness | Pi-style coding agent loop in the sidecar |
| Sidecar | Node `index.js` subprocess controlled by Tauri |
| Workbench | Overall IDE chrome: chat + center + right + status |
| Workspace | Root folder for explorer + default terminal cwd |

---

*This spec reflects the repository as of the document author’s pass over the tree; when behavior and code diverge, treat the code as authoritative and update this file.*
