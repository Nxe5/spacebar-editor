# Roadmap

> **Status:** 📋 **ACTIVE** — Living document tracking phased priorities.

---

## Release Targets

| Version | Target | Status | Scope |
|---------|--------|--------|-------|
| **v0.1.2** | Public beta | ✅ **Shipped** (2026-06-05) | Keychain (later reverted), Rust path enforcement, CSP, agent turn undo |
| **v0.1.3** | Post-beta | ✅ **Shipped** (2026-06-09) | Browser tab, element inspector, drag-drop chips, compaction defaults |
| **v0.1.4** | Patch | ✅ **Shipped** (2026-06-10) | Native OS drop, chip icons, click-to-open, spec audit |
| **v0.1.5** | Current | 🔶 In progress | GLM + Kimi providers, API keys in app settings, PTY resize |
| **v0.1.6** | Next | 📋 Planned | Trust boundary release — [45](45-security-hardening-and-capability-expansion.md) (workspace trust, narrow-only policy, web access globe, P0 audits) |

---

## Phase Overview

| Phase | Focus | Status |
|-------|-------|--------|
| **Phase A** | Dogfooding | ✅ Mostly complete |
| **Phase B** | Trust and reliability | ✅ Mostly complete (v0.1.2) |
| **Phase C** | Security | ✅ Complete (v0.1.2) |
| **Phase D** | v1.0 parity | ❌ Not started |

---

## Phase A — Dogfooding (Mostly Complete)

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
| **Agent activity step grouping** (Plan → steps, not raw shell rows) | 📋 **v0.1.3** | [40](40-product-hardening-and-agent-ux.md) §5 — remaining |
| **LSP agent tools** (`lsp_find_references`, etc.) | ✅ Done | [41](41-lsp-agent-tools.md) |
| **Scope-aware shell policy** (`pnpm test` auto-allow, etc.) | ✅ Done | [40](40-product-hardening-and-agent-ux.md) §6 — v0.1.1 |
| **Nested scaffold notice** (agent created `tester/` inside workspace) | ✅ Done | [40](40-product-hardening-and-agent-ux.md) §4 — v0.1.1 |
| **Editor wrap + syntax/markdown colors** | ✅ Done | [20-editor-formatting-and-theming.md](20-editor-formatting-and-theming.md) |
| **Prettier (format document / on save)** | ✅ Done | [20-editor-formatting-and-theming.md](20-editor-formatting-and-theming.md) |

---

## Phase B — Trust and Reliability (Pre–Private Beta)

| Item | Status | Notes |
|------|--------|-------|
| Rust workspace path enforcement | ✅ Done | All path-taking FS IPC — [33](33-rust-path-enforcement.md) |
| Agent error recovery | ✅ Done | [32-agent-error-recovery.md](32-agent-error-recovery.md) |
| Workspace lock | ✅ Done | [35-workspace-lock.md](35-workspace-lock.md) |
| File watcher → UI | ✅ Done | [24-filesystem-watcher.md](24-filesystem-watcher.md) |
| Shortcut rebinding | ✅ Done | [37-shortcut-rebinding.md](37-shortcut-rebinding.md) |
| Agent turn undo | ✅ Done | "↩ Undo last turn" button — git checkpoint restore |
| **Workspace trust gate** | ❌ Planned (v0.1.6) | [45](45-security-hardening-and-capability-expansion.md) §2.1 |
| **Tool policy narrow-only (project)** | ❌ Planned (v0.1.6) | [45](45-security-hardening-and-capability-expansion.md) §2.2 — confirmed bug in `mergeProjectToolsLayer` |
| **Web access globe toggle** | ❌ Planned (v0.1.6) | [45](45-security-hardening-and-capability-expansion.md) §4.7 |
| **Patch-style edit tool (`str_replace`)** | ❌ Planned (v0.1.7) | [45](45-security-hardening-and-capability-expansion.md) §4.1 |
| **MLX provider** (Apple Silicon) | ❌ Planned | `mlx_lm.server` OpenAI-compat backend — [42](42-mlx-provider.md) |
| **Context compaction** | ✅ Done | [21-context-compaction.md](21-context-compaction.md) — enabled by default at 85% |

---

## Phase C — Security (Complete — v0.1.2)

> Full program: [40-product-hardening-and-agent-ux.md](40-product-hardening-and-agent-ux.md)

| Item | Status | Notes |
|------|--------|-------|
| OS keychain / keyring | ❌ Reverted (v0.1.5) | Keys now in app settings — avoids OS permission prompts |
| Cloud API keys in app settings | ✅ Done (v0.1.5) | `settings.apiKeys` in `sidebar.settings.v4` |
| LLM calls in Rust | ❌ Deferred | `reqwest` + stream events |
| Production CSP | ✅ Done | `tauri.conf.json` — Anthropic, DeepSeek, GLM (Z.ai), Kimi (Moonshot), localhost |
| GLM provider (Z.ai) | ✅ Done (v0.1.5) | Settings → GLM; `glm.ts` + catalog in `cloudModelCatalog.ts` |
| Kimi provider (Moonshot) | ✅ Done (v0.1.5) | Settings → Kimi; `kimi.ts` + catalog |
| PTY resize on panel resize | ✅ Done (v0.1.5) | `TerminalPane` ResizeObserver → `pty_resize` |

---

## Phase D — v1.0 Parity (Selective)

| Item | Status | Notes |
|------|--------|-------|
| LSP Phase 1 | 🔶 Partial | [25-lsp-diagnostics.md](25-lsp-diagnostics.md) — transport, diagnostics, hover shipped |
| Cmd+K inline edit | ❌ Spec ready | [28-inline-edit-autocomplete.md](28-inline-edit-autocomplete.md) — CodeMirror decorations |
| DeepSeek | ✅ | `deepseek` chat backend; Settings → DeepSeek |
| GLM (Z.ai) | ✅ | `glm` chat backend; Settings → GLM |
| Kimi (Moonshot) | ✅ | `kimi` chat backend; Settings → Kimi |
| Mistral, Perplexity | ❌ Not started | OpenAI-compat + provider registry |
| Custom tool shell executor | ❌ Not started | Optional `.sidebar` command templates |
| Context compaction | ✅ Done | [21-context-compaction.md](21-context-compaction.md) |
| Ollama model pull UI | ❌ Not started | [27-local-model-ux.md](27-local-model-ux.md) §4 |
| Agent activity step grouping | ❌ Planned (v0.1.3) | [40](40-product-hardening-and-agent-ux.md) §5 |
| Full provider billing APIs | ❌ Not started | Beyond local monthly estimates |

---

## Enhancement Program (from `extension.md`)

> Competitive-positioning plan layered onto the phases above. Each item links to a full spec. Phases here (0–3) map onto roadmap Phases B→D; they are an execution ordering, not separate release gates.

### Phase 0 — Polish & Trust

| Item | Spec | Status |
|------|------|--------|
| Filesystem watcher → tree + git refresh | [24](24-filesystem-watcher.md) | ✅ Done |
| Search panel wired up | [26](26-search-panel.md) | ✅ Done |
| Compaction visual divider + archive/restore | [21](21-context-compaction.md) | ✅ Done |
| Context overflow bar states | [34](34-context-overflow-warnings.md) | ✅ Done |
| `read_file` size cap + pagination | [22](22-llm-file-interaction.md) §3 | ✅ Done |
| Tool schema trimming by mode | [22](22-llm-file-interaction.md) §4 | ✅ Done |
| `.gitignore` respect + depth caps in file tree | [22](22-llm-file-interaction.md) §2 | ✅ Done |
| Stall detection + parse error surfacing | [22](22-llm-file-interaction.md) §5–6 | ✅ Done |
| Preview iframe sandbox | [14](14-security.md) §B | ❌ Omitted (WebKitGTK) |

### Phase 1 — Core Differentiators

| Item | Spec | Status |
|------|------|--------|
| Per-project skills (CRUD, injection, variables) | [30](30-agent-context-and-model-settings.md) | ✅ Done |
| Bundled skills starter pack | [30](30-agent-context-and-model-settings.md) §9 | ❌ Not started |
| LSP Phase 1 — diagnostics + hover | [25](25-lsp-diagnostics.md) | ✅ Done (TS/JS) |
| Per-model settings + assembly preview | [30](30-agent-context-and-model-settings.md) | ✅ Done |
| Autocomplete inference hook (Ollama FIM) | [28](28-inline-edit-autocomplete.md) §2 | ❌ Not started |
| Ollama model pull UI + recommendations | [27](27-local-model-ux.md) §4 | ❌ Not started |
| Context budget visualization | [39](39-context-ui-enhancements.md) | ✅ Done |
| Attachment chips + native OS drag-drop | [43](43-v-next-release-fixes.md) §3 | ✅ Done |

### Phase 2 — Competitive Parity

| Item | Spec | Status |
|------|------|--------|
| Inline edit (Cmd+K) | [28](28-inline-edit-autocomplete.md) §3 | ❌ Not started |
| LSP Phase 2 — go-to-def, rename, more languages | [25](25-lsp-diagnostics.md) §6 | ❌ Not started |
| OS keychain for API keys | [14](14-security.md) §A | ❌ Superseded — reverted v0.1.5 |
| GLM + Kimi providers | — | ✅ Done (v0.1.5) |
| Rust path enforcement | [33](33-rust-path-enforcement.md) | ✅ Done |
| Shortcut rebinding | [37](37-shortcut-rebinding.md) | ✅ Done |
| Editor wrap + Prettier | [20](20-editor-formatting-and-theming.md) | ✅ Done |
| MLX provider (Apple Silicon) | [42](42-mlx-provider.md) | ❌ Planned (v0.1.3) |

### Phase 3 — Ecosystem

| Item | Spec | Status |
|------|------|--------|
| Skills registry (GitHub-based → hosted) | [29](29-skills-registry.md) | ❌ Deferred (P3) |
| Plugin / extension API (userland tools) | — | ❌ Not started |
| File-backed plans (`plans/`) | [19](19-planning-system.md) | ❌ Not started |
| Multi-workspace / project switcher | — | ❌ Deferred |
| Agent activity step grouping | [40](40-product-hardening-and-agent-ux.md) §5 | ❌ Planned (v0.1.3) |

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
| 2026-06-10 | **v0.1.4** — attachment chip polish (native drop, icons, click-to-open), spec audit |
| 2026-06-10 | **Attachment chip polish** — native Tauri drag-drop, type icons, click-to-open (editor/explorer/OS), element source grep — [43](43-v-next-release-fixes.md) §3 |
| 2026-06-10 | **Editor actions + browser tab** — `···` menu, preview nav, element inspector — [44](44-editor-actions-browser-tab.md) |
| 2026-06-10 | **v-next release fixes** — model selector, compaction defaults, settings polish — [43](43-v-next-release-fixes.md) |
| 2026-07-10 | **v0.1.5** — GLM + Kimi providers, API keys in app settings (keychain reverted), PTY resize, CSP for Z.ai/Moonshot |
| 2026-06-05 | **v0.1.2 public beta** — OS keychain (later reverted), Rust path enforcement (Spec 33), production CSP, agent turn undo |
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
