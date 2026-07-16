# Spacebar Editor — Specifications

> **Last aligned with codebase:** 2026-07-16 · **v0.1.7 (restored)** — Tauri 2, **two-tier runtime** (Svelte agent + Rust IPC). **No Node sidecar** — LLM HTTP via webview `fetch`. See [03-architecture.md](03-architecture.md#agent-runtime-model-current).
>
> **v0.1.7 feature set:** `str_replace` patch-style edit tool + write-approval edit preview ([09](09-tool-system.md), [45](45-security-hardening-and-capability-expansion.md) §4.1) · code-defined bundled skills starter pack ([30](30-agent-context-and-model-settings.md) §9) · CLI launch refactor + micro-editor layout ([36](36-first-run-onboarding.md)) · macOS/Homebrew packaging · word-wrap/Prettier default-on (toolbar buttons removed) · Explorer/Search/Git switcher moved to top of `RightSidebar` · file-tree indent guide lines. **A v0.1.6 working-tree revert briefly removed this feature set; it was restored (see [17-roadmap.md](17-roadmap.md#recent-completions-2026)).**
>
> **Stability program (49–52):** terminal render corruption ([49](49-terminal-render-corruption.md)), editor scroll shift on folder expand ([50](50-explorer-expand-editor-scroll.md)), chat scroll freedom ([51](51-chat-scroll-freedom.md)), agent-run freezes/crash-to-welcome + raised tool caps ([52](52-agent-run-stability.md)) — all implemented, layered on top of the restored v0.1.7 feature set.
>
> **Proposed-spec renumbering:** the system-tray assistant and project-hub proposals moved from 46/47 to **[53](53-system-tray-desktop-assistant.md)/[54](54-project-hub-notes-boards.md)** — 46–48 are now taken by shipped/drafted specs (update-ping, terminal-smooth-scrolling, remote-input-bridge).

This directory contains the detailed engineering specifications for Spacebar Editor, organized by domain.

---

## Overall Implementation Status

| Phase | Status | Description |
|-------|--------|-------------|
| **Core Features** | ✅ Complete | Workbench, editor, terminal, chat, agent loop |
| **Git Integration** | ✅ Complete | Status, stage, commit, diff, discard |
| **Providers** | 🔶 Partial | Anthropic, Ollama, llama.cpp, DeepSeek, GLM, Kimi ✅ · MLX ❌ — [42](42-mlx-provider.md) |
| **Tools** | ✅ Complete | 17 built-in tools with policy system (incl. `str_replace`) |
| **Persistence** | ✅ Complete | Per-project state, global settings |
| **Context UI** | ✅ Complete | Segmented bar, breakdown popover, compaction archive/restore — [39](39-context-ui-enhancements.md) |
| **Compaction** | ✅ Complete | Manual + auto compaction, archive/restore — [21](21-context-compaction.md) |
| **Editor UX** | ✅ Complete | Line wrap + Prettier format-on-save, both on by default (toggle in Settings → General, no toolbar buttons), full syntax + editor chrome in Appearance — [20](20-editor-formatting-and-theming.md) |
| **Search** | ✅ Complete | Workspace text search (ripgrep) — [26](26-search-panel.md) |
| **Filesystem Watcher** | ✅ Complete | Debounced `fs:changed` → tree + git refresh — [24](24-filesystem-watcher.md) |
| **Enhancement Program (32–38)** | ✅ Mostly complete | Error recovery, overflow warnings, workspace lock, onboarding, shortcuts, parallel tools — see table below |
| **LSP** | 🔶 Partial | Rust transport + TS client; diagnostics + hover — [25](25-lsp-diagnostics.md) |
| **Stall / Error Detection** | ✅ Complete | Phase 0 — parse errors + stall detection — [22](22-llm-file-interaction.md) |
| **Security Hardening** | 🔶 Partial | Rust path enforcement, app-settings API keys, production CSP — [14](14-security.md), [33](33-rust-path-enforcement.md), [40](40-product-hardening-and-agent-ux.md) §3; trust boundary plan — [45](45-security-hardening-and-capability-expansion.md) |
| **Skills** | ✅ Complete (per-project) · 🔶 Bundled partial | Per-project CRUD UI + injection + variable interpolation; code-defined bundled starter pack shipped, global registry pending — [30](30-agent-context-and-model-settings.md) |
| **Stability program (49–52)** | ✅ Complete | Terminal WebGL + font gating, `overflow: clip` panes, sticky chat scroll, streaming throttle, crash restore, 100/300 agent caps |
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
| [47-terminal-smooth-scrolling.md](47-terminal-smooth-scrolling.md) | 🔶 Partial (renderer/scrollback/smooth-scroll shipped via [49](49-terminal-render-corruption.md); Settings → Terminal pending) | Smooth wheel scrolling, WebGL renderer + fallback, scrollback/font settings |
| [49-terminal-render-corruption.md](49-terminal-render-corruption.md) | ✅ Implemented | Overlapping-glyph fix: font-ready gating, WebGL renderer + fallback, keep panes mounted across tab switches |
| [50-explorer-expand-editor-scroll.md](50-explorer-expand-editor-scroll.md) | ✅ Implemented | `overflow: clip` on fixed workbench panes — stops WebKit focus-reveal scroll displacing the editor |
| [51-chat-scroll-freedom.md](51-chat-scroll-freedom.md) | ✅ Implemented | Sticky-bottom auto-scroll — scroll up freely during streaming, re-pin at bottom |

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
| [30-agent-context-and-model-settings.md](30-agent-context-and-model-settings.md) | ✅ Core complete | Agent Context settings, prompts relocation, per-model settings, assembly preview, **per-project skills CRUD + interpolation**, **code-defined bundled starter pack shipped** · global/shared registry pending |
| [31-llm-eval-harness.md](31-llm-eval-harness.md) | ✅ Implemented | Long-running Chat/Plan/Agent eval vs Ollama (`tests/llm/`) |
| [32-agent-error-recovery.md](32-agent-error-recovery.md) | ✅ Complete | Tool error formatting, continue-after-max-steps UX, web_fetch retry |
| [34-context-overflow-warnings.md](34-context-overflow-warnings.md) | ✅ Complete | Amber/red context bar states, inline critical warning above composer |
| [38-parallel-tool-execution.md](38-parallel-tool-execution.md) | ✅ Complete | Concurrent read-only tool execution, max concurrency setting |
| [39-context-ui-enhancements.md](39-context-ui-enhancements.md) | ✅ Implemented | Segmented context bar, breakdown popover, compaction archive/restore UI |
| [40-product-hardening-and-agent-ux.md](40-product-hardening-and-agent-ux.md) | 🔶 Partial | v0.1.1: shell patterns, write audit, limits, workspace notice (done); §5 steps deferred; §3 keychain reverted v0.1.5 |
| [41-lsp-agent-tools.md](41-lsp-agent-tools.md) | ✅ Complete | LSP agent tools + shell spill + compaction tool retention |
| [43-v-next-release-fixes.md](43-v-next-release-fixes.md) | ✅ Implemented | Model selector, attachment chips (native OS drop, icons, click-to-open), settings polish, compaction defaults, version bar |
| [44-editor-actions-browser-tab.md](44-editor-actions-browser-tab.md) | 🔶 Partial | Editor `···` menu, browser tab + inspector; **pending:** untitled-file Save As (`pick_save_path`) |
| [45-security-hardening-and-capability-expansion.md](45-security-hardening-and-capability-expansion.md) | 🔶 Partially shipped (§2.1 trust gate ✅, §4.1 `str_replace` ✅, §4.7 web access toggle 🔶 UI/schema-level only) | Remaining open: narrow-only tool policy (§2.2), enforcement audits (§3.x), execution-layer web-access block, capability roadmap |
| [48-remote-input-bridge.md](48-remote-input-bridge.md) | 📋 Draft | Remote prompts via Telegram/Discord/iMessage; headless agent turn (Phase 0), pairing + allowlist, remote tool-policy profiles |
| [52-agent-run-stability.md](52-agent-run-stability.md) | ✅ Implemented (§6 future work open) | Streaming render throttle, markdown parse cap, crash-restore of workspace, raised tool caps (100 steps / 300 calls) + migration |
| [53-system-tray-desktop-assistant.md](53-system-tray-desktop-assistant.md) | 📋 Proposed | Background tray window, global hotkey summon, system-scope tools + trust gating for a desktop assistant |
| [54-project-hub-notes-boards.md](54-project-hub-notes-boards.md) | 📋 Proposed | Cross-kind project registry (code/KiCad/hardware/notes), global notes vault, per-project kanban boards, Raycast-style command palette — independent of 53's system-write tools |

### Editor & Git

| Document | Status | Description |
|----------|--------|-------------|
| [10-editor.md](10-editor.md) | ✅ Core complete | CodeMirror, grammars, wrap, Prettier, diff; LSP Phase 2 + Cmd+K pending |
| [20-editor-formatting-and-theming.md](20-editor-formatting-and-theming.md) | ✅ Complete | Editor wrap, Prettier, syntax + editor chrome in Appearance |
| [25-lsp-diagnostics.md](25-lsp-diagnostics.md) | 🔶 Partial | LSP transport, diagnostics, hover; Phase 2 features pending |
| [11-git.md](11-git.md) | ✅ Complete | Git UI, Rust backend, agent tools |

### Infrastructure

| Document | Status | Description |
|----------|--------|-------------|
| [12-ipc.md](12-ipc.md) | ✅ Complete | Tauri commands and events |
| [13-theming.md](13-theming.md) | ✅ Complete | Color systems, icon themes |
| [14-security.md](14-security.md) | 🔶 Partial | App-settings API keys ✅; Rust path enforcement, CSP ✅; LLM-in-Rust deferred; preview sandbox intentionally omitted (WebKitGTK) |
| [15-testing.md](15-testing.md) | ✅ Complete | Test strategy and suites |
| [16-build.md](16-build.md) | ✅ Complete | Build commands |
| [24-filesystem-watcher.md](24-filesystem-watcher.md) | ✅ Core implemented | `watcher.rs` → debounced `fs:changed` → tree + git refresh |
| [33-rust-path-enforcement.md](33-rust-path-enforcement.md) | ✅ Complete | `canonicalize_workspace_path` in Rust; `workspace_root` on all FS IPC — shipped v0.1.2 |
| [37-shortcut-rebinding.md](37-shortcut-rebinding.md) | ✅ Complete | Keybindings settings UI, `sidebar.keybindings.v1` persistence, conflict detection |
| [46-update-ping-and-version-status.md](46-update-ping-and-version-status.md) | 📋 Draft | Anonymous launch ping + update check, status bar version indicator + Update button, CSP fix |

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
| [33](33-rust-path-enforcement.md) | Rust Path Enforcement | ✅ Complete |
| [34](34-context-overflow-warnings.md) | Context Overflow Warnings | ✅ Complete |
| [35](35-workspace-lock.md) | Workspace Lock | ✅ Complete |
| [36](36-first-run-onboarding.md) | First-Run / Onboarding | ✅ Complete |
| [37](37-shortcut-rebinding.md) | Shortcut Rebinding | ✅ Complete |
| [38](38-parallel-tool-execution.md) | Parallel Tool Execution | ✅ Complete |
| [39](39-context-ui-enhancements.md) | Context UI Enhancements | ✅ Implemented |
| [41](41-lsp-agent-tools.md) | LSP Agent Tools | ✅ Complete |
| [42](42-mlx-provider.md) | MLX Provider | ❌ Not started |
| [43](43-v-next-release-fixes.md) | v-next Release Fixes | ✅ Implemented |
| [44](44-editor-actions-browser-tab.md) | Editor Actions, Browser Tab & Element Inspector | 🔶 Partial |

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

**Skills:** Spec [30](30-agent-context-and-model-settings.md) is the authority (supersedes [23](23-skills-system.md)). **Per-project skills are implemented** — `src/lib/skills/` (`activeSkills.ts`, `skillVariables.ts`), the `skills` store, and the Skills manager (Settings → Agent Context → Skills) provide CRUD, per-mode scoping, and `{{variable}}` interpolation; `assemble.ts` injects enabled skills, and `buildActiveSkillBlocks` now also merges a **code-defined bundled starter pack** (`src/lib/skills/bundled/index.ts`: `typescript`, `svelte`, `git-conventions`, `testing`) unless a project skill shares the same `id`. Remaining work: auto-detection + read-only bundled UI + global scope ([30](30-agent-context-and-model-settings.md) §9) and a global/shared registry ([29](29-skills-registry.md)).
