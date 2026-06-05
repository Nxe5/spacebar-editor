# Theming

> **Status:** ✅ **COMPLETE**

---

## Color Systems Overview

Spacebar Editor has **three independent color systems**:

| System | Scope | Customizable | Status |
|--------|-------|--------------|--------|
| Workbench theme | Global UI chrome | Yes (presets) | ✅ |
| Workbench chrome overrides | Sidebar, tabs, status bar, terminal | Yes (Settings → Appearance → Theme) | ✅ |
| Editor chrome | Editor pane (bg, gutter, selection, cursor) | Yes (Settings → Appearance → Theme → Editor) | ✅ |
| File icons | Explorer icons | Yes (Settings → Appearance → Icons) | ✅ |
| Syntax colors | Editor tokens | Yes (Settings → Appearance → Theme → Syntax) | ✅ |

The Appearance → Theme page renders an **interactive mini-workbench preview** (`ThemeMiniWorkbench.svelte`, regions in `themePreviewRegions.ts`): click a region (workbench chrome / editor / syntax) to focus its color pickers, with live updates. **Sync from theme** repopulates pickers from the active preset; **Reset to defaults** clears overrides (`themeColorReset.ts`).

---

## Workbench Theme

### Token Sources

| File | Role | Status |
|------|------|--------|
| `src/styles/globals.css` | Default `:root` / `.dark` tokens (VS Code Dark palette) | ✅ |
| `src/styles/workbench-themes.css` | Alternate presets via `[data-workbench-theme="..."]` | ✅ |
| `src/lib/workbench-theme.ts` | Preset registry + `applyWorkbenchTheme()` | ✅ |

### Available Presets

| Theme ID | Status |
|----------|--------|
| `spacebar` (default) | ✅ |
| `dark-bubblegum` | ✅ |
| `cursor-dark` | ✅ |
| `light-paper` | ✅ |
| `light-cloud` | ✅ |
| `pink-studio` | ✅ |
| `blue-nova` | ✅ |

Legacy theme ids (e.g. `vscode-dark`, `rose-pine`, `nxe5`) migrate to `spacebar` via `LEGACY_THEME_ALIASES` in `workbench-theme.ts`.

### Application Mechanism

```typescript
applyWorkbenchTheme(id) {
  if (id === "vscode-dark") {
    document.documentElement.removeAttribute("data-workbench-theme");
  } else {
    document.documentElement.setAttribute("data-workbench-theme", id);
  }
}
```

Called from `WorkbenchShell.svelte` and the settings window when theme changes.

**Editor/syntax sync:** changing the workbench theme clears persisted inline `--editor-*` / `--syntax-*` overrides and reads colors from the active theme CSS (`editorChrome.syncFromActiveTheme()`, `syntaxTheme.syncFromActiveTheme()`). This runs on theme change in Settings → General and when `$settings.workbenchTheme` updates after save.

**Default theme:** `globals.css` sets `--editor-bg: var(--background)` (`#1e1e1e`) so the code editor and welcome screen share the same base fill. Syntax token defaults remain Monokai-style in `editor-syntax.css` until overridden in Appearance or by a workbench preset.

### Key CSS Variables

| Variable Group | Used By | Status |
|----------------|---------|--------|
| `--background`, `--foreground`, `--sidebar-*`, `--border` | Layout chrome | ✅ |
| `--editor-bg`, `--editor-fg`, `--editor-gutter-fg`, `--editor-line-hl`, `--editor-selection` | CodeMirror | ✅ |
| `--terminal-ansi-*` | xterm.js | ✅ |
| `--workbench-tab-active-indicator` | Tab bar | ✅ |

**Persistence:** `settings.workbenchTheme` in `localStorage` (`sidebar.settings.v4`). Editor chrome and syntax colors are stored separately (`sidebar.editorChrome.v1`, `sidebar.syntaxColors.v2`) and sync from the active theme when the workbench preset changes.

---

## Icon Themes

### Icon Theme Store

`src/lib/stores/iconTheme.ts`:
- Storage key: `sidebar.iconTheme.v2`
- Default theme: **`seti`** (Cursor-style)

### Available Themes

| Theme | Description | Status |
|-------|-------------|--------|
| `seti` | Seti font icons with per-file colors | ✅ |
| `vscode-icons` | VS Code SVG icons | ✅ |
| `codicons` | VS Code icon font (single-tone) | ✅ |
| `custom` | User-provided folder with manifest | ✅ |

### Seti Icons (Default)

**Resolution order** (`src/lib/icon-packs/resolveSeti.ts`):

1. `fileNames` exact match (e.g., `dockerfile`, `makefile`)
2. `fileExtensions` (e.g., `ts` → `_typescript`)
3. `languageIds` via `setiLanguageIdFromFileName()`
4. Default `file` icon

**Manifest:** `static/icon-packs/seti/manifest.json`

Each icon definition contains:
- `fontCharacter` — private-use escape
- `fontColor` — hex color per icon type

**Note:** Seti folders use codicons (`codicon-folder`), not Seti folder glyphs.

### VS Code Icons

- Resolution: `src/lib/icon-packs/resolve.ts`
- Bundled SVGs: `static/icon-packs/vscode-icons/icons/`
- Colors embedded in SVG assets

### Custom Icon Packs

User picks folder via Tauri dialog. Expects `manifest.json` or `icons.json` + `icons/` directory.

---

## Syntax Colors

### Configuration

`src/lib/stores/syntaxTheme.ts` + `src/lib/editor/syntaxColors.ts`:
- Uses `--syntax-*` CSS variables on `:root`
- Configurable in **Settings → Appearance → Syntax** (code + markdown token groups)
- **Sync from theme:** workbench preset change updates runtime colors; use Appearance pickers to persist custom overrides

### CSS Variables (representative)

| Variable | Purpose |
|----------|---------|
| `--syntax-keyword` | Keywords |
| `--syntax-string` | Strings |
| `--syntax-number` | Numbers / bools |
| `--syntax-comment` | Comments |
| `--syntax-function` | Functions |
| `--syntax-variable` | Variables / parameters |
| `--syntax-type` | Types / classes |
| `--syntax-operator` | Operators |
| `--syntax-property` | Properties / attributes |
| `--syntax-heading` | Markdown headings |
| `--syntax-link` | Markdown links |
| `--syntax-emphasis` / `--syntax-strong` | Markdown emphasis |
| `--syntax-tag` / `--syntax-regexp` | Tags, regex |

## Workbench Chrome Overrides

Separate from the workbench preset — **Settings → Appearance → Theme**. The `workbenchChrome` store (`src/lib/stores/workbenchChrome.ts`, helpers in `src/lib/workbench/workbenchChrome.ts`) applies per-key CSS-var overrides for sidebar, tab bar, status bar, and terminal colors on top of the active theme, persisted in `localStorage`. Overrides are applied as inline styles on `<html>` and can be reset to the active theme's values.

## Editor Chrome

Separate from syntax tokens — **Settings → Appearance → Theme → Editor**:

| Variable | Purpose |
|----------|---------|
| `--editor-bg` | Editor pane background |
| `--editor-fg` | Default text |
| `--editor-gutter-fg` | Line numbers |
| `--editor-line-hl` | Active line highlight |
| `--editor-selection` | Selection background |
| `--editor-cursor` | Caret |

Defaults in `EDITOR_CHROME_DEFAULTS` (`src/lib/editor/editorChrome.ts`) match VS Code Dark (`#1e1e1e` background).

---

## Terminal Colors

`--terminal-ansi-*` variables from workbench theme:

| Variables |
|-----------|
| `--terminal-ansi-black`, `--terminal-ansi-bright-black` |
| `--terminal-ansi-red`, `--terminal-ansi-bright-red` |
| `--terminal-ansi-green`, `--terminal-ansi-bright-green` |
| `--terminal-ansi-yellow`, `--terminal-ansi-bright-yellow` |
| `--terminal-ansi-blue`, `--terminal-ansi-bright-blue` |
| `--terminal-ansi-magenta`, `--terminal-ansi-bright-magenta` |
| `--terminal-ansi-cyan`, `--terminal-ansi-bright-cyan` |
| `--terminal-ansi-white`, `--terminal-ansi-bright-white` |
