# Tiny Llama × Terax-Inspired Workbench Specification

**Version:** 1.0  
**Goal:** Evolve Tiny Llama into a Terax-grade **visual and functional workbench**—tabbed editor / terminal / preview, cohesive chrome, and richer agent UX—**without** abandoning Tiny Llama’s core architecture: **swappable Node sidecar harnesses**, explicit **model/backend** selection (Anthropic, Ollama, llama.cpp, future providers), and **tool policy**.

This document is the single source of truth for **what to build**, **how it should feel**, and **what must stay decoupled**.

---

## 1. Principles

1. **Preserve the harness boundary**  
   Agent reasoning, provider SDKs, and tool execution policies remain behind the **sidecar harness interface** (`sidecar/src/harness.ts`, JSON-RPC via Tauri). The UI must not embed provider-specific agent loops (contrast: Terax’s in-process Vercel AI SDK `Agent`).

2. **Terax-like product shell, Tiny Llama layout**  
   - **Left:** Agent chat (primary). This is Tiny Llama’s differentiator—expand it with Terax-inspired **capabilities and polish**, not relocate it.  
   - **Center:** Unified **workbench** with **tabs** for Editor, Terminal, Preview (and optional future tab kinds).  
   - **Right:** Explorer / Search / Source Control (existing activity-bar pattern), upgraded visually and functionally toward Terax’s explorer quality.

3. **Design parity over framework parity**  
   Terax uses React + Tailwind + shadcn-style primitives. Tiny Llama stays **Svelte**; achieve **look-and-feel parity** via shared **design tokens** (CSS variables), spacing, typography, radii, borders, and motion—not by rewriting the stack.

4. **Progressive enhancement**  
   Ship vertical slices (e.g. real terminal before preview polish) behind feature flags if needed. Each phase leaves the app **usable**.

---

## 2. Target Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Header: app identity · workspace breadcrumb · tab actions · global search   │
├──────────────┬───────────────────────────────────────────────┬──────────────┤
│              │  Tab bar: [ Editor ] [ Terminal ] [ Preview ] … │ ▐            │
│              ├───────────────────────────────────────────────┤ █  Activity   │
│   AGENT      │                                               │ █  bar         │
│   PANE       │            Active tab content                  │ █  (Explorer, │
│   (chat,     │                                               │ █   Search,    │
│   harness,   │                                               │ █   Git, …)    │
│   models,    │                                               │ │              │
│   tools)     │                                               │ │  Secondary   │
│              │                                               │ │  pane        │
├──────────────┴───────────────────────────────────────────────┴──────────────┤
│  Status bar: branch · encoding · harness/model · context tokens · errors    │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Panel toggles:** Preserve collapsible left/center/right/bottom semantics, but prefer **center tabs** for Terminal and Preview instead of only a **docked bottom terminal**—Terax’s mental model is “each surface is a first-class tab.” Bottom dock can remain as an **optional layout mode** (user preference: tabs-only vs terminal-split).

---

## 3. Feature Matrix (Today → Target)

| Area | Tiny Llama (baseline) | Terax (reference) | Target for Tiny Llama |
|------|------------------------|---------------------|------------------------|
| Agent runtime | Node sidecar harness, JSON-RPC | In-process AI SDK agent | **Keep sidecar**; improve IPC and UI affordances |
| Models/backends | Anthropic, Ollama, llama.cpp | Many cloud providers + LM Studio | **Keep + extend** providers via harness adapters |
| Tool policy | Allow / whitelist / confirm | SDK approval cards | **Keep**; align **visual patterns** with Terax-style approval cards |
| Editor | CodeMirror, single active file, tabs implied lightly | Multi-tab editor stack, themes, vim, AI diff | **Multi-tab editor strip**, themes, optional vim; **AI diff** when harness emits structured edits |
| Terminal | Mock UI, no PTY | xterm + WebGL, `portable-pty`, multi-tab, shell integration | **Real PTY**, xterm (WebGL addon optional), **multi-session tabs** |
| Preview | None | Webview tab, address bar, dev-server hints | **Webview preview tab**, URL bar, optional port hints |
| File explorer | Right sidebar + tree | Rich tree, icons, fuzzy find, actions | **Retain position**; add **icon theme**, **fuzzy filter**, **keyboard nav**, context actions |
| Header | Minimal navbar | Search, workspace cues | **Terax-style density** + workspace path / search entry |
| Settings | Single pane | Dedicated window / sections | **Grouped sections**: Appearance, Agent/Harness, Models, Terminal, Preview, Keybindings |
| Global shortcuts | Partial | Strong shortcut story | **Shortcut overlay** + configurable map (phase 2+) |

---

## 4. Visual Design System (Terax-Inspired)

### 4.1 Foundations

- **Semantic color tokens:** `background`, `surface`, `surface-elevated`, `border`, `text`, `text-muted`, `accent`, `destructive`, `success`—implemented as `:root` CSS variables (light/dark + optional **high contrast**).
- **Radii:** Slightly rounded panels (`8–12px`) for cards and inputs; square **tab strip** for density (match Terax’s hybrid).
- **Typography:** UI sans for chrome (system stack); **editor monospace** unchanged or upgraded to a curated stack (JetBrains Mono, etc.).
- **Elevation:** Subtle borders > heavy shadows; hover states on interactive rows (explorer, chat messages).
- **Motion:** Short transitions (120–200ms) for panel collapse and tab switch—avoid distracting flourishes.

### 4.2 Components to Standardize

Reusable Svelte primitives (names illustrative):

- `Button`, `IconButton`, `Input`, `Select`, `Dropdown`, `Tabs`, `Badge`, `ScrollArea`, `Separator`, `Tooltip`, `Dialog`, `Toast`

Map Terax patterns (compact headers, pill statuses, inline kbd hints) onto these primitives.

### 4.3 Themes

**Phase 1:** One **default dark** theme aligned to Terax’s Tokyo Night–adjacent feel.  
**Phase 2:** User-selectable presets (Nord, GitHub Dark, etc.)—mirror Terax’s theme list where licensing allows.

---

## 5. Workbench: Tabs Model

### 5.1 Tab kinds

| Kind | Description |
|------|-------------|
| `editor` | CodeMirror document bound to a file path (multiple open files). |
| `terminal` | xterm session backed by a PTY session id. |
| `preview` | Embedded webview loading a URL (localhost-first). |
| `ai-diff` (optional) | Review unified diff from harness before apply (future; depends on harness protocol). |

### 5.2 Tab bar behavior

- Draggable reorder (phase 2).  
- Middle-click or context menu to close.  
- Persist **open tabs + active tab** per workspace in app settings/store (graceful degradation if path missing).  
- **Keyboard:** `Ctrl/Cmd+W` close tab, `Ctrl/Cmd+Tab` cycle—align with Terax shortcut philosophy.

### 5.3 Split layout (optional later)

Secondary editor split is **out of scope** for v1; single active editor surface matching current complexity.

---

## 6. Terminal Subsystem

### 6.1 Requirements

1. **Native PTY** via Rust (`portable-pty` or equivalent), matching Terax’s capability—**not** a line-buffered fake shell.  
2. **Frontend:** `xterm.js` + `xterm-addon-fit` + optional `xterm-addon-webgl`; bridge raw bytes **bidirectionally** (Tauri events or dedicated plugin channel—avoid flooding IPC; batch or stream efficiently).  
3. **Multi-tab:** Each terminal tab owns `session_id` → PTY child; closing tab kills session (with confirm if process running—phase 2).  
4. **CWD:** New terminal inherits **workspace root** or **last active terminal cwd** (store per session).  
5. **Shell integration (stretch):** OSC sequences or injected rc snippet for cwd reporting—enables accurate “run in project root” for harness tools later.

### 6.2 Tauri commands (indicative)

- `pty_create` → `{ id }`  
- `pty_write` `{ id, data }`  
- `pty_resize` `{ id, cols, rows }`  
- `pty_close` `{ id }`  
- Event `pty:data` `{ id, chunk }`  
- Event `pty:exit` `{ id, code }`

### 6.3 Tiny Llama today

Replace `Terminal.svelte` mock with xterm + IPC above; wire navbar **bottom panel** toggle to **show/hide** terminal **region** while tabs decide **which** terminal is active—or migrate fully to **terminal-as-tab** and deprecate bottom-only UX.

---

## 7. Preview Subsystem

### 7.1 Requirements

1. **Preview tab** with embedded webview (`tauri-plugin-webview-window` / webview within shell per Tauri 2 docs—exact API to match repo constraints).  
2. **Address bar:** URL input, navigate, reload, “open in system browser.”  
3. **Security:** Restrict to `http://localhost`, `http://127.0.0.1`, and optional user-allowed hosts (settings); block `file://` by default.  
4. **Dev hints (nice-to-have):** Quick-insert presets for common ports (3000, 5173, 8080, 11434, etc.)—Terax uses hints without implying AI routing.

### 7.2 Integration ideas

- From terminal: detect “listening on http://…” patterns (optional); offer **Open preview** chip (Terrax-style affordance).  
- From harness: optional tool `open_preview(url)` forwarded from sidecar → Tauri → focus preview tab (requires **trust model** in tool policy).

---

## 8. Editor Subsystem Enhancements

1. **Explicit tab strip** for open files (path + dirty indicator + pin optional).  
2. **Theme alignment:** Drive CodeMirror theme from global CSS variables.  
3. **Vim mode (optional):** `@codemirror/commands` / vim package—settings toggle.  
4. **Language coverage:** Match Terax breadth over time (YAML/TOML/Svelte/etc.) via `@codemirror/lang-*`.  
5. **AI integration:**  
   - **Today:** Selection-based ask (if present, polish).  
   - **Future:** Inline diff review pane fed by harness **structured patch** messages—protocol extension, not a rewrite.

---

## 9. Left Agent Pane (Preserve + Enrich)

The left pane remains the **AI command center**. Merge:

### 9.1 Tiny Llama capabilities to retain

- Backend switch: Anthropic / Ollama / llama.cpp  
- Model picker + context window estimate  
- Tool policy (allow all / whitelist / confirm)  
- Sidecar lifecycle (`start_harness`, events stream)  
- Tool approval UI  
- Session tabs / history (as implemented in `chat` store)  
- Token/context indicator  

### 9.2 Terax-inspired additions (UI/UX)

Present as **sections** or **collapsible blocks**—avoid clutter.

| Feature | Intent | Harness coupling |
|---------|--------|------------------|
| **Agent / persona switcher** | Multiple “system” presets (Coding, Review, Docs) | Harness reads persona string from settings each turn |
| **Snippets / slash commands** | `/plan`, `/review`, user snippets | Implemented UI-side; inject into user message or harness params |
| **Composer attachments** | Drag files / images into chat | Map to harness capability flags (`supportsImages`, etc.) |
| **Plan/todo strip** | Lightweight checklist UI synced from harness events | Optional schema: harness emits `todo_update` events |
| **Mini/popout chat** | Floating condensed chat (secondary monitor) | Pure UI |
| **Voice input** | Push-to-talk → STT | Requires provider key + native/audio deps—**phase 3** |

### 9.3 Context injection contract (Terax parity)

Terax injects **workspace root, cwd, terminal tail, active file** into the model turn. Tiny Llama should define a **`WorkbenchContext` snapshot`** assembled in the shell and passed with each `send_toHarness` (or periodic sync):

```ts
type WorkbenchContext = {
  workspaceRoot: string | null;
  activeFile: { path: string; selection?: string } | null;
  activeTerminalCwd: string | null;
  terminalTail: string | null; // capped chars/lines
  openFiles: { path: string; dirty: boolean }[];
};
```

The **harness** remains responsible for formatting prompt prefixes—UI only supplies structured facts.

---

## 10. Right Sidebar (Explorer Position Locked)

Keep **activity bar on the right edge**; enhance secondary pane:

1. **File tree:** Icon theme (e.g. catppuccin-style monochrome glyphs), fuzzy filter row, keyboard navigation (up/down, expand/collapse).  
2. **Search:** Ripgrep-backed if feasible (`grep` Tauri command); respect `.gitignore`.  
3. **Source control:** Expand from placeholder toward real `git status` via `git2` or CLI—roadmap alignment with Tiny Llama README.  
4. **Context menus:** New file/folder, rename, delete/reveal—delegate to existing fs commands.

---

## 11. Header & Status Bar

### Header

- Workspace name / path (truncated + tooltip).  
- Quick actions: **New tab**, **Command palette** (phase 2), **Settings**.  
- Optional **global search** input mirroring Terax header search affordance.

### Status bar

- Git branch (when available).  
- **Harness status:** idle / starting / ready / error.  
- **Backend + model** shorthand.  
- **Context meter:** `used / max` tokens (existing estimate).  
- Terminal/preview indicators when active.

---

## 12. Settings Reorganization

Group into tabs or left-nav sections:

| Section | Contents |
|---------|----------|
| Appearance | Theme, density, font size, vim |
| Agent | Default harness preset, personas, snippets root |
| Models | Existing backend/model configuration |
| Tools | Tool policy defaults, whitelist editor |
| Terminal | Shell path, font, scrollback, copy-on-select |
| Preview | Allowed hosts, default URL |
| Keybindings | Shortcut editor (later) |

---

## 13. Harness & IPC Boundaries

### Must not regress

- `send_toHarness(method, params)` RPC shape  
- `harness:event` streaming for assistant deltas, tools, approvals  
- Ability to swap adapters under `sidecar/src/adapters/`

### Recommended extensions (versioned)

Add optional methods/events **only** with `protocolVersion` negotiation:

- `workbench/context` push from shell → sidecar  
- `ui/open_preview`, `ui/reveal_file` from sidecar → shell (guarded by policy)  
- Structured `edit_proposal` / `diff_review` for future AI diff tabs  

---

## 14. Implementation Phases

### Phase A — Design system + structure

- CSS tokens, refactor navbar/sidebar/panels to primitives  
- Introduce **central workbench store**: tabs, active tab id, dirty flags  

### Phase B — Editor tabs

- Multi-file tab strip; persist state  
- CodeMirror lifecycle per tab  

### Phase C — Real terminal

- Rust PTY + xterm bridge  
- Terminal tab kind + optional bottom dock sync  

### Phase D — Preview

- Webview tab + URL security model  

### Phase E — Agent pane polish

- WorkbenchContext injection  
- Terax-like composer (attachments, snippets, approval cards styling)  

### Phase F — Explorer/search hardening

- Icons, fuzzy nav, ripgrep-backed search  

### Phase G — Shortcuts, palette, polish pass

---

## 15. Non-Goals (Explicit)

- Replacing Svelte with React  
- Moving agent logic into Rust or into the webview (beyond IPC)  
- Full IDE parity (LSP, debugger, multi-root workspaces)—optional far future  
- Telemetry or accounts  

---

## 16. Acceptance Criteria (MVP for “Terax-like” Claim)

1. User can open **multiple editor tabs** with visible strip and dirty state.  
2. User can open **terminal tab(s)** running a **real shell** with working PTY.  
3. User can open **preview tab** to `http://localhost:*` with URL bar.  
4. Left chat **unchanged in position**; shows **backend + model + harness status** clearly; tool confirmations look **modern and readable** (Terax-grade).  
5. Visual refresh: **tokens + components** make the app recognizably closer to Terax polish than current pure VS Code clone styling.  
6. **Harness swap** still works: changing adapter in sidecar requires **no** UI rewrite—only capability flags.

---

## 17. References

- **Terax** (`terax-ai`): Tab model in `src/app/App.tsx`; terminal `src/modules/terminal/`; preview `src/modules/preview/`; explorer `src/modules/explorer/`; AI UX `src/modules/ai/`.  
- **Tiny Llama**: Layout `src/App.svelte`; harness IPC `src/lib/ipc.ts`; chat `src/lib/components/ChatPane.svelte`; sidecar `sidecar/src/harness.ts`.

---

*End of specification.*
