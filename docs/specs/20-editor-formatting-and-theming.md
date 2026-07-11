# Editor Formatting, Wrapping, and Syntax Theming

> **Status:** ✅ **COMPLETE** — Line wrap, Prettier, full syntax + editor chrome in Appearance settings. Remaining gaps: in-file search replace, richer LSP completions.

> **Related:** [10-editor.md](10-editor.md) · [13-theming.md](13-theming.md) · [06-state-management.md](06-state-management.md)

---

## Summary

Improve the **main IDE text editor** (CodeMirror in `EditorSurface.svelte`) with:

1. **Prettier** — optional format-on-save / format command for supported file types
2. **Text wrapping** — configurable line wrap for editor buffers (and consistent behavior in read-only diff view where appropriate)
3. **Syntax & editor colors** — fix markdown (`.md`) highlighting; expose **all** token and chrome colors in Settings for full user control

---

## Current State (As-Is)

### Editor stack

| Piece | Location | Status |
|-------|----------|--------|
| CodeMirror 6 | `src/lib/editor/loadCodeMirror.ts` | ✅ |
| Language grammars incl. **markdown** | `@codemirror/lang-markdown` | ✅ Loaded |
| Syntax highlight | `src/lib/stores/syntaxTheme.ts` + `styles/editor-syntax.css` | ✅ |
| Syntax settings | Settings → **Appearance → Syntax** | ✅ (code + markdown fields) |
| Editor chrome colors | Settings → **Appearance → Editor** + workbench presets | ✅ |
| Line wrap | `settings.editor.wordWrap` | ✅ |
| Prettier | Format command + `formatOnSave` | ✅ |
| Prettier | — | ❌ Not in project |

### Settings → Appearance → Syntax (today)

Editable in `SettingsPane.svelte` via `SYNTAX_COLOR_FIELDS` (`src/lib/editor/syntaxColors.ts`):

| Field | Used for |
|-------|----------|
| keyword | Keywords, control flow |
| function | Functions, labels |
| variable | Variables, names |
| number | Numbers, bools (via alias) |
| string | Strings |
| type | Types, classes, tags (aliased) |
| operator | Operators, punctuation (aliased) |
| property | Properties, attributes (aliased) |
| comment | Comments |

**Stored but not exposed in UI:** `default`, `invalid` (in `TOKYO_NIGHT_SYNTAX_DEFAULTS` only).

**Mapped in CSS but not user-editable:**

| CSS variable | Current mapping in `applySyntaxColorsToDocument` |
|--------------|--------------------------------------------------|
| `--syntax-heading` | Copied from `variable` |
| `--syntax-link` | Copied from `keyword` |
| `--syntax-strong` | Copied from `keyword` |
| `--syntax-emphasis` | Copied from `type` |
| `--syntax-meta` | Copied from `comment` |
| `--syntax-tag` | Copied from `type` |
| `--syntax-punctuation` | Copied from `operator` |
| `--syntax-regexp` | Copied from `string` |

### Why `.md` looks wrong today

| Issue | Cause |
|-------|--------|
| Headings look like plain text | `--syntax-heading` mirrors `variable`; markdown `Heading` uses `tl-syn-heading` but color is not distinct in practice |
| Links / emphasis weak | No dedicated settings; aliases may not match user expectation |
| Code fences | Often styled as `meta` or `string` depending on parser; not tuned for markdown |
| Frontmatter / HTML in MD | May fall through to `default` or wrong tag |
| Preview confusion | User expects “markdown preview” colors; editor is **source** highlighting only |
| Settings preview | Syntax preview shows **TypeScript** sample only — not markdown |

Markdown **is** loaded as a grammar (`language: "markdown"` from `getLanguageFromPath`). The problem is **token → color mapping** and **limited Settings surface**, not missing the language pack.

---

## Goals

| Goal | Status |
|------|--------|
| Prettier format for supported languages in workspace | ❌ |
| Format on save (optional) + manual Format Document command | ❌ |
| Editor line wrap on/off (and optionally column guide) | ❌ |
| All syntax token colors editable in Settings | ❌ |
| Editor chrome colors editable (bg, fg, gutter, selection, cursor, line highlight) | ❌ |
| Markdown-aware syntax preview in Settings | ❌ |
| Markdown files highlight headings, links, emphasis, code, quotes distinctly | ❌ |
| Live apply without restart | ✅ (CSS vars today; extend to new vars) |

## Non-goals (initial phase)

| Non-goal | Notes |
|----------|--------|
| WYSIWYG markdown preview pane | Separate from syntax fix; preview tab is iframe/HTML |
| Prettier for every language | Start with JS/TS/JSON/CSS/HTML/MD/YAML where Prettier supports |
| LSP formatting | Prettier first; LSP later |
| Terminal wrap settings | Editor-focused; terminal can follow later |

---

## 1. Prettier Integration

### Behavior

| Action | Description |
|--------|-------------|
| **Format document** | Command / shortcut (e.g. Shift+Alt+F) formats active editor buffer |
| **Format on save** | Optional setting; runs after successful `write_file` when enabled |
| **Scope** | Active file only; respect `.prettierignore` when present |

### Implementation approach

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **A. Prettier standalone in Node (devDependency)** | Full feature set, plugins | Requires bundling or `run_shell` to `pnpm exec prettier` | **Phase 1:** `run_shell` in workspace with project’s prettier if installed |
| **B. `prettier` as app dependency** | Always available | Bundle size, version lock | **Phase 2:** ship with app for offline format |
| **C. WASM build** | No shell | Heavy, plugin limits | Defer |

**Phase 1 (minimal):**

1. Detect `prettier` in workspace (`package.json` devDependency or `node_modules/.bin/prettier`)
2. `formatDocument(path, content)` → invoke CLI with stdin/stdout or temp file via `run_shell`
3. Map extension → parser (`typescript`, `markdown`, `json`, etc.)
4. On failure, show toast; do not overwrite buffer

**Phase 2:**

- Bundle Prettier in app or Tauri side process for projects without local install

### Settings (`sidebar.settings.v4` or `editor` subsection)

| Setting | Default | Status |
|---------|---------|--------|
| `editor.formatOnSave` | `false` | ❌ |
| `editor.defaultFormatter` | `"prettier"` | ❌ |
| `editor.prettierPath` | auto-detect | ❌ |

### Files to touch

- `src/lib/editor/formatDocument.ts` (new)
- `src/modules/editor/EditorSurface.svelte` — wire save + command
- `src/modules/settings/SettingsPane.svelte` — Editor section
- `src/modules/shortcuts/` — format shortcut
- Optional: `tests/unit/formatDocument.test.ts`

---

## 2. Text Wrapping (Main IDE Views)

### Scope

| View | Wrap behavior | Status |
|------|---------------|--------|
| **Editor** (`EditorSurface`) | User-configurable | ❌ |
| **Git diff read-only editor** | Same setting as editor | ❌ |
| **Chat / activity detail `pre` blocks** | Already `pre-wrap` in feed | ✅ |
| **Terminal** | xterm wrap (separate) | Out of scope v1 |

### CodeMirror

Use `@codemirror/view` **`EditorView.lineWrapping`** when enabled.

```typescript
import { EditorView } from "@codemirror/view";

// extension when wrap enabled:
EditorView.lineWrapping
```

### Settings

| Setting | Default | Status |
|---------|---------|--------|
| `editor.wordWrap` | `"off"` \| `"on"` | ❌ |
| `editor.wordWrapColumn` | optional (e.g. 80) — soft guide only, phase 2 | ❌ |

Persist in `sidebar.settings.v4`.

### UX

- Settings → Appearance → **Editor** (new subsection) or under Syntax
- Toggle: “Wrap lines”
- Optional status bar indicator when wrap on

### Acceptance

- Long `.md` / `.ts` lines wrap inside editor without horizontal scroll when enabled
- Setting persists across sessions
- Toggling wrap reconfigures open editors without losing undo history (reconfigure extensions on existing `EditorState` or recreate with same doc)

---

## 3. Syntax & Editor Colors (Full Settings)

### 3.1 Expand syntax token map

Add first-class keys (all persisted, all editable in Settings):

| Key | Markdown / general use | Status |
|-----|------------------------|--------|
| `default` | Body text, unclassified tokens | ❌ UI |
| `heading` | `#` headings | ❌ UI |
| `link` | Links, URLs | ❌ UI |
| `emphasis` | *italic* | ❌ UI |
| `strong` | **bold** | ❌ UI |
| `meta` | Frontmatter, HTML blocks, code fence markers | ❌ UI |
| `punctuation` | `[]()#*` markup | ❌ UI |
| `tag` | HTML tags in MD | ❌ UI |
| `invalid` | Parse errors | ❌ UI |
| (existing 9) | Code languages | ✅ UI |

Remove alias-only mapping in `applySyntaxColorsToDocument` — each key sets its own `--syntax-*` variable.

Update `editor-syntax.css` so every `tl-syn-*` class maps to the matching variable (already mostly done).

### 3.2 Editor chrome colors

Expose in Settings → Appearance → **Editor** (or combined “Editor & Syntax”):

| Variable | Meaning | Today |
|----------|---------|--------|
| `--editor-bg` | Editor background | Workbench preset only |
| `--editor-fg` | Default text (if not overridden by syntax default) | Preset |
| `--editor-gutter-fg` | Line numbers | Preset |
| `--editor-line-hl` | Active line | Preset |
| `--editor-selection` | Selection | Preset |
| Cursor | `borderLeftColor` on cursor | Preset |

Store in `sidebar.editorChrome.v1` or extend `sidebar.syntaxColors.v2` with a nested `chrome` object.

Apply via `applyEditorChromeToDocument()` alongside syntax colors.

### 3.3 Settings UI — “full edit”

| Requirement | Status |
|-------------|--------|
| Color swatch + hex input per field (existing pattern) | ✅ pattern exists |
| **All** syntax fields listed with hints | ❌ |
| **Markdown** live preview sample (headings, link, code fence, list) | ❌ |
| **Code** preview sample (TS snippet, keep current) | ✅ |
| Reset to defaults (per section + global) | 🔶 syntax only |
| Import/export theme JSON (optional phase 2) | ❌ |

### 3.4 Fix markdown highlighting verification

After new token keys:

1. Open `README.md` — `#` headers use `heading` color
2. `[link](url)` uses `link` color
3. `` `code` `` and fenced blocks distinguishable
4. Changing **Heading** in Settings updates `.md` immediately

Add unit test: `applySyntaxColorsToDocument` sets distinct `--syntax-heading` when `colors.heading` changes.

### 3.5 Migration

- Bump storage `sidebar.syntaxColors.v1` → `v2` with expanded keys
- On load, merge v1 into v2 using current alias rules once, then save

---

## 4. Module Map (Proposed)

```
src/lib/editor/
  formatDocument.ts      # Prettier invocation
  editorSettings.ts      # wordWrap, formatOnSave types + defaults
  syntaxColors.ts        # expand SyntaxColorMap + v2 migration
  editorChrome.ts        # chrome color map + apply
  syntaxTheme.ts         # (existing) HighlightStyle tags
  loadCodeMirror.ts      # conditional lineWrapping extension

src/lib/stores/
  editorSettings.ts      # writable store, persist settings

src/modules/settings/SettingsPane.svelte
  # sections: appearance-editor, appearance-syntax (expanded)

styles/
  editor-syntax.css      # ensure all tl-syn-* + chrome vars documented
```

---

## 5. Implementation Phases

### Phase A — Wrapping + syntax fix (high impact, low risk)

| Item | Status |
|------|--------|
| `editor.wordWrap` setting + CodeMirror `lineWrapping` | ❌ |
| Expand `SyntaxColorMap` with heading, link, emphasis, strong, meta, punctuation, default, invalid | ❌ |
| Settings UI for new syntax fields | ❌ |
| Markdown sample in syntax preview | ❌ |
| Stop aliasing heading/link/etc. to other keys in `applySyntaxColorsToDocument` | ❌ |

### Phase B — Editor chrome in Settings

| Item | Status |
|------|--------|
| `editorChrome` store + Settings UI | ❌ |
| Live apply to `EditorSurface` theme | ❌ |

### Phase C — Prettier

| Item | Status |
|------|--------|
| Format command + workspace Prettier detect | ❌ |
| Format on save option | ❌ |
| Settings UI | ❌ |

### Phase D — Polish

| Item | Status |
|------|--------|
| Word wrap column guide | ❌ |
| Export/import syntax+chrome theme JSON | ❌ |
| Per-language formatter overrides | ❌ |

---

## 6. Acceptance Criteria

### Wrapping

1. User enables “Wrap lines” in Settings → long lines wrap in editor.
2. Setting persists after restart.

### Syntax / `.md`

1. User opens `spec.md` → headings, links, and code spans are visually distinct.
2. User changes **Heading** color in Settings → markdown `##` lines update without reload.
3. All listed syntax token types have swatch + hex in Settings.

### Editor chrome

1. User changes editor background in Settings → editor surface updates immediately.

### Prettier

1. In a repo with Prettier, Format Document reformats `foo.ts`.
2. With format-on-save off, save does not format; with on, save formats then writes.

---

## 7. Roadmap Link

Add to [17-roadmap.md](17-roadmap.md) Phase A (dogfooding) or new **Phase E — Editor UX**:

- Editor wrap + full syntax colors (incl. markdown)
- Prettier format

---

*Last updated: 2026-05-29*
