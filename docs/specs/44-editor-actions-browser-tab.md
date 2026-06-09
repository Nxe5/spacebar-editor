# Spec 44 — Editor Actions Menu, Browser Tab & Element Inspector

> **Status:** 🔶 **Partial** (§2, §4, §5, §6 complete; §3 save-as dialog pending Rust command)
> **Area:** Workbench · Editor Tab Bar · Preview Tab · Chat UX
> **Phase:** B — Polish & capability expansion
> **Depends on:** [05-workbench.md](05-workbench.md) · [10-editor.md](10-editor.md) · [08-ai-agent.md](08-ai-agent.md)

---

## 1. Overview

This spec covers four related improvements to the editor/workbench area:

| # | Area | Summary | Status |
|---|------|---------|--------|
| §2 | Editor Actions Button | `···` menu in editor tab bar — new file, terminal, browser | ✅ Implemented |
| §3 | New File flow | Untitled editor buffer; save-as dialog on first save | 🔶 Partial |
| §4 | Browser Tab UI | In-editor browser with nav controls, URL bar | ✅ Implemented |
| §5 | Element Inspector | Click-to-inspect → insert chip into chat composer | ✅ Implemented |
| §6 | Welcome Screen | Remove Tutorial button; version bar layout | ✅ Implemented |

---

## 2. Editor Actions Button (`···`)

### 2.1 Placement

A round `···` (DotsThree) button sits to the **left** of the editor tab scroll area in `WorkbenchTabBar.svelte`, matching the style of the `+` (New Chat) button in `ChatTabBar.svelte`.

```
[ ··· ] [ tab1 ] [ tab2 ] [ + ]   ←  editor tab strip
```

The button opens a small popup menu anchored below-left of the button. Clicking anywhere outside the menu closes it.

### 2.2 Menu Items

| Item | Icon | Action |
|------|------|--------|
| New file | FilePlus | Create untitled editor buffer in workspace root |
| Open terminal | Terminal | Spawn PTY tab in project directory |
| Open browser | GlobeSimple | Add a preview tab with empty URL |

### 2.3 Implementation

- **Component:** `src/modules/workbench/WorkbenchTabBar.svelte`
- **State:** `menuOpen: boolean`, `menuBtnEl`, `menuEl` (for outside-click detection)
- **Outside close:** `svelte:window onpointerdown` — compares target against button and menu refs
- **Icons:** `phosphor-svelte` — `DotsThreeIcon`, `FilePlusIcon`, `GlobeSimpleIcon`, `TerminalIcon`

### 2.4 Acceptance Criteria

- [ ] Button visible at all times to left of editor tab list (with or without open workspace)
- [ ] Menu opens on click, closes on outside click or second button click
- [ ] Keyboard: `Escape` closes the menu, focus returns to trigger button
- [ ] All three actions fire correctly (see §3–4 for full specs)

---

## 3. New File Flow

### 3.1 Current Behavior (implemented)

Clicking "New file" when a workspace is open:

1. Increments a session counter (1, 2, …)
2. Creates path `{workspacePath}/untitled-{N}`
3. Calls `workbench.openEditorFile({ content: "", isDirty: true, language: "plaintext" })`
4. Tab title shows `untitled-1`, marked dirty (dot indicator)

If no workspace is open, shows a toast: "Open a project folder first."

### 3.2 Save-As Dialog (pending — requires Rust command)

On **first save** (Ctrl+S / Cmd+S) for an untitled file, the editor should trigger a native "Save As" dialog instead of writing to the synthetic `untitled-N` path.

**Required IPC addition:**

```rust
// src-tauri/src/commands/fs.rs
#[tauri::command]
async fn pick_save_path(
    app: AppHandle,
    default_name: Option<String>,
    default_dir: Option<String>,
) -> Result<Option<String>, String>
```

```typescript
// src/lib/ipc.ts
export async function pickSavePath(
  defaultName?: string,
  defaultDir?: string,
): Promise<string | null>
```

**Save flow for untitled files:**

1. User presses Ctrl+S
2. Editor detects path starts with `untitled:` or `{workspacePath}/untitled-`
3. Calls `pickSavePath(tab.title, workspacePath)`
4. If user picks a path: `writeFile(workspacePath, pickedPath, content)`, then `workbench.renameEditorTabPath(oldPath, pickedPath, newName)`
5. If user cancels: no-op

### 3.3 Acceptance Criteria

- [ ] Untitled file opens immediately as a dirty editor tab
- [ ] Tab title `untitled-N` with `●` dirty indicator
- [ ] Ctrl+S on an untitled file opens native save dialog (requires §3.2 IPC)
- [ ] After save, tab title updates to the chosen filename, dirty indicator clears

---

## 4. Browser Tab

### 4.1 Implementation

**Component:** `src/modules/preview/PreviewPane.svelte` — rendered when `tab.kind === "preview"`.

Toolbar layout (left → right):

```
[ ← ] [ → ] [ ↺ ] [ url bar __________ ] [Go] [:3000] [:14200]   ···spacer···   [Select element]
```

| Control | Behavior |
|---------|---------|
| `←` Back | `iframe.contentWindow.history.back()` (swallows cross-origin errors) |
| `→` Forward | `iframe.contentWindow.history.forward()` |
| `↺` Reload | Sets `iframe.src = loadedUrl` |
| URL bar | Bound to `urlInput`; Enter calls `navigate()` |
| Go button | Calls `navigate()` |
| `:3000` / `:14200` | Sets URL to `http://127.0.0.1:{port}` and navigates |
| Select element | Toggles inspect mode (see §5) |

**URL security:** `isLocalPreviewUrl()` gates all navigation — only `http://localhost:*` and `http://127.0.0.1:*` are accepted. An error hint appears inline for rejected URLs.

**Tauri CSP:** `frame-src` in `tauri.conf.json` explicitly allows `http://localhost:* http://127.0.0.1:*`. The `sandbox` attribute is intentionally **omitted** — WebKitGTK (Tauri/Linux) renders sandboxed cross-port iframes blank.

**Inspect mode interaction:** URL changes cancel any active inspect mode (`$effect` + `untrack(() => inspecting)`).

### 4.2 Acceptance Criteria

- [x] Back/forward/reload buttons present; reload works
- [x] URL bar navigates on Enter or Go click
- [x] :3000 and :14200 quick-navigate buttons
- [x] Non-localhost URLs rejected with inline error
- [x] Empty-URL state shows placeholder

---

## 5. Element Inspector ("Select element")

### 5.1 Implementation

**Same-origin only** (Option A). Cross-origin pages show a toast: "Cannot inspect cross-origin pages."

**Activation:** `startInspecting()` — accesses `iframe.contentDocument`, injects `<style id="__sb_insp_style">` with crosshair cursor + `.__sb_hover` outline rule, attaches `mouseover`/`mouseout`/`click`/`keydown` listeners to the iframe document.

**Highlight color:** `$derived($settings.inspectorHighlightColor || "#ff6b8b")` — configurable in Settings → Appearance → Browser inspector. The injected style uses the runtime color value; the overlay border and hint pill use inline `style="border-color: {highlightColor};"`.

**Svelte 5 reactivity fix:** The `$effect` that cancels inspect mode on URL change reads `inspecting` via `untrack(() => inspecting)` to avoid a feedback loop where setting `inspecting = true` would immediately re-fire the effect.

**`.__sb_hover` cleanup:** The class is filtered from the captured element's class list before building the event detail, so it never appears in the chip label.

### 5.2 Composer Integration

When an element is picked, a `spacebar:element-selected` CustomEvent fires on `window` with `detail.text` = the full element summary string:

```
[Selected element: button
  Text: "Submit form"
  Path: button#submit-btn
  Position: top=210px, left=140px, 96×34px]
```

`ChatPane.svelte` listens and calls `insertChipInComposer({ kind: "element", name, text })` — inserting a **compact chip** (not raw text). The chip `name` is just the tag name (`button`, `div`, etc.) extracted from the first line. The full `text` is stored on the attachment and expanded in `resolveAttachments()` when the message is sent.

**Chip appearance:** `data-kind="element"` — pink border (`rgba(255,107,139,0.5)`) + faint pink background, matching the inspector highlight color family.

### 5.3 PendingAttachment type

```typescript
type PendingAttachment =
  | { kind: "browser-file"; name: string; file: File }
  | { kind: "dir-entry";    name: string; entry: FileSystemDirectoryEntry }
  | { kind: "abs-path";     name: string; path: string }
  | { kind: "element";      name: string; text: string };  // ← added
```

### 5.4 Acceptance Criteria

- [x] "Select element" button toggles inspect mode; button shows "Stop" state while active
- [x] Hovering iframe elements shows configurable-color outline (default `#ff6b8b`)
- [x] Clicking an element exits inspect mode and inserts a compact chip into the chat composer
- [x] Chip shows just the tag name (e.g. `div`, `button`); chip can be removed with × or Backspace
- [x] Full element detail is sent to the LLM when the message is submitted
- [x] Cross-origin iframes show toast; same-origin inspection works
- [x] Escape inside the iframe cancels inspection
- [x] Highlight color is editable in Settings → Appearance → Browser inspector

---

## 6. Welcome Screen Cleanup

### 6.1 Tutorial Button Removal

The "Tutorial" button (disabled, `title="Coming in v0.1.1"`) has been removed from the welcome screen. The action row now contains only "Open project folder".

**Files changed:**
- `src/modules/workspace/WelcomeScreen.svelte` — removed `<button class="btn ghost">Tutorial</button>` and its CSS (`.btn.ghost`, `.btn.ghost:hover`)

### 6.2 Version Bar Layout

The welcome screen footer status bar layout changed:

**Before:** `[dot] [version] [update button]` — dot on the far left

**After:** `[version] [│] [update button]` … `[dot]` — version left, dot pinned right

```
v0.1.2  │  Update available — v0.1.3            ●
```

- Version string (`v{appVersion}`) on the left
- Separator (`│`) + update button only when `updateState === "update-available"`
- `flex: 1` spacer pushes the dot to the far right
- Dot color: green (up-to-date) · amber (update available) · grey (checking)
- Dot has `title` tooltip describing the state
