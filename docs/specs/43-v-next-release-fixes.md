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
| §3 | Chat UX | Drag file or folder into chat for context (inline chips) | ✅ Done |
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

Files and folders can be dragged from the OS file manager or the in-app explorer into the chat area. Each item appears as an **inline chip** within the chat composer's contenteditable input (not above it).

### Architecture

- **Drop detection:** `.chat-pane` has `ondragover`/`ondragleave`/`ondrop` handlers. `chatDropCounter` tracks enter/leave nesting for accurate overlay display.
- **Chip insertion:** `insertChipInComposer(att)` creates a `<span contenteditable="false" class="attachment-chip">` element, inserts it at the current cursor (or appends), then places the cursor in a text node immediately after the chip so typing continues inline.
- **Pending state:** `PendingAttachment` union type (`browser-file | dir-entry | abs-path`). The `chipMap: Map<HTMLElement, PendingAttachment>` maps each DOM chip to its attachment data (File objects cannot be serialized to data attributes).
- **Content resolution:** `resolveAttachments()` reads file content at send time — browser files via `File.text()`, directories via `FileSystemDirectoryEntry.createReader()`, absolute paths via `readFile`/`listDir` IPC.
- **Sync:** `onComposerInput()` → `syncAttachmentsFromDom()` re-derives `pendingAttachments` from chip DOM nodes after any browser-native edit (Backspace over chip, etc.).
- **Explorer drag source:** `FileTreeRow.svelte` sets `draggable={true}` and `ondragstart` with `application/spacebar-path` + `text/plain` MIME types.

### Contenteditable Composer

The chat composer was migrated from `<textarea>` to a `<div contenteditable="true">`:

| Old | New |
|-----|-----|
| `<textarea bind:value={inputValue}>` | `<div contenteditable role="textbox" bind:this={composerEl}>` |
| `inputValue` managed by Svelte | `inputValue` synced from DOM via `onComposerInput()` |
| Chips above textarea | Chips inline with text |

Helper functions: `getComposerText()`, `setComposerText()`, `clearComposer()`, `appendTextToComposer()`, `insertChipInComposer()`.

Paste handler strips rich HTML (plain text only). Chip CSS uses `:global()` selectors since elements are created via `document.createElement`.

**Files changed:** `src/modules/agent/ChatPane.svelte`, `src/modules/explorer/FileTreeRow.svelte`

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

All items implemented in session 2026-06-09. Key design choices:

- **No `target="_blank"`** anywhere in Tauri — all external URLs go via `openExternalUrl()` IPC.
- **Contenteditable composer** required migrating 5 `inputValue =` write sites and adding `chipMap` for File-object lifecycle management across DOM mutations.
- **Chip CSS `:global()`** — necessary because chip DOM elements are created imperatively (not via Svelte template), so Svelte's scoped hash is not applied to them.
- **Compaction migration safety** — `normalizeAgentCompaction` uses strict boolean equality, not truthiness, to detect stored user preference.
