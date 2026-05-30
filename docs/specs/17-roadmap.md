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
| Per-project `state.json` (chat + editor tabs) | ✅ Done | `.tinyllama/state.json` |
| Parallel read-only tools | ❌ Planned | Optimization |
| Context overflow warnings + API usage in meter | ❌ Planned | UX improvement |
| Filter custom tools without handlers | ❌ Planned | Tool system cleanup |
| **Planning system** (`plans/` + file-backed Plan mode) | ❌ Spec ready | [19-planning-system.md](19-planning-system.md) |
| **Editor wrap + syntax/markdown colors** | ❌ Spec ready | [20-editor-formatting-and-theming.md](20-editor-formatting-and-theming.md) |
| **Prettier (format document / on save)** | ❌ Spec ready | [20-editor-formatting-and-theming.md](20-editor-formatting-and-theming.md) |

---

## Phase B — Trust and Reliability (Pre–Private Beta)

| Item | Status | Notes |
|------|--------|-------|
| Rust workspace path enforcement | ❌ Not started | All path-taking FS IPC |
| Agent error recovery | ❌ Not started | Retry, cancel cleanup, Continue after max steps |
| Workspace lock | ❌ Not started | Prevent two windows corrupting `state.json` |
| File watcher → UI | ❌ Spec ready | [24-filesystem-watcher.md](24-filesystem-watcher.md) — wire `watcher.rs` to `filesystemSync` |
| Agent turn undo | ❌ Not started | Snapshot or git-based batch discard |
| **Context compaction** | ❌ Spec ready | [21-context-compaction.md](21-context-compaction.md) — auto + manual, editable threshold % |

---

## Phase C — Security (Before External Users)

| Item | Status | Notes |
|------|--------|-------|
| Stronghold / keychain | ❌ Not started | Keys never in JS |
| LLM calls in Rust | ❌ Not started | `reqwest` + stream events |
| Production CSP | ❌ Not started | `tauri.conf.json` |

---

## Phase D — v1.0 Parity (Selective)

| Item | Status | Notes |
|------|--------|-------|
| LSP | ❌ Spec ready | [25-lsp-diagnostics.md](25-lsp-diagnostics.md) — spawn language servers from Rust |
| Cmd+K inline edit | ❌ Spec ready | [28-inline-edit-autocomplete.md](28-inline-edit-autocomplete.md) — CodeMirror decorations |
| DeepSeek | ✅ | `deepseek` chat backend; Settings → DeepSeek |
| Mistral, Perplexity | ❌ Not started | OpenAI-compat + provider registry |
| Custom tool shell executor | ❌ Not started | Optional `.tinyllama` command templates |
| Context compaction | ❌ Spec ready | [21-context-compaction.md](21-context-compaction.md) — not sliding window |
| Full provider billing APIs | ❌ Not started | Beyond local monthly estimates |

---

## Enhancement Program (from `extension.md`)

> Competitive-positioning plan layered onto the phases above. Each item links to a full spec. Phases here (0–3) map onto roadmap Phases B→D; they are an execution ordering, not separate release gates.

### Phase 0 — Polish & Trust (1–2 weeks)

Small, high-visibility fixes that immediately raise confidence in the tool.

| Item | Spec | Status |
|------|------|--------|
| Filesystem watcher → tree + git refresh | [24-filesystem-watcher.md](24-filesystem-watcher.md) | ❌ Spec ready |
| `read_file` size cap + pagination | [22-llm-file-interaction.md](22-llm-file-interaction.md) §3 | ❌ Spec ready |
| Tool schema trimming by mode | [22](22-llm-file-interaction.md) §4 | ❌ Spec ready |
| `.gitignore` respect + depth caps in file tree | [22](22-llm-file-interaction.md) §2 | ❌ Spec ready |
| Search panel wired up | [26-search-panel.md](26-search-panel.md) | ❌ Spec ready |
| Compaction visual divider | [21-context-compaction.md](21-context-compaction.md) §15.1 | ❌ Spec ready |
| Preview iframe sandbox | [14-security.md](14-security.md) §B | ❌ Spec ready |

### Phase 1 — Core Differentiators (4–8 weeks)

Close the gap with Cursor and lean into the local-first power-user position.

| Item | Spec | Status |
|------|------|--------|
| Skills system (detection, variables, sidebar, bundled pack) | [23-skills-system.md](23-skills-system.md) | ❌ Spec ready |
| Stall detection + tool-call error surfacing | [22](22-llm-file-interaction.md) §5–6 | ❌ Spec ready |
| LSP Phase 1 — TypeScript diagnostics + hover | [25-lsp-diagnostics.md](25-lsp-diagnostics.md) | ❌ Spec ready |
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
| Shortcut rebinding | — | ❌ Not started |

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
