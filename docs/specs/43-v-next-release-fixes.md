# Spec 43 — v-next Release Fixes

> **Status:** ✅ **Implemented**
> **Area:** Model Selector · Chat UX · Settings · Compaction · Update Check · App Identity
> **Phase:** B — Polish & reliability before broader distribution
> **Depends on:** [21-context-compaction.md](21-context-compaction.md) · [27-local-model-ux.md](27-local-model-ux.md) · [30-agent-context-and-model-settings.md](30-agent-context-and-model-settings.md) · [36-first-run-onboarding.md](36-first-run-onboarding.md)

---

## 1. Overview

All items in this spec have been implemented. See §9 for implementation notes.

| # | Area | Summary | Status |
|---|------|---------|--------|
| §2 | Model Selector | Show provider titles even when no models available | ✅ Done |
| §3 | Chat UX | Drag file/folder/element into chat; attachment chips with icons, click-to-open, native OS drop | ✅ Done |
| §4 | Settings | Experimental section — names only, drop redundant label | ✅ Done |
| §5 | Settings | Ollama & llama.cpp help links — make them clickable | ✅ Done |
| §6 | Compaction | Enable compaction and auto-compaction by default at 85% | ✅ Done |
| §7 | Status Bar | App version indicator + update check in first-window footer | ✅ Done |
| §8 | App Identity | Show "Spacebar Editor" as process name on macOS | ✅ Already correct |

> **Removed from scope:** Dark Bubblegum color system changes were excluded per product decision — default theme unchanged.

---

## 2. Model Selector — Always Show Provider Titles ✅

When the user opens the model picker and a provider has no models configured or available, the section header now remains visible with a "No models available" subdued line beneath it.

**Order:** Ollama → llama.cpp → Anthropic → DeepSeek (stable regardless of availability).

**Files changed:** `src/modules/agent/ChatPane.svelte` — removed `{#if showOllamaInModelMenu}` etc. conditionals; each section now always renders with an `{:else}<span class="model-popup-unavailable">No models available</span>` branch.

---

## 3. Drag File or Folder into Chat for Context ✅

Files and folders can be dragged from the OS file manager or the in-app explorer into the chat area. Each item appears as an **attachment chip** in a dedicated row above the composer textarea.

### Architecture

- **Drop detection:** `.chat-pane` has `ondragover`/`ondragleave`/`ondrop` handlers. `chatDropCounter` tracks enter/leave nesting for accurate overlay display.
- **Pending state:** `pendingAttachments: PendingAttachment[]` — a reactive Svelte array (`browser-file | dir-entry | abs-path | element` union). `addAttachment(att)` pushes to the array; `removeAttachment(i)` filters by index and refocuses the composer.
- **Chip row:** a `.composer-attachments` `<div role="list">` rendered above the textarea via a Svelte `{#each}` loop. Chip labels are computed by `attachmentChipLabel()` / `attachmentChipKind()`. CSS is Svelte-scoped (no `:global()` needed — chips are declared in the template).
- **Backspace removal:** when the composer text is empty and `pendingAttachments` is non-empty, `composerCaretAtStart()` returns `true` and Backspace removes the last chip via `pendingAttachments.slice(0, -1)`.
- **Content resolution:** `resolveAttachments()` reads file content at send time — browser files via `File.text()`, directories via `FileSystemDirectoryEntry.createReader()`, absolute paths via `readFile`/`listDir` IPC.
- **Explorer drag source:** `FileTreeRow.svelte` sets `draggable={true}` and `ondragstart` with `application/spacebar-path` + `text/plain` MIME types.

### Contenteditable Composer

The chat composer is a `<div contenteditable="true">` (not a `<textarea>`). Chips live outside the contenteditable in their own row — the composer itself stays plain text.

| Aspect | Implementation |
|--------|---------------|
| Text sync | `inputValue` re-derived from DOM on each `oninput` via `getComposerText()` |
| Chip display | `.composer-attachments` row above the `<div>`, Svelte `{#each pendingAttachments}` |
| Chip removal | `removeAttachment(i)` + `focusComposer()` |
| Backspace chip removal | `composerCaretAtStart()` guard + `pendingAttachments.slice(0, -1)` |

Helper functions: `getComposerText()`, `setComposerText()`, `clearComposer()`, `appendTextToComposer()`, `focusComposer()`, `addAttachment()`.

Paste handler strips rich HTML (plain text only).

### Native OS drag-drop (Dolphin, file manager, etc.)

HTML5 `drop` events in Tauri only receive portal/FUSE URIs (e.g. `/run/user/1000/doc/…`), not real paths. External drops are handled via Tauri's native drag-drop events:

| Piece | Implementation |
|-------|----------------|
| IPC helper | `listenFileDrag()` in `src/lib/ipc.ts` — subscribes to `tauri://drag-over`, `tauri://drag-drop`, `tauri://drag-leave` |
| Hit testing | Drop position (physical pixels ÷ `devicePixelRatio`) tested against `.chat-pane` bounds |
| Path resolution | Each dropped path becomes an `abs-path` chip via `addAbsolutePathAttachment()` — same shape as explorer drags |
| Dir detection | `listDir(null, path)` distinguishes files from folders |

In web-only mode (`pnpm dev:web`), falls back to `text/uri-list` parsing.

### Chip icons and click-to-open

| Chip kind | Icon | Click action (not on ×) |
|-----------|------|-------------------------|
| File | `FileIcon` (matches explorer icon theme) | Open in editor |
| Folder | `FileIcon` (dir) | Open in OS file manager (`openExternalUrl`) |
| Image / video / audio | `FileIcon` + tinted border | Open with OS default app |
| Element (e.g. `h1`, `div`) | `</>` glyph | Grep workspace for element text/id/class → open file at matching line |

Element source location uses `grepWorkspace()` with needles extracted from the inspector payload, then `sidebar:goto-line` for highlight.

**Files changed:** `src/modules/agent/ChatPane.svelte`, `src/modules/explorer/FileTreeRow.svelte`, `src/lib/ipc.ts`

---

## 4. Settings — Experimental Section: Names Only ✅

The inline "Experimental" badge/pill has been removed from each feature row within the Experimental settings section. The section heading is sufficient context.

**Also removed:** "Experimental" badge from sidebar navigation items (`{#if s.experimental}` block deleted).

**Files changed:** `src/modules/settings/ExperimentalSettings.svelte`, `src/modules/settings/SettingsPane.svelte`

---

## 5. Settings — Ollama & llama.cpp Hyperlinks ✅

All `<a>` tags in the Ollama and llama.cpp settings sections now use `onclick={(e) => { e.preventDefault(); void openExternalUrl(url); }}` instead of `target="_blank"`. This uses the `openExternalUrl` IPC function (wraps `@tauri-apps/plugin-shell` `open()`), which opens URLs in the system browser without navigating the Tauri webview.

Links converted: `ollama.com`, `llama.cpp` GitHub releases, six GGUF HuggingFace model links, "all GGUF models" link.

**Files changed:** `src/modules/settings/SettingsPane.svelte`

---

## 6. Compaction — Enable by Default ✅

Factory defaults changed in `DEFAULT_AGENT_COMPACTION`:

| Setting | Old | New |
|---------|-----|-----|
| `enabled` | `false` | `true` |
| `autoCompact` | `false` | `true` |
| `compactThreshold` | `0.9` | `0.85` |

Migration safety: `normalizeAgentCompaction` uses `base.enabled === true` (explicit boolean check), so existing users with `false` stored keep their preference. Only new installs or absent keys pick up the new defaults.

**Files changed:** `src/lib/agentCompaction.ts`

---

## 7. First-Window Version & Update Status Bar ✅

A `<footer class="version-bar">` strip was added to `WelcomeScreen.svelte`. It is Tauri-only (`{#if desktop && appVersion}`).

**Layout (left → right):**
```
v0.1.2  │  Update available — v0.1.3            ●
```

- Version string left-aligned
- Separator `│` + "Update available — vX.Y.Z" button (amber, opens `spacebareditor.com/downloads`) — shown only when `updateState === "update-available"`
- `flex: 1` spacer
- Colored dot right-aligned: green (up to date) · amber (update available) · grey (checking)

**Update check:** `checkForUpdates()` fetches `https://api.github.com/repos/Jiguey/spacebar-editor/releases/latest` with a 5 s timeout. Semver comparison via 3-part integer parse. Fire-and-forget; network failure leaves the dot grey.

**Files changed:** `src/modules/workspace/WelcomeScreen.svelte`

---

## 8. App Identity ✅

`src-tauri/tauri.conf.json` already has `"productName": "Spacebar Editor"`. No change required.

---

## 9. Implementation Notes

Items §2–§8 implemented 2026-06-09; §3 chip polish (native drop, icons, click-to-open) completed 2026-06-10. Key design choices:

- **No `target="_blank"`** anywhere in Tauri — all external URLs go via `openExternalUrl()` IPC.
- **Contenteditable composer** required migrating `inputValue =` write sites to `setComposerText()` / `clearComposer()` helpers. Chips moved to a separate `.composer-attachments` row (not inline in contenteditable), which simplified the DOM lifecycle: `pendingAttachments` is a plain reactive array and no `chipMap` or `syncAttachmentsFromDom` is needed.
- **Chip CSS scoped** — chips are declared in the Svelte template so Svelte's scoped hash applies normally; no `:global()` is needed.
- **Compaction migration safety** — `normalizeAgentCompaction` uses strict boolean equality, not truthiness, to detect stored user preference.
