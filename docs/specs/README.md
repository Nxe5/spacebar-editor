# Spacebar Editor — Specifications

> **Last aligned with codebase:** 2026-06-05 — Tauri 2, **two-tier runtime** (Svelte agent + Rust IPC). **No Node sidecar** — LLM HTTP via webview `fetch`. See [03-architecture.md](03-architecture.md#agent-runtime-model-current).

This directory contains the detailed engineering specifications for Spacebar Editor, organized by domain.

---

## Overall Implementation Status

| Phase | Status | Description |
|-------|--------|-------------|
| **Core Features** | ✅ Complete | Workbench, editor, terminal, chat, agent loop |
| **Git Integration** | ✅ Complete | Status, stage, commit, diff, discard |
| **Providers** | 🔶 Partial | Anthropic, Ollama, llama.cpp, DeepSeek ✅ · MLX ❌ — [42](42-mlx-provider.md) |
| **Tools** | ✅ Complete | 16 built-in tools with policy system |
| **Persistence** | ✅ Complete | Per-project state, global settings |
| **Context UI** | ✅ Complete | Segmented bar, breakdown popover, compaction archive/restore — [39](39-context-ui-enhancements.md) |
| **Compaction** | ✅ Complete | Manual + auto compaction, archive/restore — [21](21-context-compaction.md) |
| **Editor UX** | ✅ Complete | Line wrap, Prettier format / format-on-save, full syntax + editor chrome in Appearance — [20](20-editor-formatting-and-theming.md) |
| **Search** | ✅ Complete | Workspace text search (ripgrep) — [26](26-search-panel.md) |
| **Filesystem Watcher** | ✅ Complete | Debounced `fs:changed` → tree + git refresh — [24](24-filesystem-watcher.md) |
| **Enhancement Program (32–38)** | ✅ Mostly complete | Error recovery, overflow warnings, workspace lock, onboarding, shortcuts, parallel tools — see table below |
| **LSP** | 🔶 Partial | Rust transport + TS client; diagnostics + hover — [25](25-lsp-diagnostics.md) |
| **Stall / Error Detection** | 🔶 Partial | `stallDetection.ts` done, wire-up done — [22](22-llm-file-interaction.md) |
| **Security Hardening** | ✅ Complete | Rust path enforcement, OS keychain, production CSP — [14](14-security.md), [33](33-rust-path-enforcement.md), [40](40-product-hardening-and-agent-ux.md) §3 |
| **Skills** | ✅ Complete (per-project) | CRUD UI + injection + variable interpolation; bundled pack/registry pending — [30](30-agent-context-and-model-settings.md) |
| **Planning System** | ❌ Not started | `plans/` files, picker UI — [19](19-planning-system.md) |
| **Inline edit (Cmd+K)** | ❌ Not started | [28](28-inline-edit-autocomplete.md) |

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
| [35-workspace-lock.md](35-workspace-lock.md) | ✅ Complete | PID-based lock file, conflict dialog, read-only mode |
| [36-first-run-onboarding.md](36-first-run-onboarding.md) | ✅ Complete | Welcome screen, recent projects, CLI open modes |

### AI System

| Document | Status | Description |
|----------|--------|-------------|
| [08-ai-agent.md](08-ai-agent.md) | ✅ Complete | Agent loop, providers, chat footer, tool approval |
| [09-tool-system.md](09-tool-system.md) | ✅ Complete | Built-in tools, custom tools, policy |
| [19-planning-system.md](19-planning-system.md) | ❌ Not started | `plans/` markdown plans, picker, phased implementation |
| [21-context-compaction.md](21-context-compaction.md) | ✅ Complete | Auto/manual compaction, threshold %, archive/restore |
| [22-llm-file-interaction.md](22-llm-file-interaction.md) | ✅ Phase 0 | `.gitignore` tree filter · `read_file` cap · tool trimming · parse/stall handling |
| [23-skills-system.md](23-skills-system.md) | ⚠️ Superseded by [30](30-agent-context-and-model-settings.md) | Original skills design (kept for history) |
| [27-local-model-ux.md](27-local-model-ux.md) | 🔶 Partial | Ollama pull UI current; §2–3 folded into [30](30-agent-context-and-model-settings.md) |
| [42-mlx-provider.md](42-mlx-provider.md) | ❌ Not started | MLX provider (Apple Silicon) — `mlx_lm.server` OpenAI-compat backend |
| [28-inline-edit-autocomplete.md](28-inline-edit-autocomplete.md) | ❌ Spec ready | Cmd+K inline edit + ghost-text autocomplete |
| [29-skills-registry.md](29-skills-registry.md) | ❌ Deferred (P3) | Share/install skills; format-stability obligations now |
| [30-agent-context-and-model-settings.md](30-agent-context-and-model-settings.md) | ✅ Core complete | Agent Context settings, prompts relocation, per-model settings, assembly preview, **per-project skills CRUD + interpolation** · bundled pack/registry pending |
| [31-llm-eval-harness.md](31-llm-eval-harness.md) | ✅ Implemented | Long-running Chat/Plan/Agent eval vs Ollama (`tests/llm/`) |
| [32-agent-error-recovery.md](32-agent-error-recovery.md) | ✅ Complete | Tool error formatting, continue-after-max-steps UX, web_fetch retry |
| [34-context-overflow-warnings.md](34-context-overflow-warnings.md) | ✅ Complete | Amber/red context bar states, inline critical warning above composer |
| [38-parallel-tool-execution.md](38-parallel-tool-execution.md) | ✅ Complete | Concurrent read-only tool execution, max concurrency setting |
| [39-context-ui-enhancements.md](39-context-ui-enhancements.md) | ✅ Implemented | Segmented context bar, breakdown popover, compaction archive/restore UI |
| [40-product-hardening-and-agent-ux.md](40-product-hardening-and-agent-ux.md) | 🔶 Partial | v0.1.1: keychain, shell patterns, write audit, limits, workspace notice; §5 steps deferred |
| [41-lsp-agent-tools.md](41-lsp-agent-tools.md) | ✅ Complete | LSP agent tools + shell spill + compaction tool retention |
| [43-v-next-release-fixes.md](43-v-next-release-fixes.md) | 🔷 Planned | Dark Bubblegum colors, model selector empty states, file drag-to-chat, settings polish, compaction defaults, version status bar, macOS process name |

### Editor & Git

| Document | Status | Description |
|----------|--------|-------------|
| [10-editor.md](10-editor.md) | 🔶 Partial | Languages, syntax, diff mode |
| [20-editor-formatting-and-theming.md](20-editor-formatting-and-theming.md) | ✅ Complete | Editor wrap, Prettier, syntax + editor chrome in Appearance |
| [25-lsp-diagnostics.md](25-lsp-diagnostics.md) | 🔶 Partial | LSP transport, diagnostics, hover; Phase 2 features pending |
| [11-git.md](11-git.md) | ✅ Complete | Git UI, Rust backend, agent tools |

### Infrastructure

| Document | Status | Description |
|----------|--------|-------------|
| [12-ipc.md](12-ipc.md) | ✅ Complete | Tauri commands and events |
| [13-theming.md](13-theming.md) | ✅ Complete | Color systems, icon themes |
| [14-security.md](14-security.md) | 🔶 Partial | Current state + keychain / iframe sandbox addenda |
| [15-testing.md](15-testing.md) | ✅ Complete | Test strategy and suites |
| [16-build.md](16-build.md) | ✅ Complete | Build commands |
| [24-filesystem-watcher.md](24-filesystem-watcher.md) | ✅ Core implemented | `watcher.rs` → debounced `fs:changed` → tree + git refresh |
| [33-rust-path-enforcement.md](33-rust-path-enforcement.md) | ❌ Not started | `canonicalize_workspace_path` in Rust, symlink escape hardening, `workspace_root` param on all filesystem commands |
| [37-shortcut-rebinding.md](37-shortcut-rebinding.md) | ✅ Complete | Keybindings settings UI, `sidebar.keybindings.v1` persistence, conflict detection |

### Planning

| Document | Status | Description |
|----------|--------|-------------|
| [17-roadmap.md](17-roadmap.md) | 📋 Active | Phased priorities and deferred items |
| [18-glossary.md](18-glossary.md) | ✅ Complete | Terminology reference |

---

## Phase 0 Enhancement Program — Status

These were the specs added as part of the competitive enhancement program (`extension.md`). Specs 22–30 are the original Enhancement Program; 32–39 extend it.

| Spec | Title | Status |
|------|-------|--------|
| [22](22-llm-file-interaction.md) | LLM ↔ File Interaction | ✅ Phase 0 complete |
| [23](23-skills-system.md) | Skills System | ⚠️ Superseded by 30 |
| [24](24-filesystem-watcher.md) | Filesystem Watcher | ✅ Core implemented |
| [25](25-lsp-diagnostics.md) | LSP Diagnostics | 🔶 Partial (Phase 1) |
| [26](26-search-panel.md) | Search Panel | ✅ Complete |
| [27](27-local-model-ux.md) | Local Model UX | 🔶 Partial |
| [28](28-inline-edit-autocomplete.md) | Inline Edit / Cmd+K | ❌ Not started |
| [29](29-skills-registry.md) | Skills Registry | ❌ Deferred P3 |
| [30](30-agent-context-and-model-settings.md) | Agent Context & Model Settings | ✅ Core complete (skills CRUD) |
| [31](31-llm-eval-harness.md) | LLM Eval Harness | ✅ Implemented |
| [32](32-agent-error-recovery.md) | Agent Error Recovery | ✅ Complete |
| [33](33-rust-path-enforcement.md) | Rust Path Enforcement | ❌ Not started |
| [34](34-context-overflow-warnings.md) | Context Overflow Warnings | ✅ Complete |
| [35](35-workspace-lock.md) | Workspace Lock | ✅ Complete |
| [36](36-first-run-onboarding.md) | First-Run / Onboarding | ✅ Complete |
| [37](37-shortcut-rebinding.md) | Shortcut Rebinding | ✅ Complete |
| [38](38-parallel-tool-execution.md) | Parallel Tool Execution | ✅ Complete |
| [39](39-context-ui-enhancements.md) | Context UI Enhancements | ✅ Implemented |
| [41](41-lsp-agent-tools.md) | LSP Agent Tools | ✅ Complete |
| [42](42-mlx-provider.md) | MLX Provider | ❌ Not started |
| [43](43-v-next-release-fixes.md) | v-next Release Fixes | 🔷 Planned |

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ Complete | Feature implemented and tested |
| 🔶 Partial | Some components implemented |
| 🚧 In Progress | Currently being worked on |
| 📋 Active | Living document (roadmap) |
| ❌ Not Started | Planned but not implemented |
| ⚠️ Superseded | Replaced by a newer spec (kept for history) |

---

## Document Maintenance

When changing behavior, update in order:

1. Code
2. Relevant spec document(s)
3. [Overview](../overview/OVERVIEW.md) (snapshot)
4. [Architecture](../architecture/ARCHITECTURE.md) (as needed)

**Authoritative source:** the repository at `HEAD`, not legacy documentation.

**Backlog:** see [17-roadmap.md](17-roadmap.md) and per-spec ❌ sections.

**Enhancement program:** the competitive plan in `extension.md` is specced across [22](22-llm-file-interaction.md)–[39](39-context-ui-enhancements.md) and sequenced (Phase 0–3) in the [Enhancement Program](17-roadmap.md#enhancement-program-from-extensionmd) section of the roadmap.

**Skills:** Spec [30](30-agent-context-and-model-settings.md) is the authority (supersedes [23](23-skills-system.md)). **Per-project skills are implemented** — `src/lib/skills/` (`activeSkills.ts`, `skillVariables.ts`), the `skills` store, and the Skills manager (Settings → Agent Context → Skills) provide CRUD, per-mode scoping, and `{{variable}}` interpolation; `assemble.ts` injects enabled skills. Remaining work: a bundled starter pack and a global/shared registry ([29](29-skills-registry.md)).
