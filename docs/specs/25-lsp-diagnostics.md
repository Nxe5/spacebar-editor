# Spec 25 — LSP & Diagnostics

> **Status:** ❌ Not started (stub: `editorErrorCountsByRel` in `src/lib/stores/editorDiagnostics.ts`)
> **Area:** Rust Backend · IPC · Editor (CodeMirror) · Settings
> **Phase:** 1–2 — Competitive parity ([17-roadmap.md](17-roadmap.md) Phase D)
> **Depends on:** [10-editor.md](10-editor.md) (CodeMirror) · [12-ipc.md](12-ipc.md) (process spawn + events) · [04-entry-points.md](04-entry-points.md)

> **Related:** `extension.md` §5 · [28-inline-edit-autocomplete.md](28-inline-edit-autocomplete.md) (completions overlap)

---

## 1. Overview

The absence of language intelligence — diagnostics, hover docs, go-to-definition, rename — is the single biggest gap versus Cursor for experienced developers. This spec defines a phased **Language Server Protocol (LSP)** integration: Tauri spawns language servers as child processes; a frontend client speaks JSON-RPC over Tauri events and feeds CodeMirror.

Phase 1 targets **TypeScript/JavaScript** (highest ROI, covers most users) with diagnostics + hover + basic completions. Phase 2 adds Rust, Python, CSS/HTML, and Go using the same transport, plus go-to-definition and rename.

### Goals

- Inline error/warning squiggles backed by a real language server.
- Hover documentation on symbols.
- Completions that augment or replace manual autocomplete ([28](28-inline-edit-autocomplete.md)).
- A transport that generalizes to any LSP server with config-only changes.
- Feeds the existing `editorErrorCountsByRel` stub for per-file error counts.

### Non-Goals

- Bundling language servers (users install them; the app discovers binaries on PATH).
- Multi-root workspace LSP (single workspace root, matching the product).
- A custom protocol — strict adherence to the LSP spec over JSON-RPC.
- Debugger / DAP integration (out of scope entirely).

---

## 2. Architecture

```
CodeMirror (EditorSurface)
   │  document edits, hover, completion requests
   ▼
src/lib/lsp/lspClient.ts   ── JSON-RPC over Tauri ──►  Rust lsp.rs
   ▲                                                     │  stdio
   │  lsp:message events                                 ▼
   └───────────────────────────────────  language server child process
```

- One server process per language per workspace.
- Communication is **JSON-RPC 2.0** over the server's `stdio`, bridged through Tauri events.
- The frontend maps file URIs ↔ workspace paths and correlates request/response IDs.

---

## 3. Rust Side — `src-tauri/src/modules/lsp.rs`

### 3.1 Commands & events

| Command / Event | Signature | Role |
|-----------------|-----------|------|
| `spawn_lsp` | `(server_cmd: string, args: string[], workspace_path) -> lsp_id` | Start a server child process |
| `lsp_send` | `(lsp_id, message: JsonValue) -> ()` | Write a framed JSON-RPC message to stdin |
| `lsp_stop` | `(lsp_id) -> ()` | Terminate the server |
| Event `lsp:message` | `{ lspId, message: JsonValue }` | Server → webview JSON-RPC message |
| Event `lsp:exit` | `{ lspId, code }` | Server process exited |

### 3.2 Framing

LSP uses `Content-Length`-framed messages over stdio. Rust handles framing/de-framing so the frontend deals only with parsed JSON objects.

### 3.3 Process management

- Track child processes in managed state (like `PtyManager`).
- Kill all servers on workspace close and on app exit.
- Capture stderr to a debug log; surface fatal startup errors to the UI.

---

## 4. Frontend — `src/lib/lsp/`

| File | Role |
|------|------|
| `lspProtocol.ts` | TypeScript types for LSP messages (subset used) |
| `lspClient.ts` | JSON-RPC over Tauri events; request/response correlation; initialize handshake; `textDocument/*` notifications |
| `lspCodeMirror.ts` | CodeMirror extension: diagnostics (linter source), hover tooltip, completion source |
| `lspStore.ts` | Active servers map; diagnostics by file → updates `editorErrorCountsByRel` |

### 4.1 Lifecycle

1. On opening a file whose language has an enabled server, ensure a server is running for that language.
2. Send `initialize` → `initialized`; open the document (`textDocument/didOpen`).
3. Forward edits as `textDocument/didChange` (debounced).
4. Receive `textDocument/publishDiagnostics` → render squiggles + update error counts.
5. On hover/completion, issue `textDocument/hover` / `textDocument/completion`.

---

## 5. Phase 1 — TypeScript/JavaScript

**Server:** `typescript-language-server --stdio` (with `typescript` installed).

**Features:**

- Diagnostics (errors/warnings) → CodeMirror lint squiggles + `editorErrorCountsByRel`.
- Hover documentation.
- Basic completions (augments/replaces manual autocomplete — coordinate with [28](28-inline-edit-autocomplete.md)).

**Deferred to Phase 2:** go-to-definition, find references, rename, code actions/quick-fixes.

---

## 6. Phase 2 — Additional Languages

| Language | Server | Install |
|----------|--------|---------|
| Rust | `rust-analyzer` | rustup component / binary |
| Python | `pyright` or `pylsp` | npm / pip |
| CSS/HTML/JSON | `vscode-langservers-extracted` | npm |
| Go | `gopls` | `go install` |

All share `lsp.rs` and the frontend client — only server command + capabilities config differ. Phase 2 also adds go-to-definition, rename, and code actions across all languages.

---

## 7. Server Discovery & Settings

New **Settings → LSP** section:

- **Auto-detect** installed servers (probe PATH for known binary names).
- **Manual path override** per language.
- **Enable/disable** per language.
- Status indicator per server (running / stopped / error).

Settings shape (in `tinyllama.settings.v3`):

```typescript
interface LspServerConfig {
  language: string;          // "typescript" | "rust" | ...
  enabled: boolean;
  command: string | null;    // null = auto-detect
  args: string[];
}

interface SettingsState {
  // ...
  lsp: { servers: LspServerConfig[] };
}
```

---

## 8. Implementation Plan

### Phase 1a — Transport

- [ ] `lsp.rs`: spawn/send/stop + `lsp:message` framing; managed process state
- [ ] `lspClient.ts` + `lspProtocol.ts`: initialize handshake, request correlation
- [ ] Register commands in `main.rs`

**Deliverable:** Round-trip JSON-RPC to a spawned server.

### Phase 1b — TS diagnostics + hover

- [ ] `lspCodeMirror.ts`: diagnostics linter source + hover tooltip
- [ ] `lspStore.ts`: diagnostics map → `editorErrorCountsByRel`
- [ ] Document sync (didOpen/didChange/didClose), debounced
- [ ] Settings → LSP: TypeScript enable + auto-detect

**Deliverable:** Inline TS errors and hover docs.

### Phase 1c — Completions

- [ ] CodeMirror completion source via `textDocument/completion`
- [ ] Reconcile with manual autocomplete ([28](28-inline-edit-autocomplete.md))

**Deliverable:** LSP-backed completions for TS/JS.

### Phase 2 — More languages + navigation

- [ ] Generalize server config; add rust-analyzer, pyright, gopls, CSS/HTML
- [ ] Go-to-definition, find references, rename, code actions

**Touch points:**

| File | Change |
|------|--------|
| `src-tauri/src/modules/lsp.rs` | New module |
| `src-tauri/src/main.rs` | Register LSP commands |
| `src/lib/lsp/` | New client module |
| `src/lib/stores/editorDiagnostics.ts` | Consume LSP diagnostics |
| `src/modules/editor/EditorSurface.svelte` | Wire LSP CodeMirror extension |
| `src/modules/settings/SettingsPane.svelte` | LSP section |

---

## 9. Edge Cases & Failure Modes

| Scenario | Handling |
|----------|----------|
| Server binary not installed | Settings shows "not found"; feature disabled for that language; no crash |
| Server crashes mid-session | `lsp:exit` → mark stopped; offer restart; clear stale diagnostics |
| Large project slow to index | Show "indexing…" state; diagnostics arrive when ready |
| File outside workspace opened | Skip LSP (single-root scope) |
| Multiple files same language | Reuse one server; didOpen each document |
| No Tauri (web dev) | LSP unavailable; editor works without diagnostics |
| Server emits non-spec output | Log to stderr debug; ignore unparseable frames |

---

## 10. Open Questions

| Question | Recommendation |
|----------|----------------|
| Bundle `typescript-language-server`? | No — detect on PATH; document install. Bundling bloats the app and dates fast. |
| LSP completions vs Ollama autocomplete ([28](28))? | LSP wins for typed languages; fall back to model autocomplete where no server. |
| Restart policy on crash? | Manual restart button + one auto-retry; avoid crash loops. |
| Where do diagnostics counts surface? | Editor gutter + status bar via `editorErrorCountsByRel`. |

---

## 11. Acceptance Criteria

1. With `typescript-language-server` on PATH, opening a `.ts` file shows real diagnostics as squiggles.
2. Hovering a symbol shows documentation from the server.
3. Diagnostic counts populate `editorErrorCountsByRel` and appear in the editor gutter/status bar.
4. Settings → LSP auto-detects installed servers and allows per-language enable + path override.
5. A missing server binary degrades gracefully (feature off, no crash).
6. Phase 2 servers (rust-analyzer, pyright, gopls) work through the same transport with config-only changes.

---

*Spec created: 2026-05-30 · Source: `extension.md` §5 · Target: Phase 1 (TS) → Phase 2 (parity)*
