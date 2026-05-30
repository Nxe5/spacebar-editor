# Spec 26 — Search Panel

> **Status:** ✅ Implemented (core) — `SearchPanel.svelte` wired to `grep_workspace`, grouped results, click-to-open with goto-line, `search` explorer tab + icon. Deferred: match-case/regex toggles, in-file replace, `Cmd+Shift+F` shortcut (conflicts with format-document).
> **Area:** Explorer UI · Editor · IPC · Shortcuts
> **Phase:** 0 — Polish & trust (Phase B in [17-roadmap.md](17-roadmap.md))
> **Depends on:** [05-workbench.md](05-workbench.md) (explorer tabs) · [12-ipc.md](12-ipc.md) (`grep_workspace`) · [10-editor.md](10-editor.md) (open + scroll-to-line)

> **Related:** `extension.md` §6 · `src/modules/explorer/SearchPanel.svelte` · `src/lib/explorerPanel.ts` · `src/modules/shortcuts/defaults.ts`

---

## 1. Overview

A workspace text-search panel is a low-effort, high-value completion: the `grep_workspace` Tauri command (ripgrep) already works end to end, and `SearchPanel.svelte` exists but is unwired. This spec completes the component and integrates it as a fourth explorer tab with a keyboard shortcut.

### Goals

- Full-text workspace search backed by the existing ripgrep command.
- Case-sensitive, regex, and whole-word toggles plus a file-glob filter.
- Results grouped by file, collapsible, with line numbers and context.
- Click a result to open the file and scroll to the matching line.
- Accessible via `Cmd/Ctrl+Shift+F` and a status-bar icon.

### Non-Goals

- Search-and-replace across files (deferred — read-only results in v1).
- Semantic / embeddings search (out of scope).
- A new backend command (`grep_workspace` is sufficient).
- Search history persistence (session-only in v1).

---

## 2. UI Specification

`SearchPanel.svelte` (complete the existing component):

```
┌──────────────────────────────────────┐
│ [ search query…                    ] │
│ Aa  .*  ⌷  [ files glob: **/*.ts   ] │   Aa=case  .*=regex  ⌷=whole word
├──────────────────────────────────────┤
│ ▾ src/lib/agent/streamTurn.ts   (3)  │
│     42  const tools = …              │
│     87  resolveStreamCredentials(…)  │
│    118  onToolCall?.(toolCall)       │
│ ▾ src/lib/tools/toolRunner.ts   (1)  │
│     31  executeTool(call, ctx)       │
├──────────────────────────────────────┤
│ 17 results in 6 files                │
└──────────────────────────────────────┘
```

| Control | Behavior |
|---------|----------|
| Query input | Debounced (~250ms) → `grep_workspace` |
| `Aa` case-sensitive | Toggle; passed to ripgrep |
| `.*` regex | Toggle; treat query as regex (else literal) |
| `⌷` whole word | Toggle; ripgrep `--word-regexp` |
| Files glob | Optional include glob (e.g. `**/*.ts`) |
| Result row | Click → open file, scroll to line, highlight match |
| File group | Collapsible; shows match count |
| Result count badge | Total matches + file count |

---

## 3. Integration

### 3.1 Explorer tab

Add `"search"` to the explorer tab union in `src/lib/explorerPanel.ts`:

```
files · git · prompt · search   (· skills — see spec 23)
```

Wire into `RightSidebar.svelte` as a conditional branch rendering `SearchPanel`.

### 3.2 Status bar icon

Magnifying-glass icon in `StatusBar.svelte`, following the existing panel-toggle pattern (toggles search panel visibility, activating the right sidebar if collapsed).

### 3.3 Keyboard shortcut

Add to `src/modules/shortcuts/defaults.ts`:

| Action | Binding |
|--------|---------|
| Toggle search panel + focus query | `Cmd+Shift+F` / `Ctrl+Shift+F` |

Dispatched via `dispatchWorkbenchShortcut()` in `WorkbenchShell`.

---

## 4. Backend

`grep_workspace` already returns ripgrep results. The frontend must:

- Pass query + flags (case, regex, word, glob) to the command.
- Parse the structured ripgrep output (path, line number, line text, match span).
- Group by file and render.

If `grep_workspace`'s current signature lacks flag parameters, extend it to accept `{ case_sensitive, regex, whole_word, glob }` (additive; defaults preserve current behavior). Match cap remains 500 (per [09-tool-system.md](09-tool-system.md)) with a "results truncated" note when hit.

---

## 5. Implementation Plan

### Phase 1 — Wire the panel

- [ ] Add `"search"` to `ExplorerPanelTab`
- [ ] Render `SearchPanel` in `RightSidebar`
- [ ] Status-bar search icon + toggle
- [ ] `Cmd/Ctrl+Shift+F` shortcut

### Phase 2 — Complete the component

- [ ] Query input + debounce → `grep_workspace`
- [ ] Case / regex / whole-word / glob controls (extend command if needed)
- [ ] Grouped, collapsible results with counts
- [ ] Click result → open file + scroll to line + highlight

### Phase 3 — Polish

- [ ] Truncation note at 500 matches
- [ ] Empty / no-results / error states
- [ ] Keyboard navigation of results (↑/↓/Enter)

**Touch points:**

| File | Change |
|------|--------|
| `src/modules/explorer/SearchPanel.svelte` | Complete component |
| `src/lib/explorerPanel.ts` | `"search"` tab id |
| `src/modules/explorer/RightSidebar.svelte` | Render branch |
| `src/modules/workbench/StatusBar.svelte` | Toggle icon |
| `src/modules/shortcuts/defaults.ts` | `Cmd+Shift+F` |
| `src-tauri/src/modules/commands.rs` | (Optional) flag params on `grep_workspace` |

---

## 6. Edge Cases & Failure Modes

| Scenario | Handling |
|----------|----------|
| Invalid regex | Inline error under input; no command run |
| > 500 matches | Show results + "Results truncated at 500" note |
| Empty query | No search; clear results |
| No workspace open | Disabled state: "Open a folder to search" |
| Binary files | ripgrep skips by default; keep that behavior |
| Click result, file moved/deleted | Toast: "File no longer exists"; refresh results |
| No Tauri (web dev) | Panel shows "Search requires the desktop app" |

---

## 7. Open Questions

| Question | Recommendation |
|----------|----------------|
| Search-and-replace in v1? | No — read-only results first; replace is a separate spec. |
| Persist last query/flags? | Session-only in v1; no disk persistence. |
| Reuse `grep` tool path or call `grep_workspace` directly? | Call the command directly from the panel — the tool path is for the agent. |

---

## 8. Acceptance Criteria

1. `Cmd/Ctrl+Shift+F` opens the search panel and focuses the query input.
2. Typing a query returns ripgrep matches grouped by file with line numbers.
3. Case, regex, whole-word, and glob controls affect results correctly.
4. Clicking a result opens the file and scrolls to the matching line with the match highlighted.
5. Over 500 matches shows a truncation note; invalid regex shows an inline error.
6. With no workspace open, the panel shows a clear empty state.

---

*Spec created: 2026-05-30 · Source: `extension.md` §6 · Target: Phase 0 (polish & trust)*
