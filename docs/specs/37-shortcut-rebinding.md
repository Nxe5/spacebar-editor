# Spec 37 — Shortcut Rebinding

> **Status:** ✅ Implemented — filter, edit/capture mode, conflict detection, per-row and reset-all, localStorage persistence via `shortcutOverrides`; `dispatchWithOverrides` makes rebindings live immediately.
> **Area:** Settings · UX · Shortcuts
> **Phase:** C — Enhancement
> **Depends on:** [05-workbench.md](05-workbench.md) · [30-agent-context-and-model-settings.md](30-agent-context-and-model-settings.md)

---

## 1. Current State

The shortcut infrastructure already exists:

| File | Role |
|------|------|
| `src/modules/shortcuts/registry.ts` | Central registry — maps action IDs to handler functions |
| `src/modules/shortcuts/dispatcher.ts` | Keyboard event listener — resolves key combos to action IDs |
| `src/modules/shortcuts/defaults.ts` | Default key bindings — a `Record<string, string>` of action ID → key string |

The infrastructure is complete. Bindings are persisted via `shortcutOverrides` in `localStorage`.

The settings navigation has a `keybindings` nav item. The UI (filter, edit/capture, conflict detection, per-row reset, reset-all) is implemented in `KeybindingsSettings.svelte`.

### `openSettings` shortcut

`Mod+,` maps to the `openSettings` action, which calls `openSettingsModal()` in `WorkbenchShell.svelte`. This opens the same modal as the gear icon in the status bar. The previous `openSettingsPopout()` path (which opened a separate Tauri window) has been removed — settings are always opened as an in-window modal.

---

## 2. Settings UI — Keybindings Section

### 2.1 Layout

```
┌─ Keybindings ────────────────────────────────────────────────┐
│                                                               │
│  Customize keyboard shortcuts. Changes take effect           │
│  immediately.                                [Reset all]      │
│                                                               │
│  Filter shortcuts...  [____________________]                  │
│                                                               │
│  Action                    Binding              Controls      │
│  ─────────────────────────────────────────────────────────── │
│  Send message              Ctrl+Enter           [Edit] [↺]   │
│  New chat                  Ctrl+T               [Edit] [↺]   │
│  Open folder               Ctrl+O               [Edit] [↺]   │
│  Focus composer            Escape               [Edit] [↺]   │
│  Toggle sidebar            Ctrl+B               [Edit] [↺]   │
│  Open settings             Ctrl+,               [Edit] [↺]   │
│  Switch to Chat mode       Ctrl+1               [Edit] [↺]   │
│  Switch to Plan mode       Ctrl+2               [Edit] [↺]   │
│  Switch to Agent mode      Ctrl+3               [Edit] [↺]   │
│  Compact context           Ctrl+Shift+K         [Edit] [↺]   │
│  ...                                                         │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

- **Filter** input: live-filters the table by action label (case-insensitive contains match)
- **Reset all**: resets all bindings to defaults; shows a confirmation dialog first
- **[Edit]**: enters binding capture mode for that row (§2.2)
- **[↺]**: resets that individual binding to its default; only shown when the binding differs from the default

### 2.2 Binding Capture Mode

Clicking **[Edit]** on a row:

1. The binding cell changes to a capture input: `[ Press a key... ]`
2. The next keypress (with any modifiers) is captured as the new binding
3. The key combo is normalized to the `dispatcher.ts` format (e.g. `"ctrl+shift+p"`)
4. If the key combo conflicts with an existing binding: show an inline warning below the row (§2.3)
5. The binding is saved regardless of conflict — the user can resolve manually
6. Pressing **Escape** during capture cancels without saving

```
│  Open command palette      Ctrl+P               [Save] [Cancel] │
│  ⚠ Conflicts with "Open file" (Ctrl+P) — both will trigger       │
```

Capture handles:
- Letter/number keys with modifiers: `ctrl+shift+p`, `alt+t`, `ctrl+1`
- Function keys: `f1`–`f12`, `ctrl+f5`, etc.
- Special keys: `enter`, `escape`, `space`, `backspace`, `tab`, `arrowup`, etc.
- Modifiers: `ctrl`, `shift`, `alt`, `meta` (Meta = Cmd on macOS, Win on Windows/Linux)

### 2.3 Conflict Detection

A conflict exists when two different action IDs map to the same key string. When a conflict is detected:

- Yellow warning text appears below the conflicting row: `⚠ Conflicts with "[other action label]"`
- Both conflicting rows get the warning (so the user can find the other binding to change)
- The binding is saved — conflicts are allowed, and the user is responsible for resolving them
- When a conflict warning is present, clicking **[Edit]** on the other conflicting action is the easiest resolution path

The dispatcher resolves conflicts by action registration order — the first registered action wins. This is documented in the warning text: `⚠ Conflicts with "Send message" — "Send message" will take priority.`

---

## 3. Storage

### 3.1 Key

```
localStorage key: sidebar.keybindings.v1
```

### 3.2 Format

```typescript
type KeybindingsStore = Record<string, string>
// { "send-message": "ctrl+enter", "new-chat": "ctrl+t", ... }
```

Only actions where the binding **differs from the default** are stored. This means:
- An empty object means all defaults
- Adding a new default in a future release is automatically picked up
- Resetting a single binding removes it from the store (not sets it to the default)

### 3.3 Merge with Defaults

At app startup, in `registry.ts`:

```typescript
const stored: KeybindingsStore = JSON.parse(
  localStorage.getItem('sidebar.keybindings.v1') ?? '{}'
)
// Merge: stored values override defaults
const activeBindings = { ...defaults, ...stored }
// Register all bindings
for (const [actionId, keyString] of Object.entries(activeBindings)) {
  dispatcher.bind(keyString, registry.getHandler(actionId))
}
```

Changes from the settings UI update `localStorage` and re-register the changed binding with the dispatcher immediately — no reload required.

---

## 4. Chord Shortcuts

Chord shortcuts (two-key sequences, e.g. `ctrl+k ctrl+f`) are **not supported in v1**.

The capture UI accepts single key combos only. If the user presses a second key while in capture mode, it is treated as the new binding (the first key press result is discarded). A note in the UI explains this: "Single key combinations only — chord shortcuts are not supported."

---

## 5. Key String Format

Key strings use the existing `dispatcher.ts` format:

- Modifiers: `ctrl`, `shift`, `alt`, `meta` — always lowercase, always before the key
- Key: lowercase letter, digit, or named key (`enter`, `escape`, `space`, `backspace`, `tab`, `arrowup`, `arrowdown`, `arrowleft`, `arrowright`, `f1`–`f12`)
- Separator: `+`
- Examples: `ctrl+enter`, `ctrl+shift+p`, `alt+f4`, `f5`, `escape`

Normalization in the capture handler:

```typescript
function normalizeKeyEvent(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('ctrl')
  if (e.shiftKey) parts.push('shift')
  if (e.altKey) parts.push('alt')
  if (e.metaKey) parts.push('meta')
  parts.push(e.key.toLowerCase())
  return parts.join('+')
}
```

---

## 6. Default Shortcuts

The full default shortcut table is defined in `defaults.ts`. The following are the current defaults (documented here for reference):

| Action ID | Label | Default binding |
|-----------|-------|----------------|
| `send-message` | Send message | `ctrl+enter` |
| `new-chat` | New chat | `ctrl+t` |
| `open-folder` | Open folder | `ctrl+o` |
| `focus-composer` | Focus composer | `escape` |
| `toggle-sidebar` | Toggle sidebar | `ctrl+b` |
| `open-settings` | Open settings | `ctrl+,` |
| `mode-chat` | Switch to Chat mode | `ctrl+1` |
| `mode-plan` | Switch to Plan mode | `ctrl+2` |
| `mode-agent` | Switch to Agent mode | `ctrl+3` |
| `compact-context` | Compact context | `ctrl+shift+k` |
| `next-chat-tab` | Next chat tab | `ctrl+tab` |
| `prev-chat-tab` | Previous chat tab | `ctrl+shift+tab` |

This list will expand as new shortcuts are added. The settings UI shows all registered shortcuts, not just this list.

---

## 7. Files to Change

| File | Change |
|------|--------|
| `src/modules/shortcuts/registry.ts` | Add persistence load at startup; add `rebind(actionId, keyString)` method; re-register on change |
| `src/modules/settings/SettingsPane.svelte` | Mount `KeybindingsSection` for the `keybindings` nav item |
| `src/modules/settings/KeybindingsSection.svelte` | New — table UI, filter input, capture mode, conflict detection, reset controls |

The `dispatcher.ts` and `defaults.ts` files are not modified — they remain the infrastructure layer.

---

*Spec created: 2026-06-01*
