# Roadmap

> **Status:** 📋 **ACTIVE** — Living document tracking phased priorities.

---

## Phase Overview

| Phase | Focus | Status |
|-------|-------|--------|
| **Phase A** | Dogfooding | ✅ Mostly complete |
| **Phase B** | Trust and reliability | 🚧 Planning |
| **Phase C** | Security | ❌ Not started |
| **Phase D** | v1.0 parity | ❌ Not started |

---

## Phase A — Dogfooding (In Progress / Recent)

| Item | Status | Notes |
|------|--------|-------|
| Configurable agent limits (steps, tool calls) | ✅ Done | Settings → Tools |
| Provider-specific chat footer | ✅ Done | Ollama/llama.cpp/Anthropic variants |
| Monthly API usage tracking (Anthropic) | ✅ Done | `providerUsage` store |
| Git panel redesign + discard + diff view | ✅ Done | Full implementation |
| Expanded syntax grammars + custom syntax colors | ✅ Done | 15 languages |
| Per-project `state.json` (chat + editor tabs) | ✅ Done | `.sidebar/state.json` |
| Parallel read-only tools | ✅ Done | [38-parallel-tool-execution.md](38-parallel-tool-execution.md) |
| Context overflow warnings | ✅ Done | [34-context-overflow-warnings.md](34-context-overflow-warnings.md) |
| Workspace search panel | ✅ Done | [26-search-panel.md](26-search-panel.md) |
| Welcome screen + recent projects | ✅ Done | [36-first-run-onboarding.md](36-first-run-onboarding.md) |
| Workbench themes (incl. Rosé Pine) + theme→editor sync | ✅ Done | [13-theming.md](13-theming.md) |
| Filter custom tools without handlers | ❌ Planned | Tool system cleanup |
| **Planning system** (`plans/` + file-backed Plan mode) | ❌ Spec ready | [19-planning-system.md](19-planning-system.md) |
| **Agent activity step grouping** (Plan → steps, not raw shell rows) | 📋 **v0.1.1** | [40](40-product-hardening-and-agent-ux.md) §5 — remaining |
| **LSP agent tools** (`lsp_find_references`, etc.) | ✅ Done | [41](41-lsp-agent-tools.md) |
| **Scope-aware shell policy** (`pnpm test` auto-allow, etc.) | ✅ Done | [40](40-product-hardening-and-agent-ux.md) §6 — v0.1.1 |
| **Nested scaffold notice** (agent created `tester/` inside workspace) | ✅ Done | [40](40-product-hardening-and-agent-ux.md) §4 — v0.1.1 |
| **Editor wrap + syntax/markdown colors** | ✅ Done | [20-editor-formatting-and-theming.md](20-editor-formatting-and-theming.md) |
| **Prettier (format document / on save)** | ✅ Done | [20-editor-formatting-and-theming.md](20-editor-formatting-and-theming.md) |

---

## Phase B — Trust and Reliability (Pre–Private Beta)

| Item | Status | Notes |
|------|--------|-------|
| Rust workspace path enforcement | ❌ Not started | All path-taking FS IPC — [33](33-rust-path-enforcement.md) |
| Agent error recovery | ✅ Done | [32-agent-error-recovery.md](32-agent-error-recovery.md) |
| Workspace lock | ✅ Done | [35-workspace-lock.md](35-workspace-lock.md) |
| File watcher → UI | ✅ Done | [24-filesystem-watcher.md](24-filesystem-watcher.md) |
| Shortcut rebinding | ✅ Done | [37-shortcut-rebinding.md](37-shortcut-rebinding.md) |
| Agent turn undo | ❌ Not started | Snapshot or git-based batch discard |
| **Context compaction** | ✅ Done | [21-context-compaction.md](21-context-compaction.md) — experimental in Settings |

---

## Phase C — Security (Before External Users)

> Full program: [40-product-hardening-and-agent-ux.md](40-product-hardening-and-agent-ux.md)

| Item | Status | Notes |
|------|--------|-------|
| OS keychain / keyring | ❌ Not started | **P0** — [40](40-product-hardening-and-agent-ux.md) §3; keys never in `localStorage` |
| LLM calls in Rust | ❌ Not started | `reqwest` + stream events |
| Production CSP | ❌ Not started | `tauri.conf.json` |

---

## Phase D — v1.0 Parity (Selective)

| Item | Status | Notes |
|------|--------|-------|
| LSP Phase 1 | 🔶 Partial | [25-lsp-diagnostics.md](25-lsp-diagnostics.md) — transport, diagnostics, hover shipped |
| Cmd+K inline edit | ❌ Spec ready | [28-inline-edit-autocomplete.md](28-inline-edit-autocomplete.md) — CodeMirror decorations |
| DeepSeek | ✅ | `deepseek` chat backend; Settings → DeepSeek |
| Mistral, Perplexity | ❌ Not started | OpenAI-compat + provider registry |
| Custom tool shell executor | ❌ Not started | Optional `.sidebar` command templates |
| Context compaction | ❌ Spec ready | [21-context-compaction.md](21-context-compaction.md) — not sliding window |
| Full provider billing APIs | ❌ Not started | Beyond local monthly estimates |

---

## Enhancement Program (from `extension.md`)

> Competitive-positioning plan layered onto the phases above. Each item links to a full spec. Phases here (0–3) map onto roadmap Phases B→D; they are an execution ordering, not separate release gates.

### Phase 0 — Polish & Trust (1–2 weeks)

Small, high-visibility fixes that immediately raise confidence in the tool.

| Item | Spec | Status |
|------|------|--------|
| Filesystem watcher → tree + git refresh | [24-filesystem-watcher.md](24-filesystem-watcher.md) | ✅ Done |
| Search panel wired up | [26-search-panel.md](26-search-panel.md) | ✅ Done |
| Compaction visual divider + archive/restore | [21-context-compaction.md](21-context-compaction.md) | ✅ Done |
| Context overflow bar states | [34-context-overflow-warnings.md](34-context-overflow-warnings.md) | ✅ Done |
| `read_file` size cap + pagination | [22-llm-file-interaction.md](22-llm-file-interaction.md) §3 | 🔶 Partial |
| Tool schema trimming by mode | [22](22-llm-file-interaction.md) §4 | 🔶 Partial |
| `.gitignore` respect + depth caps in file tree | [22](22-llm-file-interaction.md) §2 | 🔶 Partial |
| Preview iframe sandbox | [14-security.md](14-security.md) §B | ❌ Spec ready |

### Phase 1 — Core Differentiators (4–8 weeks)

Close the gap with Cursor and lean into the local-first power-user position.

| Item | Spec | Status |
|------|------|--------|
| Skills system (detection, variables, sidebar, bundled pack) | [23-skills-system.md](23-skills-system.md) | ❌ Spec ready |
| Stall detection + tool-call error surfacing | [22](22-llm-file-interaction.md) §5–6 | ❌ Spec ready |
| LSP Phase 1 — diagnostics + hover | [25-lsp-diagnostics.md](25-lsp-diagnostics.md) | 🔶 Partial |
| Autocomplete inference hook (Ollama FIM) | [28-inline-edit-autocomplete.md](28-inline-edit-autocomplete.md) §2 | ❌ Spec ready |
| Enhanced tool instructions + capability flags | [27-local-model-ux.md](27-local-model-ux.md) §2–3 | ❌ Spec ready |
| Context window auto-detection | [21](21-context-compaction.md) §15.3 | ❌ Spec ready |
| Context budget visualization | [21](21-context-compaction.md) §15.2 | ❌ Spec ready |

### Phase 2 — Competitive Parity (8–16 weeks)

Retain developers coming from Cursor.

| Item | Spec | Status |
|------|------|--------|
| Inline edit (Cmd+K) | [28-inline-edit-autocomplete.md](28-inline-edit-autocomplete.md) §3 | ❌ Spec ready |
| LSP Phase 2 — go-to-def, rename, Rust/Python/Go | [25-lsp-diagnostics.md](25-lsp-diagnostics.md) §6 | ❌ Spec ready |
| OS keychain for API keys | [14-security.md](14-security.md) §A | ❌ Spec ready |
| Ollama model pull UI + recommendations | [27-local-model-ux.md](27-local-model-ux.md) §4 | ❌ Spec ready |
| Shortcut rebinding | [37-shortcut-rebinding.md](37-shortcut-rebinding.md) | ✅ Done |

### Phase 3 — Ecosystem (16+ weeks)

Compound value through community and extensibility.

| Item | Spec | Status |
|------|------|--------|
| Skills registry (GitHub-based → hosted) | [29-skills-registry.md](29-skills-registry.md) | ❌ Spec ready |
| Plugin / extension API (userland tools) | — | ❌ Not started |
| File-backed plans (`plans/`) | [19-planning-system.md](19-planning-system.md) | 🔶 Spec ready |
| Multi-workspace / project switcher | — | ❌ Deferred |

---

## Explicitly Deferred

| Item | Reason |
|------|--------|
| Multi-root workspaces | Complexity; single folder per window sufficient |
| Cloud sync | Local-first philosophy |
| Mobile / web deployment | Desktop-focused product |
| Matching Cursor feature-for-feature | Different scope and goals |
| Executable/plugin skills | Skills stay declarative; plugins are a separate future spec |

---

## Recent Completions (2026)

| Date | Item |
|------|------|
| 2026-05 | Git checkpoint infrastructure (Rust backend) |
| 2026-05 | Provider server config templates |
| 2026-05 | Chat appearance customization |
| 2026-05 | Agent activity feed |
| 2026-05 | Text tool calls display |
| 2026-05 | Streaming status word |
| 2026-05 | Chat rewind functionality |
| 2026-04 | Agent synthesis |
| 2026-04 | Context budget system |

---

## Contributing

When adding new roadmap items:

1. Add to appropriate phase
2. Include brief notes
3. Update status as work progresses
4. Move to "Recent Completions" when done
