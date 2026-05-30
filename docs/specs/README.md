# Tiny Llama — Specifications

> **Last aligned with codebase:** 2026-05-29 — Tauri 2, **two-tier runtime** (Svelte agent + Rust IPC). **No Node sidecar** — no `sidecar/` package, no harness commands; LLM HTTP via webview `fetch`. See [03-architecture.md](03-architecture.md#agent-runtime-model-current).

This directory contains the detailed engineering specifications for Tiny Llama, organized by domain.

---

## Overall Implementation Status

| Phase | Status | Description |
|-------|--------|-------------|
| **Core Features** | ✅ Complete | Workbench, editor, terminal, chat, agent loop |
| **Git Integration** | ✅ Complete | Status, stage, commit, diff, discard |
| **Providers** | ✅ Complete | Anthropic, Ollama, llama.cpp |
| **Tools** | ✅ Complete | 16 built-in tools with policy system |
| **Persistence** | ✅ Complete | Per-project state, global settings |
| **Security Hardening** | 🔶 Partial | TS sandbox; keychain/CSP not started |
| **Planning System** | 🔶 Spec ready | `plans/` files, picker UI, `plans/**` writes in Plan mode — [19](19-planning-system.md) |
| **Editor UX** | ❌ Not Started | Prettier, wrap, full syntax/chrome settings — [20](specs/20-editor-formatting-and-theming.md) |
| **Context compaction** | ❌ Not Started | Summarize-and-rehydrate — [21-context-compaction.md](21-context-compaction.md) |
| **Enhancement Program** | 🔶 Spec ready | Competitive plan (`extension.md`): LLM↔file fixes, skills, watcher, LSP, search — [22](22-llm-file-interaction.md)–[30](30-agent-context-and-model-settings.md) |
| **Agent Context & Model Settings** | 🔶 Phase 0 | Skills placeholder, system-prompt assembly, per-model settings — [30](30-agent-context-and-model-settings.md) (skills Phase 1+ in [23](23-skills-system.md)) |
| **Advanced Features** | ❌ Not Started | LSP [25](25-lsp-diagnostics.md), inline edit / Cmd+K [28](28-inline-edit-autocomplete.md) |

---

## Specification Documents

### Core

| Document | Status | Description |
|----------|--------|-------------|
| [01-product.md](01-product.md) | ✅ Complete | Product overview, positioning, non-goals |
| [02-technology.md](02-technology.md) | ✅ Complete | Technology stack reference |
| [03-architecture.md](03-architecture.md) | ✅ Complete | High-level architecture diagram |
| [04-entry-points.md](04-entry-points.md) | ✅ Complete | Application entry points and windows |

### UI & State

| Document | Status | Description |
|----------|--------|-------------|
| [05-workbench.md](05-workbench.md) | ✅ Complete | Workbench layout and modules |
| [06-state-management.md](06-state-management.md) | ✅ Complete | Stores, persistence, cross-store coordination |
| [07-workspace.md](07-workspace.md) | ✅ Complete | Project lifecycle, local files |
| [26-search-panel.md](26-search-panel.md) | ✅ Core implemented | Workspace text search (ripgrep) panel, grouped results, click-to-open |

### AI System

| Document | Status | Description |
|----------|--------|-------------|
| [08-ai-agent.md](08-ai-agent.md) | ✅ Complete | Agent loop, providers, chat footer, tool approval |
| [09-tool-system.md](09-tool-system.md) | ✅ Complete | Built-in tools, custom tools, policy |
| [19-planning-system.md](19-planning-system.md) | 🔶 Not Started | `plans/` markdown plans, picker, phased implementation |
| [21-context-compaction.md](21-context-compaction.md) | ❌ Not Started | Auto/manual compaction, threshold %, model roles + addenda |
| [22-llm-file-interaction.md](22-llm-file-interaction.md) | ✅ Phase 0 | `.gitignore` tree filter · `read_file` cap · tool trimming · parse/stall handling |
| [23-skills-system.md](23-skills-system.md) | ⚠️ Superseded by [30](30-agent-context-and-model-settings.md) | Original skills design (kept for history) |
| [27-local-model-ux.md](27-local-model-ux.md) | 🔶 Partial (Ollama pull UI current; §2–3 → [30](30-agent-context-and-model-settings.md)) | Ollama pull UI · prompt/capability work folded into 30 |
| [28-inline-edit-autocomplete.md](28-inline-edit-autocomplete.md) | ❌ Spec ready | Cmd+K inline edit + ghost-text autocomplete |
| [29-skills-registry.md](29-skills-registry.md) | ❌ Deferred (P3) | Share/install skills; format-stability obligations now |
| [30-agent-context-and-model-settings.md](30-agent-context-and-model-settings.md) | 🔶 Phase 0 | Agent Context settings, prompts relocation, per-model settings, assembly preview · skills Phase 1+ pending |

### Editor & Git

| Document | Status | Description |
|----------|--------|-------------|
| [10-editor.md](10-editor.md) | 🔶 Partial | Languages, syntax, diff mode |
| [20-editor-formatting-and-theming.md](20-editor-formatting-and-theming.md) | ❌ Not Started | Prettier, line wrap, full syntax/markdown colors |
| [25-lsp-diagnostics.md](25-lsp-diagnostics.md) | ❌ Spec ready | LSP transport, TS diagnostics/hover, multi-language |
| [11-git.md](11-git.md) | ✅ Complete | Git UI, Rust backend, agent tools |

### Infrastructure

| Document | Status | Description |
|----------|--------|-------------|
| [12-ipc.md](12-ipc.md) | ✅ Complete | Tauri commands and events |
| [13-theming.md](13-theming.md) | ✅ Complete | Color systems, icon themes |
| [14-security.md](14-security.md) | 🔶 Partial | Current state + keychain / iframe sandbox addenda |
| [15-testing.md](15-testing.md) | ✅ Complete | Test strategy and suites |
| [16-build.md](16-build.md) | ✅ Complete | Build commands |
| [24-filesystem-watcher.md](24-filesystem-watcher.md) | ✅ Core implemented | `watcher.rs` → debounced `fs:changed` → tree + git refresh (open-buffer banner deferred) |

### Planning

| Document | Status | Description |
|----------|--------|-------------|
| [17-roadmap.md](17-roadmap.md) | 📋 Active | Phased priorities and deferred items |
| [18-glossary.md](18-glossary.md) | ✅ Complete | Terminology reference |

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ Complete | Feature implemented and tested |
| 🔶 Partial | Some components implemented |
| 🚧 In Progress | Currently being worked on |
| 📋 Active | Living document (roadmap) |
| ❌ Not Started | Planned but not implemented |

---

## Document Maintenance

When changing behavior, update in order:

1. Code
2. Relevant spec document(s)
3. [Overview](../overview/OVERVIEW.md) (snapshot)
4. [Architecture](../architecture/ARCHITECTURE.md) (as needed)

**Authoritative source:** the repository at `HEAD`, not legacy documentation.

**Backlog:** see [17-roadmap.md](17-roadmap.md) and per-spec ❌ sections (e.g. [21-context-compaction.md](21-context-compaction.md)).

**Enhancement program:** the competitive plan in `extension.md` is specced across [22](22-llm-file-interaction.md)–[30](30-agent-context-and-model-settings.md) and sequenced (Phase 0–3) in the [Enhancement Program](17-roadmap.md#enhancement-program-from-extensionmd) section of the roadmap.

**Implement-last group (discuss first):** Phase 0 of [30-agent-context-and-model-settings.md](30-agent-context-and-model-settings.md) and [22](22-llm-file-interaction.md) §3–6 are now implemented. Skills Phase 1+ and remaining 30 items are still pending.
