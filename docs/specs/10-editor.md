# Editor

> **Status:** ✅ **CORE COMPLETE** — CodeMirror 6, 15 grammars, line wrap, Prettier, diff mode, and full syntax/editor chrome in Appearance settings. Remaining gaps: LSP Phase 2 (go-to-def, rename, completions), Cmd+K inline edit — see [25-lsp-diagnostics.md](25-lsp-diagnostics.md), [28-inline-edit-autocomplete.md](28-inline-edit-autocomplete.md).

---

## Language Support

### Language Detection

`getLanguageFromPath()` in `src/lib/ipc.ts` maps file extensions to language IDs.

### Loaded Grammars (15)

| Language | CodeMirror Pack | Status |
|----------|-----------------|--------|
| JavaScript | `@codemirror/lang-javascript` | ✅ |
| TypeScript | `@codemirror/lang-javascript` (typescript: true) | ✅ |
| HTML | `@codemirror/lang-html` | ✅ |
| CSS | `@codemirror/lang-css` | ✅ |
| JSON | `@codemirror/lang-json` | ✅ |
| Markdown | `@codemirror/lang-markdown` | ✅ |
| Rust | `@codemirror/lang-rust` | ✅ |
| Python | `@codemirror/lang-python` | ✅ |
| YAML | `@codemirror/lang-yaml` | ✅ |
| Go | `@codemirror/lang-go` | ✅ |
| C/C++ | `@codemirror/lang-cpp` | ✅ |
| Java | `@codemirror/lang-java` | ✅ |
| SQL | `@codemirror/lang-sql` | ✅ |
| XML | `@codemirror/lang-xml` | ✅ |
| Svelte | `codemirror-lang-svelte` | ✅ |
| Vue | Falls back to HTML | ✅ |

**Not loaded:** TOML, Shell → plain text until packs added.

---

## Syntax Colors & Editor Chrome

Custom highlight via `src/lib/editor/syntaxTheme.ts`:
- Uses `--syntax-*` CSS variables + `tl-syn-*` classes in `styles/editor-syntax.css`
- Settings → Appearance → Syntax: editable token colors (including markdown-specific tokens)
- Settings → Appearance → Editor: gutter, selection, active line, and related chrome colors

Details: [20-editor-formatting-and-theming.md](20-editor-formatting-and-theming.md).

---

## Formatting & Wrapping

| Feature | Status |
|---------|--------|
| Line wrap (`EditorView.lineWrapping`) | ✅ Complete — Settings → Appearance → Editor |
| Prettier (format document / format on save) | ✅ Complete |
| Full syntax + editor chrome in Settings | ✅ Complete |

Details: [20-editor-formatting-and-theming.md](20-editor-formatting-and-theming.md).

---

## Git Diff Mode

`src/lib/git/openChangedFile.ts`:

1. `openGitDiffFile()` sets `diffBase` from `git_file_at_head`
2. `diffDecorations.ts` highlights added/changed lines
3. Editor is read-only in diff mode

---

## Editor Features

| Feature | Implementation | Status |
|---------|----------------|--------|
| Line numbers | CodeMirror `lineNumbers()` | ✅ |
| Active line highlight | `highlightActiveLine()` | ✅ |
| Fold gutter | `foldGutter()` | ✅ |
| Bracket matching | `bracketMatching()` | ✅ |
| Auto-close brackets | `closeBrackets()` | ✅ |
| Search | `searchKeymap` | ✅ |
| History (undo/redo) | `history()` | ✅ |
| Middle-click scroll | Custom `middleClickScroll()` | ✅ |
| Scroll past end | `scrollPastEnd()` | ✅ |
| Line wrap | `EditorView.lineWrapping` compartment | ✅ |
| Prettier format | Format command + format-on-save | ✅ |
| Go to line | `sidebar:goto-line` event | ✅ |

---

## Editor State Management

`EditorSurface.svelte`:
- Keeps `Map<path, EditorState>` for tab persistence
- Preserves undo history and cursor position on tab switch
- Document changes update `files.updateFileContent()` and mark buffer dirty
- Save writes via `writeFile()` IPC
- LSP diagnostics + hover via `lspCodeMirror.ts` (Phase 1)

---

## Known Limitations

| Limitation | Status | Notes |
|------------|--------|-------|
| LSP Phase 1 | ✅ Shipped | Diagnostics + hover for TS/JS — [25](25-lsp-diagnostics.md) |
| LSP Phase 2 | ❌ Not started | Go-to-def, rename, completions, more languages |
| Cmd+K inline edit | ❌ Not started | Chat + tools only — [28](28-inline-edit-autocomplete.md) |
| Autocomplete (FIM) | ❌ Not started | Settings scaffold only — [28](28-inline-edit-autocomplete.md) |
| Untitled file Save As | ❌ Not started | Needs `pick_save_path` IPC — [44](44-editor-actions-browser-tab.md) §3 |
