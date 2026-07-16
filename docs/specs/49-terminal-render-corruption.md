# Spec 49 — Terminal Render Corruption (Overlapping Text)

> **Status:** ✅ **Implemented**
> **Area:** Terminal · Workbench
> **Related:** [47-terminal-smooth-scrolling.md](47-terminal-smooth-scrolling.md) (this spec ships its §2.2 renderer and parts of §2.1) · `src/modules/terminal/TerminalPane.svelte` · `src/modules/workbench/CenterWorkbench.svelte`

---

## 1. Problem

Running a heavy TUI in the integrated terminal (reported with Claude Code) intermittently produces **overlapping glyphs**, especially while typing into the TUI's input line during redraws. Symptoms: characters drawn on top of each other, stale fragments of previous frames, misaligned columns.

## 2. Root Causes

Three compounding issues, all in `TerminalPane.svelte` / `CenterWorkbench.svelte`:

1. **Stale font metrics.** The terminal was constructed with `fontFamily: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace` — none of which the app bundles. xterm measures the glyph cell **once at `open()`**; if the resolved font is still loading (or resolves differently from the measured fallback), every subsequent draw uses wrong cell dimensions → adjacent cells visually overlap.
2. **DOM renderer under heavy redraw.** No renderer addon was loaded, so xterm used its DOM renderer. Full-screen TUI apps repaint the entire viewport per frame; the DOM renderer is both slow and prone to leaving mispositioned spans while typing interleaves with `pty:data` bursts. VS Code ships the WebGL renderer for exactly this reason.
3. **Terminal remounts on tab switch** (rollback regression). `CenterWorkbench.svelte` destroyed the `TerminalPane` whenever a non-terminal tab became active. Switching away and back during a Claude session produced a fresh, empty xterm buffer that the TUI then repainted incrementally — scrollback lost, frames garbled until the next full redraw. This was previously fixed in `04ea6a1` and was lost in the v0.1.6 rollback.

## 3. Fix

| Change | File |
|--------|------|
| Await `document.fonts.ready` (bounded at 1.5 s) before constructing the terminal; if the timeout won, force a glyph re-measure when fonts arrive (font-option reassignment + `syncPtySize()`) | `TerminalPane.svelte` |
| Load `@xterm/addon-webgl` after `term.open()`, with `try/catch` + `onContextLoss` fallback to the DOM renderer (one attempt per mount, per spec 47 §2.2) | `TerminalPane.svelte`, `package.json` |
| `scrollback: 5000`, `smoothScrollDuration: 120` (spec 47 §2.1 values; the settings UI remains future work under 47) | `TerminalPane.svelte` |
| Keep terminal panes mounted across tab switches (`display:none` when inactive, `active` prop re-fits + refocuses on return) — restores `04ea6a1` | `CenterWorkbench.svelte`, `TerminalPane.svelte` |

## 4. Acceptance

- Run `claude` in the terminal, type continuously while it redraws: no overlapping glyphs.
- Switch to an editor tab and back during a run: buffer and scrollback intact.
- Machine without JetBrains Mono/Fira Code installed: columns still aligned.
- WebGL unavailable (Linux/WebKitGTK): DOM fallback engages silently, no crash.

## 5. Deferred

- Settings → Terminal section (font size, scrollback, sensitivity, WebGL toggle) — spec [47](47-terminal-smooth-scrolling.md) §2.3.
- Bundling a monospace webfont so the primary font is deterministic on all machines.
