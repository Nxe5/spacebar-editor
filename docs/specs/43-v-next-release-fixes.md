# Spec 43 — v-next Release Fixes

> **Status:** 🔷 **Planned**
> **Area:** Theming · Model Selector · Chat UX · Settings · Compaction · Update Check · App Identity
> **Phase:** B — Polish & reliability before broader distribution
> **Depends on:** [13-theming.md](13-theming.md) · [21-context-compaction.md](21-context-compaction.md) · [27-local-model-ux.md](27-local-model-ux.md) · [30-agent-context-and-model-settings.md](30-agent-context-and-model-settings.md) · [36-first-run-onboarding.md](36-first-run-onboarding.md)

---

## 1. Overview

This spec captures eight focused fixes and improvements identified for the next release. Each is self-contained; they can be implemented independently and in any order.

| # | Area | Summary |
|---|------|---------|
| §2 | Model Selector | Show provider titles even when no models available |
| §3 | Chat UX | Drag file or folder into chat for context |
| §4 | Settings | Experimental section — names only, drop redundant label |
| §5 | Settings | Ollama & llama.cpp help links — make them clickable |
| §6 | Compaction | Enable compaction and auto-compaction by default at 85% |
| §7 | Status Bar | App version indicator + update check in first-window footer |
| §8 | App Identity | Show "Spacebar Editor" as process name on macOS |

---

## 2. Model Selector — Always Show Provider Titles

### 3.1 Problem

When the user opens the model picker and a provider has no models configured or available, its section header disappears entirely. This makes it unclear whether the provider is unsupported, not installed, or simply has no models pulled yet.

### 3.2 Requirement

The model selector must always render section headers for all four providers:

- **Ollama**
- **llama.cpp**
- **Anthropic**
- **DeepSeek**

When a provider section has no models to list, show the header as normal and add a subdued "unavailable" line beneath it — for example:

```
Ollama
  No models available

llama.cpp
  No models available

Anthropic
  gpt-4.1 …

DeepSeek
  deepseek-coder …
```

The "unavailable" text should use a muted/secondary foreground color and carry no action. It is purely informational — the user should be able to understand at a glance which backends are live vs. not configured.

For Ollama: unavailable = Ollama server not reachable **or** no models pulled.
For llama.cpp: unavailable = no server endpoint configured or server not responding.
For Anthropic / DeepSeek: unavailable = no API key stored.

### 2.3 Acceptance

- [ ] Killing the Ollama service: the "Ollama" header remains visible with "No models available".
- [ ] No API key for Anthropic: "Anthropic" header visible with "No models available".
- [ ] At least one model present: the list renders normally, no "unavailable" line.
- [ ] Section order is stable regardless of availability (Ollama → llama.cpp → Anthropic → DeepSeek).

---

## 3. Drag File or Folder into Chat for Context

### 3.1 Problem

Users have no way to quickly reference a file or directory from outside the opened workspace — or from the file explorer — by dragging it into the chat input. Today they must manually type paths or use context tools.

### 3.2 Requirement

The chat input area (and the full chat pane drop surface) must accept `dragover` / `drop` events for:

- Files dragged from the **OS file manager** (Finder, Nautilus, Explorer).
- Files or folders dragged from the **Spacebar Editor file explorer**.

On drop, the dragged item is appended to the chat as a **context attachment** before the user sends their message:

| Drop type | Behavior |
|-----------|----------|
| Single file | Read file contents (up to a reasonable size limit, e.g. 200 KB). Attach as a fenced code block labelled with the filename. |
| Folder | List the folder's immediate children (non-recursive, directory names suffixed with `/`). Attach as a plain text listing labelled with the folder path. |
| Multiple items | Each item processed as above; attached in order. |

The attachment is shown in the chat composer as a pill/chip above the textarea (similar to how image attachments work if applicable) so the user can see and remove it before sending.

If the file is binary or exceeds the size limit, show a short inline notice: "File too large to attach — path added instead." and insert the path as plain text.

### 3.3 Drag sources

| Source | Mechanism |
|--------|-----------|
| OS file manager | `DataTransfer.files` (HTML5 File API via Tauri webview) |
| File explorer pane | Internal drag event carrying the explorer node's absolute path |

For the file explorer source: intercept the existing drag-start on tree nodes and add the file path to the transfer data (`text/plain` + a custom `application/spacebar-path` type). The chat drop handler reads the custom type preferentially.

### 3.4 Visual feedback

- Chat drop zone highlights with a subtle border/overlay on `dragover`.
- Overlay text: "Drop to add as context".
- Overlay dismisses on `dragleave` / `drop`.

### 3.5 Acceptance

- [ ] Drag a `.ts` file from Finder into chat: file content appears as an attachment chip; sent message includes fenced code block.
- [ ] Drag a folder from Finder: folder listing appended.
- [ ] Drag a file from the explorer pane: same as OS drag.
- [ ] Drag multiple files: all attach.
- [ ] File > 200 KB: path-only fallback with notice.
- [ ] Drop outside the chat input (e.g. on the editor) does not trigger attachment.

---

## 4. Settings — Experimental Section: Names Only

### 4.1 Problem

In Settings → Experimental, each feature card or row currently shows the feature name alongside a redundant "Experimental" badge/label next to it. Because the user is already in the Experimental section, the repeated label adds noise.

### 4.2 Requirement

Within the Experimental settings section, remove the inline "Experimental" badge or tag that appears next to each individual feature name. The section heading "Experimental" is sufficient context. Feature names should stand alone.

This is a pure UI cleanup — no behavior change.

### 4.3 Acceptance

- [ ] Settings → Experimental: each toggle/feature shows only its name and description; no "Experimental" chip next to the name.
- [ ] The section header "Experimental" remains.

---

## 5. Settings — Ollama & llama.cpp Hyperlinks Made Clickable

### 5.1 Problem

The Settings pages for the Ollama and llama.cpp providers contain help text with URLs (e.g. links to the Ollama install docs, the llama.cpp releases page, or the project website). These render as plain text and cannot be clicked.

### 5.2 Requirement

Identify all anchor (`<a>`) tags or plain-text URLs in the Ollama settings section and the llama.cpp settings section that are not already wired to `shell.open()`. Make each one open in the user's default browser via Tauri's `shell.open(url)` (or the `@tauri-apps/plugin-shell` equivalent already used elsewhere in the app).

Do **not** allow link navigation inside the webview — every external link must use `shell.open`.

### 5.3 Files to check

- `src/lib/settings/` — provider-specific settings panels for Ollama and llama.cpp.
- Search for `href=` or raw URL strings in those components.

### 5.4 Acceptance

- [ ] Every link in the Ollama settings section opens the correct URL in the system browser.
- [ ] Every link in the llama.cpp settings section opens the correct URL in the system browser.
- [ ] No link navigates the Tauri webview itself.

---

## 6. Compaction — Enable by Default

### 6.1 Problem

Context compaction ([Spec 21](21-context-compaction.md)) is implemented and load-bearing for long sessions, but ships with compaction disabled and auto-compaction disabled by default. New users who do not discover the Experimental section lose session continuity silently as context fills up.

### 6.2 Requirement

Change the **factory defaults** for new installs (and for existing users who have never touched the compaction settings):

| Setting | Old default | New default |
|---------|-------------|-------------|
| Compaction enabled | `false` | **`true`** |
| Auto-compaction enabled | `false` | **`true`** |
| Auto-compaction threshold | (previously `90%` or unset) | **`85%`** |

Migration rule: if a user's stored settings already contain an explicit value for these keys (i.e. they toggled them), **do not override** their choice. Only apply the new defaults on fresh installs or when the key is absent from the persisted settings object.

### 6.3 Settings UI

The Experimental → Compaction section should reflect these new defaults visually — both toggles pre-checked and the threshold slider sitting at 85% for a user who has never changed them.

### 6.4 Acceptance

- [ ] Fresh install: Compaction on, Auto-compaction on, threshold 85%.
- [ ] Existing user with `compactionEnabled: false` stored: their preference is unchanged after upgrade.
- [ ] Threshold slider in Settings shows 85% on first open.
- [ ] Long session (~85% context used) triggers auto-compaction without user action.

---

## 7. First-Window Status Bar — Version & Update Indicator

### 7.1 Problem

Users have no in-app way to know what version they are running or whether a newer release is available.

### 7.2 Requirement

Add a **status bar strip** at the bottom of the first/welcome window (the window shown before a workspace is opened, i.e. the launcher/onboarding screen). It contains:

| Element | Description |
|---------|-------------|
| App version | Current app version string (e.g. `v0.1.2`), read from `tauri.conf.json` `version` at build time or via `app.getVersion()`. |
| Status indicator | A small colored dot or badge next to the version. **Green** = up to date. **Amber/Orange** = update available. |
| Update button | Shown only when a newer release is detected. Label: "Download update". Opens `https://spacebareditor.com/downloads` in the system browser via `shell.open`. |

### 7.3 Update check mechanism

On window load (and at most once per app session), fetch the latest release from the GitHub Releases API:

```
GET https://api.github.com/repos/Jiguey/spacebar-editor/releases/latest
```

Parse the `tag_name` field (e.g. `v0.1.3`). Compare with the running version using semver. If `tag_name > currentVersion`, mark the indicator amber and show the "Download update" button.

The fetch should be **fire-and-forget** with a reasonable timeout (5 s). On network failure, timeout, or non-2xx response, leave the indicator neutral (no dot / grey) — never block startup on this check.

Cache the result in memory for the app session. Do not persist it to disk; re-check on next cold start.

### 7.4 Implementation notes

- The GitHub API does not require authentication for public repos; no token needed.
- Use Tauri's `http` plugin (`@tauri-apps/plugin-http`) for the fetch rather than browser `fetch`, to avoid CORS issues with the GitHub API from within the webview.
- Version comparison: strip leading `v` from both strings before comparing with a semver library or a simple three-part integer comparison.
- The status bar should be visually light — a single line, same height as a standard status bar (~22 px). It does not replace any existing UI.

### 7.5 Acceptance

- [ ] Running the latest release: version string visible, green dot, no button.
- [ ] Running an older release (tested by spoofing version or tag): amber dot + "Download update" button visible.
- [ ] Clicking "Download update" opens `https://spacebareditor.com/downloads` in the system browser.
- [ ] Network unavailable: status bar shows version string with neutral/grey state; startup not delayed.
- [ ] Status bar appears only on the first/welcome window, not inside the workspace.

---

## 8. macOS Process Name — "Spacebar Editor"

### 8.1 Problem

On macOS, Activity Monitor (and similar tools) shows the process as `tauri://localhost` or the bundle identifier rather than a human-readable application name. Users cannot easily identify the running process.

### 8.2 Requirement

The macOS process name shown in Activity Monitor and in `ps` output must be **Spacebar Editor**.

This is controlled by the `CFBundleName` and `CFBundleDisplayName` keys in the app's `Info.plist`, which Tauri generates from `tauri.conf.json`. Verify:

```json
// src-tauri/tauri.conf.json  (or tauri.conf.json at repo root)
{
  "productName": "Spacebar Editor",
  "bundle": {
    "identifier": "com.spacebareditor.app",
    "name": "Spacebar Editor"
  }
}
```

If either `productName` or `bundle.name` is set to something other than `Spacebar Editor` (e.g. `tiny-llama`, `sidebar`, or a generic identifier), update them.

On macOS, Tauri uses `productName` as the process name surfaced in Activity Monitor. Confirm the resulting `.app` bundle's `Info.plist` contains:

```xml
<key>CFBundleName</key>
<string>Spacebar Editor</string>
<key>CFBundleDisplayName</key>
<string>Spacebar Editor</string>
```

No Rust code change should be needed — this is configuration only.

### 8.3 Acceptance

- [ ] macOS build: Activity Monitor → Process Name column shows `Spacebar Editor`.
- [ ] `ps aux | grep -i spacebar` returns the running process.
- [ ] `.app` bundle is named `Spacebar Editor.app`.

---

## 9. Implementation Order

These items are independent; suggested shipping order prioritizes user-visible polish first:

| Priority | Item | § | Effort |
|----------|------|---|--------|
| 1 | Compaction defaults | §6 | XS — defaults change only |
| 2 | Experimental section label cleanup | §4 | XS — template change |
| 3 | Ollama / llama.cpp links | §5 | XS — `shell.open` wiring |
| 4 | Process name (macOS config) | §8 | XS — config change |
| 5 | Model selector always shows providers | §2 | S — conditional render |
| 6 | Status bar + update check | §7 | M — new component + API fetch |
| 7 | File/folder drag to chat | §3 | M — drop handler + attachment UI |

---

## 10. Acceptance (program-level)

- [ ] Model selector never hides a provider header, regardless of availability.
- [ ] Dragging a file from Finder into the chat attaches its content.
- [ ] Experimental settings rows show names only — no "Experimental" tag inline.
- [ ] All provider help links in Settings open in the system browser.
- [ ] Fresh install has compaction + auto-compaction on at 85%.
- [ ] Welcome window footer shows the running version with a green/amber update indicator.
- [ ] macOS Activity Monitor lists the process as `Spacebar Editor`.
