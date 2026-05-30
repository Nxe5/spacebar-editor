# Spec 28 — Inline Edit (Cmd+K) & Autocomplete

> **Status:** ❌ Not started (autocomplete settings UI exists in `autocompleteSettings.ts`; no inference hook)
> **Area:** Editor (CodeMirror) · Agent/Providers · Settings · Shortcuts
> **Phase:** 1 (autocomplete hook) → 2 (Cmd+K) — Competitive parity ([17-roadmap.md](17-roadmap.md) Phase D)
> **Depends on:** [10-editor.md](10-editor.md) (CodeMirror) · [08-ai-agent.md](08-ai-agent.md) (model calls) · [09-tool-system.md](09-tool-system.md) (apply diffs) · [25-lsp-diagnostics.md](25-lsp-diagnostics.md) (completion overlap)

> **Related:** `extension.md` §1.5, §10 · `src/lib/autocompleteSettings.ts` · `src/lib/modelRoles.ts` (`autocomplete` role)

---

## 1. Overview

Two of Cursor's most-used editor features are missing: **inline edit (Cmd+K)** — select code, describe a change, apply a diff in place — and **autocomplete** — Copilot-style inline completions. The architecture supports both; neither is wired. This spec defines them together because they share the editor integration surface and the `autocomplete` model role already reserved in settings ([21-context-compaction.md](21-context-compaction.md) §6.3).

### Goals

- **Autocomplete:** inline ghost-text completions from a fast local model (Ollama fill-in-middle) or a cloud model.
- **Cmd+K:** select text → prompt → receive a diff → accept/reject in place.
- Reuse the reserved `modelRoles.autocomplete` setting; no new model-selection paradigm.
- Both degrade gracefully when no suitable model/endpoint is configured.

### Non-Goals

- Multi-file inline edits (Cmd+K operates on the active selection/file only).
- Replacing chat-based agent edits (Cmd+K is a focused, local complement).
- Autocomplete ranking / multiple suggestions UI in v1 (single ghost suggestion).
- Training a completion model.

---

## 2. Autocomplete (Phase 1)

### 2.1 Inference hook

| Aspect | Spec |
|--------|------|
| Trigger | On pause after typing (debounced ~300ms), not every keystroke |
| Model | `modelRoles.autocomplete` ?? active chat model; prefer a fast local FIM model |
| Endpoint | Ollama fill-in-middle (`/api/generate` with `suffix`) where available; else chat-completion with prefix/suffix prompt |
| Context | N lines before + after cursor (bounded — respects [22](22-llm-file-interaction.md) budget discipline) |
| Display | CodeMirror ghost-text decoration |
| Accept | `Tab` accepts; `Esc` dismisses; any edit invalidates |

### 2.2 Settings

Extend existing `autocompleteSettings.ts`:

```typescript
interface AutocompleteSettings {
  enabled: boolean;            // default false
  debounceMs: number;          // default 300
  maxContextLines: number;     // before+after cursor, default 80
  // model resolved via modelRoles.autocomplete
}
```

### 2.3 Module

`src/lib/autocomplete/`:

| File | Role |
|------|------|
| `autocompleteProvider.ts` | Build FIM prompt; call model; return completion |
| `autocompleteCodeMirror.ts` | Ghost-text extension; debounce; accept/dismiss keys |

Coordinate with [25-lsp-diagnostics.md](25-lsp-diagnostics.md): where an LSP completion source exists for the language, prefer LSP for symbol completion and use the model for line/block completion. Avoid double suggestions.

---

## 3. Inline Edit — Cmd+K (Phase 2)

### 3.1 Flow

1. User selects code in the editor and presses `Cmd/Ctrl+K`.
2. A floating input appears at the selection with a prompt field.
3. User types an instruction (e.g. "convert to async/await").
4. The model receives: the selection + surrounding context + instruction, and returns replacement text.
5. The editor shows an **inline diff** (added/removed decorations) over the selection.
6. User **accepts** (`Enter` / ✓) → apply replacement; or **rejects** (`Esc` / ✗) → discard.

### 3.2 Model call

- Model: `modelRoles.chat` (the capable model), not the fast autocomplete model.
- Prompt: focused edit template — return only the replacement for the selection, preserving surrounding indentation.
- No tool calls; this is a single completion, not an agent loop.

### 3.3 Diff application

Reuse diff-decoration infrastructure from `diffDecorations.ts` ([10-editor.md](10-editor.md)) to preview changes before applying. Applying writes the buffer (and saves per editor settings); the change appears in git like any edit.

### 3.4 Module

`src/lib/inlineEdit/`:

| File | Role |
|------|------|
| `inlineEditController.ts` | Orchestrate selection → prompt → model → diff → apply |
| `inlineEditWidget.svelte` | Floating prompt input + accept/reject controls |
| `inlineEditCodeMirror.ts` | Selection capture, diff preview decorations |

### 3.5 Shortcut

Add to `src/modules/shortcuts/defaults.ts`: `Cmd+K` / `Ctrl+K` (inline edit on selection).

---

## 4. Implementation Plan

### Phase 1 — Autocomplete

- [ ] `autocompleteProvider.ts` (FIM via Ollama; chat fallback)
- [ ] `autocompleteCodeMirror.ts` ghost-text + accept/dismiss
- [ ] Wire `modelRoles.autocomplete`; extend `autocompleteSettings.ts`
- [ ] Settings → enable toggle, debounce, context lines
- [ ] Coordinate with LSP completions ([25](25))

**Deliverable:** Inline ghost-text completions from a local model.

### Phase 2 — Cmd+K inline edit

- [ ] `inlineEditController.ts` + `inlineEditWidget.svelte`
- [ ] Selection capture + diff preview decorations
- [ ] Accept/reject; apply via buffer write
- [ ] `Cmd/Ctrl+K` shortcut

**Deliverable:** Select → instruct → diff → apply in place.

**Touch points:**

| File | Change |
|------|--------|
| `src/lib/autocomplete/` | New module |
| `src/lib/inlineEdit/` | New module |
| `src/modules/editor/EditorSurface.svelte` | Mount extensions/widget |
| `src/lib/autocompleteSettings.ts` | Extend settings |
| `src/modules/settings/SettingsPane.svelte` | Autocomplete controls |
| `src/modules/shortcuts/defaults.ts` | `Cmd+K` |

---

## 5. Edge Cases & Failure Modes

| Scenario | Handling |
|----------|----------|
| No model configured for autocomplete | Feature inert; settings hint to pick a model |
| Model too slow for completions | Debounce + cancel in-flight on new keystroke; drop late results |
| Cmd+K with no selection | Operate on current line, or prompt to select |
| Model returns malformed/partial edit | Show as diff; user can reject; never auto-apply on parse failure |
| Completion conflicts with LSP suggestion | Prefer LSP for symbols; model for lines/blocks; never show both |
| Large selection for Cmd+K | Cap context; warn if selection too large for model window |
| No Tauri (web dev) | Editor works; features require a reachable model endpoint |

---

## 6. Open Questions

| Question | Recommendation |
|----------|----------------|
| Autocomplete default on or off? | Off — opt-in; local inference cost varies by hardware. |
| FIM-only or also chat-prompt fallback? | Both; FIM where the model supports it, chat-prompt otherwise. |
| Cmd+K multi-suggestion? | Single suggestion v1; cycle later. |
| Apply Cmd+K straight to buffer or stage as diff first? | Always preview as diff, then apply — matches the trust-through-review ethos. |
| Should Cmd+K use the agent loop? | No — single completion call; keep it fast and local to the editor. |

---

## 7. Acceptance Criteria

1. With autocomplete enabled and a model configured, pausing while typing shows ghost-text; `Tab` accepts, `Esc` dismisses.
2. Autocomplete uses `modelRoles.autocomplete` when set, else the active chat model.
3. `Cmd/Ctrl+K` on a selection opens a prompt; submitting shows an inline diff.
4. Accepting the diff applies the change to the buffer; rejecting discards it cleanly.
5. Where an LSP completion source exists, the two do not produce duplicate suggestions.
6. Both features degrade gracefully (no errors) when no suitable model is configured.

---

*Spec created: 2026-05-30 · Source: `extension.md` §1.5, §10 · Target: Phase 1 (autocomplete) → Phase 2 (Cmd+K)*
