# Spec 47 — Terminal Smooth Scrolling & Scroll Performance

> **Status:** 📋 **Draft**
> **Area:** Terminal · Workbench UI · Settings
> **Phase:** v-next — small, self-contained
> **Depends on:** [05-workbench.md](05-workbench.md) · [12-ipc.md](12-ipc.md)

> **Related:** `src/modules/terminal/TerminalPane.svelte` · `src/lib/stores/settings.ts` · `package.json` (`@xterm/xterm`, `@xterm/addon-fit`)

---

## 1. Overview

The terminal is a near-default xterm.js 6 instance: `TerminalPane.svelte` sets only `fontFamily`, `fontSize` (hardcoded 13), and `theme`. Everything scroll-related is at its default:

| Option | Current (default) | Effect today |
|--------|-------------------|--------------|
| renderer | DOM (no addon loaded) | Scrolling re-lays-out DOM rows; visibly janky on long output and rapid `pty:data` bursts |
| `smoothScrollDuration` | `0` | Discrete mouse-wheel ticks jump line-blocks instantly — the "choppy" feel this spec addresses |
| `scrollback` | `1000` | Long build/test output silently truncates |
| `scrollSensitivity` | `1` | No user control over wheel speed |
| `fastScrollModifier` | `alt` | Works, but undocumented and its multiplier is default |

Scrollback persistence across tab switches was already fixed by keeping panes mounted (commit `04ea6a1`); this spec is about how scrolling *feels* and performs within a mounted pane.

Two distinct problems, two distinct fixes:

1. **Choppiness of discrete wheel scrolling** → xterm's built-in `smoothScrollDuration` animation. (macOS trackpads send pixel-granularity deltas and already feel continuous; this mainly benefits mouse wheels and Linux.)
2. **Low frame rate while scrolling / during heavy output** → the `@xterm/addon-webgl` renderer, which moves row rendering to a GPU texture atlas. This is the same renderer VS Code ships by default.

### Goals

- Wheel scrolling animates smoothly instead of jumping (configurable, on by default).
- Scrolling stays at frame rate during heavy output via the WebGL renderer, with automatic DOM fallback.
- Scrollback size becomes a user setting with a larger default.
- A new **Settings → Terminal** section collects these plus the currently hardcoded font size.

### Non-Goals

- Custom scrollbar UI or overlay scrollbar styling.
- Scroll-position sync between split terminals.
- Changes to `AgentTerminalOutput.svelte` (it does not use xterm; it renders captured text and is out of scope).
- Kinetic/momentum scrolling beyond what xterm + the OS provide.

---

## 2. Design

### 2.1 xterm options

`TerminalPane.svelte` constructs the terminal from settings:

```ts
term = new Terminal({
  fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
  fontSize: $settings.terminal.fontSize,             // default 13 (unchanged)
  theme: buildXtermTheme(),
  smoothScrollDuration: $settings.terminal.smoothScrolling ? 120 : 0,
  scrollback: $settings.terminal.scrollback,          // default 5000
  scrollSensitivity: $settings.terminal.scrollSensitivity, // default 1
  fastScrollSensitivity: 5,                           // Alt+wheel multiplier (fixed)
});
```

Notes:

- `smoothScrollDuration: 120` (ms) is the sweet spot used by VS Code-family terminals; values ≥ 200 feel laggy when paging through output. Exposed as a boolean toggle, not a number — the duration is an implementation constant.
- `scrollback: 5000` raises the default 5×. Memory cost is per-line metadata + text; 5 000 lines ≈ low single-digit MB per pane, acceptable given panes stay mounted. Range-clamped 200–100 000 in settings.
- `scrollSensitivity` surfaces as a 0.5×–5× slider for users with fast wheels.

### 2.2 WebGL renderer with fallback

Add dependency `@xterm/addon-webgl` (matching the installed xterm 6 major).

```ts
import { WebglAddon } from "@xterm/addon-webgl";

function tryWebgl(term: Terminal): WebglAddon | null {
  try {
    const addon = new WebglAddon();
    addon.onContextLoss(() => { addon.dispose(); });  // falls back to DOM renderer
    term.loadAddon(addon);
    return addon;
  } catch {
    return null;  // WebGL unavailable (some WebKitGTK configs) → DOM renderer
  }
}
```

- Loaded after `term.open()`, per xterm docs.
- **Context loss** (GPU reset, driver issues): dispose the addon; xterm automatically reverts to the DOM renderer. Do not retry in a loop — one attempt per pane mount.
- **Linux/WebKitGTK caveat:** WebGL availability in the Tauri webview varies by distro/driver. The `try/catch` fallback is the contract; the DOM renderer with smooth scroll enabled is the guaranteed baseline. Manual verification on the AppImage build is part of acceptance (§4).
- Disposed in the existing `teardown()` path before `term.dispose()`.

### 2.3 Settings

New `terminal` section in `sidebar.settings.v4` (additive defaults, same pattern as prior field additions):

```ts
terminal: {
  fontSize: number;            // default 13
  scrollback: number;          // default 5000, clamp 200–100000
  smoothScrolling: boolean;    // default true
  scrollSensitivity: number;   // default 1, range 0.5–5
  webglRenderer: boolean;      // default true — escape hatch for broken GPUs/drivers
}
```

UI: new **Settings → Terminal** page (or a group under General if a page feels heavy) with the five controls. Changing `fontSize`, `smoothScrolling`, `scrollSensitivity`, or `webglRenderer` applies live via `term.options.*` / addon load-dispose in the existing `$effect` pattern (the theme effect at `TerminalPane.svelte` already demonstrates live option updates). Changing `scrollback` applies to newly written lines immediately (xterm supports live resize of scrollback); no pane restart required.

After any option change that affects layout, re-run `syncPtySize()`.

---

## 3. Implementation Sketch

| Step | File | Change |
|------|------|--------|
| 1 | `package.json` | add `@xterm/addon-webgl` |
| 2 | `src/lib/stores/settings.ts` | `terminal` section + defaults + clamping |
| 3 | `src/modules/terminal/TerminalPane.svelte` | options from settings; `tryWebgl()`; live-update `$effect`; teardown |
| 4 | Settings UI | Terminal section with five controls |
| 5 | `docs` | README settings table; this spec status |

Estimated size: small — one dependency, ~60 lines of component change, one settings group.

---

## 4. Testing & Acceptance

- **Unit:** settings defaults/clamping for the `terminal` section (matches existing settings-store test style).
- **Component-level (if harness allows):** terminal constructed with values from settings; toggling `smoothScrolling` flips `term.options.smoothScrollDuration` between 120 and 0.
- **Manual acceptance:**
  - `yes | head -n 20000` then wheel-scroll: animation smooth, no dropped frames with WebGL active (check `term._core._renderService` renderer type in devtools, or add a debug log on addon load).
  - Same test with `webglRenderer: false` — usable DOM fallback.
  - Linux AppImage (WebKitGTK): app must not crash when WebGL is unavailable; fallback silently engages.
  - Alt+wheel fast-scrolls ~5× ; scrollback holds ≥ 5 000 lines.

---

## 5. Open Questions

1. Should `fastScrollSensitivity` also be a setting? (Spec says fixed at 5; revisit if requested.)
2. Whether Settings → Terminal should also absorb future terminal options (cursor style, bell, copy-on-select) — likely yes; this spec establishes the section.
