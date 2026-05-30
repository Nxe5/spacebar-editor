# Spec 22 — LLM ↔ File Interaction Hardening

> **Status:** 🔶 Partial — §2 `.gitignore`-aware tree filtering ✅ · §3 `read_file` cap ✅ (global agent setting, lines or % of context; Rust ranged reads) · §4 tool trimming ✅ (mode-scoped via `MODE_CONFIG` + `getToolsForPolicy`) · §5–6 parse errors + stall detection ✅. Remaining: none for Phase 0 scope.
> **Area:** Agent Loop · Tool System · Rust Filesystem · Context Management
> **Phase:** 0 — Polish & trust (Phase B in [17-roadmap.md](17-roadmap.md))
> **Depends on:** [08-ai-agent.md](08-ai-agent.md) (agent loop) · [09-tool-system.md](09-tool-system.md) (tools/policy) · [12-ipc.md](12-ipc.md) (Rust commands) · [21-context-compaction.md](21-context-compaction.md) (token budget)

> **Related:** `extension.md` §2 · `src/lib/agent/workspaceContext.ts` · `src/lib/tools/toolRunner.ts` · `src/lib/tools/toolDefinitions.ts` · `src/lib/agent/textToolCalls.ts` · `src-tauri/src/modules/filesystem.rs`

---

## 1. Overview

The single largest determinant of agent quality on **local models** (7B–14B class) is how efficiently the limited context window is used. Today several paths leak tokens or fail silently:

- `buildWorkspaceContextBlock()` can inject `node_modules/`, build output, and other noise into every system prompt.
- `read_file` has no size cap — one large file can consume the entire window.
- All 16 tool schemas are sent even in Chat (0 tools) and Plan (9 tools) modes.
- Malformed tool-call JSON from weak models is dropped silently, stalling the loop.
- A model can call the same tool with identical arguments indefinitely without progress.

This spec specifies five focused fixes. None require rewriting a subsystem; all are additive guards in existing code paths. They disproportionately help local models, which is the product's positioning ([01-product.md](01-product.md)).

### Goals

- No always-ignored directory (`node_modules/`, `.git/`, …) ever enters the system prompt tree.
- `read_file` is bounded by default and paginatable on demand, with a hard Rust cap as defense in depth.
- The model only ever sees tool schemas it is actually allowed to call in the current mode.
- Malformed tool calls surface as visible, recoverable errors — never silent drops.
- The agent loop detects and breaks out of repeated identical tool calls.

### Non-Goals

- Semantic file ranking or embeddings-based context selection.
- Automatic summarization of large files (the agent paginates deliberately instead).
- Changing the native tool-calling path for models that support it (only the text fallback gains error handling).
- Replacing the token estimator (reuse `contextBudget.ts` — see [21](21-context-compaction.md) §4).

---

## 2. File Tree Context — `.gitignore` Respect & Depth Limits

### 2.1 Problem

`buildWorkspaceContextBlock()` (`src/lib/agent/workspaceContext.ts`) and the `get_file_tree` tool emit directory trees that may include vendored and generated paths. For a 16k-context local model, 2k tokens of irrelevant paths are consumed before the user's first sentence.

### 2.2 Spec

**Always-exclude list** (regardless of `.gitignore`, applied in both Rust and TS):

```
node_modules/   .git/   dist/   build/   target/   __pycache__/
.next/   .svelte-kit/   .turbo/   coverage/   .venv/   vendor/
```

**`.gitignore` parsing:**

- Read the workspace-root `.gitignore` and any nested `.gitignore` files encountered while walking.
- Apply standard gitignore semantics: globs, negation (`!`), directory-only (`foo/`), anchored (`/foo`).
- Recommended: do the filtering in Rust `list_dir_tree` using the `ignore` crate (same engine ripgrep uses) so the tree is filtered at the source and the TS side stays thin.

**Depth and count limits:**

| Constant | Default | Behavior on exceed |
|----------|---------|--------------------|
| `MAX_TREE_DEPTH` | `4` | Stop descending; annotate `… (deeper entries omitted)` |
| `MAX_TREE_FILES` | `200` | Truncate; annotate `… (N more files)` |

**Refresh cadence:** the tree snapshot embedded in the system prompt is rebuilt at the **start of each agent turn**, not every message. In Chat mode the tree block is omitted entirely (no tools, no need).

### 2.3 Files to change

| File | Change |
|------|--------|
| `src-tauri/src/modules/filesystem.rs` | `list_dir_tree` uses `ignore` crate; honors always-exclude + `.gitignore`; enforces depth/count caps |
| `src/lib/agent/workspaceContext.ts` | Consume filtered tree; omit block in Chat mode; annotate truncation |
| `src/lib/tools/toolRunner.ts` | `get_file_tree` handler passes through the same filtered command |

---

## 3. `read_file` Size Cap & Pagination

> ⚠️ **Deferred — discuss before implementing (implement LAST).** This section changes what the model receives each turn and is grouped with the context/tool-calling/assembly work in [30-agent-context-and-model-settings.md](30-agent-context-and-model-settings.md). It will **not** ship in the first Phase 0 batch. Open points to settle first: default `max_lines` value, whether pagination should be model-visible vs automatic, and interaction with the per-model `contextWindow` setting ([30](30-agent-context-and-model-settings.md) §3). The §2 `.gitignore` tree filtering below is unaffected and ships now.

### 3.1 Problem

`read_file` returns the whole file. A 3,000-line file in a 16k window leaves almost nothing for reasoning.

### 3.2 Tool schema changes

Extend the `read_file` definition in `toolDefinitions.ts`:

```jsonc
{
  "name": "read_file",
  "parameters": {
    "properties": {
      "path":       { "type": "string",  "description": "Workspace-relative or absolute path" },
      "start_line": { "type": "integer", "description": "1-indexed first line to read (default 1)" },
      "max_lines":  { "type": "integer", "description": "Maximum lines to return (default 500)" }
    },
    "required": ["path"]
  }
}
```

Defaults: `start_line: 1`, `max_lines: 500`.

### 3.3 Truncation annotation

When the returned slice does not cover the whole file, append:

```
[File truncated: showing lines 1–500 of 2847. Call read_file again with start_line: 501 to continue.]
```

The annotation is part of the tool result string so the model can act on it. A separate `read_file_range` tool is **not** added — pagination folds into `read_file` (one fewer schema to send, per §4).

### 3.4 Rust hard cap (defense in depth)

`read_file` in `filesystem.rs` enforces an **absolute 50,000-character cap** on the returned slice regardless of frontend parameters. This protects against prompt injection via a hostile very-large file and against a buggy/oversized `max_lines`. If the requested slice still exceeds 50k chars, it is cut at 50k with a `[… hard cap reached]` marker.

### 3.5 Files to change

| File | Change |
|------|--------|
| `src/lib/tools/toolDefinitions.ts` | `start_line` / `max_lines` params |
| `src/lib/tools/toolRunner.ts` | Pass params; build truncation annotation |
| `src-tauri/src/modules/filesystem.rs` | Line-range read + 50k hard cap |

---

## 4. Tool Schema Trimming by Mode

> ⚠️ **Deferred — discuss before implementing (implement LAST).** Trimming the tool-schema payload by mode directly alters the assembled prompt, so it is grouped with the assembly-order work in [30-agent-context-and-model-settings.md](30-agent-context-and-model-settings.md) §7 and decided alongside it (the assembler should be extracted to a testable `assemble.ts` first). It will **not** ship in the first Phase 0 batch.

### 4.1 Problem

Each tool schema costs ~100–300 tokens. Sending all 16 in Plan mode (only 9 usable) or Chat mode (0 usable) is pure waste.

### 4.2 Spec

`buildSystemPrompt()` in `ChatPane.svelte` computes the **effective tool list**:

```
effective = modeTools ∩ policyAllowed   (deny removed)
```

and passes **only those schemas** to `streamOneTurn()`.

| Mode | Tool schemas sent | `TOOL_USE_INSTRUCTION` | `TOOL_SUMMARY_INSTRUCTION` |
|------|-------------------|------------------------|----------------------------|
| chat | none | omitted | omitted |
| plan | effective read-only set | included | included |
| agent | effective full set | included | included |

This is consistent with the existing rule "effective tools = mode tools ∩ policy" already stated in [09-tool-system.md](09-tool-system.md); this spec makes the **schema payload** match what is already conceptually true.

### 4.3 Files to change

| File | Change |
|------|--------|
| `src/modules/agent/ChatPane.svelte` | Compute effective list; gate instructions by mode |
| `src/lib/agent/streamTurn.ts` | Accept and forward the trimmed `tools` array (already parameterized) |

---

## 5. Tool Call Fallback — Malformed JSON Handling

### 5.1 Problem

`textToolCalls.ts` parses tool calls from plain text for models without native function calling. On a JSON parse failure the behavior is undocumented; a silent drop makes the agent appear to hang.

### 5.2 Spec

On parse failure, push a **visible tool result** into history:

```
[Tool call parse error: model emitted invalid JSON for a tool call.
Raw (first 200 chars): {"name": "read_file", "arg ...]
```

This surfaces to both user and model, enabling self-correction on the next turn.

Add a **`parseAttempts`** counter on the agent run:

- If 3 consecutive turns produce only unparseable tool calls, **abort** the loop with a toast:
  > "Agent stalled: the model is not producing valid tool calls. Try a different model or simplify the request."

### 5.3 Files to change

| File | Change |
|------|--------|
| `src/lib/agent/textToolCalls.ts` | Return a structured parse-error result instead of dropping |
| `src/modules/agent/ChatPane.svelte` | Track `parseAttempts`; abort + toast at 3 |

---

## 6. Stall Detection in the Agent Loop

### 6.1 Problem

A weak model can call the same tool with identical arguments repeatedly, burning steps and context without progress.

### 6.2 Spec

Track the last **N = 3** tool calls as `{ name, argsHash }` tuples within the run.

| Repeat count in window | Action |
|------------------------|--------|
| 2× identical `(name, argsHash)` | Inject system note: `[Note: you called ${tool} with identical arguments twice. Review the previous result and try a different approach.]` |
| 3× identical | Abort loop; toast: `"Agent stopped: repeated the same tool call without progress."` |

**`argsHash`** is a stable `JSON.stringify` (sorted keys) passed through a djb2 hash — no crypto dependency.

```typescript
function argsHash(args: Record<string, unknown>): string {
  const stable = JSON.stringify(args, Object.keys(args).sort());
  let h = 5381;
  for (let i = 0; i < stable.length; i++) h = ((h << 5) + h) ^ stable.charCodeAt(i);
  return (h >>> 0).toString(36);
}
```

### 6.3 Files to change

| File | Change |
|------|--------|
| `src/lib/agentLimits.ts` | Add stall types/constants (`STALL_WINDOW = 3`) + `argsHash` helper |
| `src/modules/agent/ChatPane.svelte` | Maintain the sliding window; inject note / abort |

---

## 7. Implementation Plan

### Phase 1 — Context efficiency (P0) — ships now

- [ ] `.gitignore` + always-exclude + depth/count caps in Rust `list_dir_tree`
- [ ] Omit tree block in Chat mode; rebuild per agent turn in Plan/Agent

**Deliverable:** Local models start every session with a clean, bounded file tree.

### Deferred to the "discuss-first" group (implement LAST — see [30](30-agent-context-and-model-settings.md))

- [ ] `read_file` `start_line` / `max_lines` + truncation annotation (§3)
- [ ] Rust 50k hard cap on `read_file` (§3.4)
- [ ] Tool schema trimming by effective mode list; drop tool instructions in Chat mode (§4)

These three move the goalposts on per-turn context and must be reconciled with the assembly-order and per-model-settings decisions in [30](30-agent-context-and-model-settings.md) before implementation.

### Phase 2 — Loop robustness (P1)

- [ ] Malformed tool-call error result + `parseAttempts` abort
- [ ] Stall detection sliding window + note/abort
- [ ] Unit tests for `argsHash`, truncation annotation, gitignore filtering

**Deliverable:** Weak models fail loudly and recover instead of hanging.

---

## 8. Edge Cases & Failure Modes

| Scenario | Handling |
|----------|----------|
| No `.gitignore` present | Apply always-exclude list only |
| Nested `.gitignore` contradicts root | Standard gitignore precedence (nearest wins) |
| `start_line` beyond EOF | Return empty slice + `[start_line N is past end of file (M lines)]` |
| `max_lines` ≤ 0 | Clamp to default 500 |
| File is binary | Existing binary detection returns a `[binary file omitted]` note (unchanged) |
| Model emits valid + invalid tool calls in one turn | Execute valid ones; push parse error for invalid ones; do not count toward stall |
| Same tool, different args | Not a stall — only `(name, argsHash)` equality counts |
| Stall note already injected, model corrects | Reset window on a non-duplicate call |

---

## 9. What Not To Do

- **Do not** silently drop malformed tool calls — that is the current bug this spec fixes.
- **Do not** summarize large files automatically; let the model paginate so it controls what it reads.
- **Do not** send tool schemas the model cannot call — it invites hallucinated calls and wastes tokens.
- **Do not** rely solely on the frontend cap for `read_file`; the Rust hard cap is the security boundary.
- **Do not** abort the loop on the first duplicate — one nudge first, abort on persistence.

---

## 10. Acceptance Criteria

1. With `node_modules/` present, no `node_modules` path appears in the system prompt tree or `get_file_tree` output.
2. `read_file` on a 2,000-line file returns ≤ 500 lines by default with a truncation annotation; `start_line` paginates correctly.
3. Rust refuses to return more than 50,000 characters from `read_file` regardless of parameters.
4. In Chat mode, no tool schemas and no `TOOL_USE_INSTRUCTION` are sent; in Plan mode, only the 9 read-only schemas (minus any denied) are sent.
5. A model emitting invalid tool-call JSON produces a visible error result; three consecutive failures abort with a toast.
6. A model repeating an identical tool call is nudged once and aborted on the third repeat.

---

*Spec created: 2026-05-30 · Source: `extension.md` §2 · Target: Phase 0 (polish & trust)*
