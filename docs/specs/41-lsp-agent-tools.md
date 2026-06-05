# Spec 41 — LSP Agent Tools

> **Status:** ✅ **Implemented** — frontend `LspClient` bridge (`src/lib/lsp/lspAgentBridge.ts`); five read-only tools; Plan + Agent modes; diagnostics from cached `lspDiagnostics`.
> **Area:** LSP · Agent Tools · Code Intelligence
> **Phase:** C (differentiating capability for local-first)
> **Depends on:** [25-lsp-diagnostics.md](25-lsp-diagnostics.md) · [09-tool-system.md](09-tool-system.md) · [08-ai-agent.md](08-ai-agent.md)

> **Related:** [32-agent-error-recovery.md](32-agent-error-recovery.md) · [03-architecture.md](03-architecture.md)

---

## 1. Overview

Spacebar Editor runs language servers for the editor (diagnostics, hover — [25](25-lsp-diagnostics.md)). This spec exposes LSP capabilities as **agent-facing tools** so the AI can reason about code structure before and during edits.

### Design philosophy

- **Read-only, always allowed.** Default policy `allow` in Agent and Plan modes.
- **Graceful degradation.** Clear error when no server; agent falls back to grep.
- **Model-legible output.** `file:line:col` format.
- **Server lifecycle is the editor's responsibility.** Tools use `ensureLspServer` / `LspClient`; they do not spawn servers independently.

### Implementation note

The original spec proposed a Rust `lsp_agent_query` command. **Shipped architecture** uses the existing frontend JSON-RPC client (`LspClient`) because request/response correlation already lives in the webview. Rust remains transport-only (`spawn_lsp`, `lsp_send`).

---

## 2. Tools (shipped)

| Tool | LSP method | Policy |
|------|------------|--------|
| `lsp_find_references` | `textDocument/references` | allow |
| `lsp_go_to_definition` | `textDocument/definition` | allow |
| `lsp_document_symbols` | `textDocument/documentSymbol` | allow |
| `lsp_workspace_symbols` | `workspace/symbol` | allow |
| `lsp_get_diagnostics` | cached `publishDiagnostics` | allow |

**Modes:** Chat — no LSP tools. Plan + Agent — yes (via `READ_ONLY_TOOLS` + `ALL_TOOL_NAMES`).

**Positions:** Tool args use **1-based** line/character; converted to LSP 0-based internally.

---

## 3. Agent limits (Settings → Tools)

| Key | Default |
|-----|---------|
| `lspToolTimeout` | 5000 ms |
| `lspWorkspaceSymbolTimeout` | 8000 ms |
| `lspToolsCountTowardLimit` | false |

---

## 4. Companion: shell output spill

Large `run_shell` output is capped at **48 KB** in the tool result; full logs spill to `.sidebar/runs/<uuid>.log` with an index at `.sidebar/runs/index.json`. See `src/lib/tools/shellOutputSpill.ts`.

---

## 5. Companion: compaction tool retention

After compaction, the kept message window extends backward to include the last **N** tool messages (`compactKeepRecentToolMessages`, default 5). See `buildCompactedMessages` in `src/lib/agent/compactHistory.ts`.

---

## 6. Phase 2 (deferred)

- `lsp_hover` / type info
- Writable LSP (`rename`, `codeAction`) with git checkpoint

---

## 7. Acceptance

- [x] Five LSP tools registered in `toolDefinitions.ts` and `toolRunner.ts`
- [x] Read-only; default allow policy
- [x] Actionable errors when server unavailable
- [x] System prompt mentions LSP vs grep fallback
- [ ] Dogfooding: refactor task uses `lsp_find_references` before edits (manual QA)

---

## 8. Documentation updates

| Doc | Update |
|-----|--------|
| [09-tool-system.md](09-tool-system.md) | LSP tool category |
| [25-lsp-diagnostics.md](25-lsp-diagnostics.md) | Cross-link agent tools |
| [08-ai-agent.md](08-ai-agent.md) | Tool table |
