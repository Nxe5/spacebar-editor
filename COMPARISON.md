# Spacebar Editor vs. Open-Source AI Coding Tools for Local Models

> Snapshot: 2026-07-16 (v0.1.6 working tree). A candid comparison against the widely used open-source options for running coding assistants on **local models** (Ollama, llama.cpp, etc.). See [docs/specs/](docs/specs/) for what each claim maps to.

---

## The field

| | Spacebar Editor | Zed | VS Code + Continue | VS Code + Cline / Roo Code | Void | Aider |
|---|---|---|---|---|---|---|
| **What it is** | Standalone local-first AI IDE | Standalone high-perf editor with agent panel | Extension: chat/edit/autocomplete | Extension: autonomous agent | OSS Cursor-style VS Code fork | Terminal pair-programmer |
| **Runtime** | Tauri 2 (system webview + Rust) | Native (Rust/GPUI) | Electron host | Electron host | Electron | Python CLI |
| **Local models (Ollama/llama.cpp)** | First-class: health checks, pull UI, per-model settings, eval harness | Supported | First-class | Supported (works best on big models) | Supported | Supported |
| **Agentic tool loop** | Yes — 16 tools, policy gates, parallel read-only, caps + continue | Yes (agent panel) | Partial (agent mode newer) | Yes — its core strength | Yes | Yes (git-centric) |
| **Inline completion** | ❌ planned ([28](docs/specs/28-inline-edit-autocomplete.md)) | Yes | Yes | ❌ | Yes | n/a |
| **LSP / language smarts** | Partial: diagnostics + hover, LSP agent tools | Full (built-in) | Full (VS Code) | Full (VS Code) | Full (VS Code) | Uses repo map, no LSP |
| **Extension ecosystem** | ❌ none (skills + custom tools only) | Growing | Entire VS Code marketplace | Entire VS Code marketplace | VS Code compatible | n/a |
| **MCP support** | ❌ not yet | Yes | Yes | Yes (strong) | Partial | ❌ |
| **Tool-call safety model** | Per-project allow/ask/deny per tool, Rust path sandbox, shell pattern rules | Coarser approve flows | Approve flows | Approve/auto-approve per action | Cursor-style | Git as the safety net |
| **Context management UI** | Segmented budget bar, breakdown popover, auto-compaction + archive | Basic | Basic | Token counter, condensing | Basic | Repo-map centric |
| **Footprint** | Small (no Electron, no Node sidecar) | Small-medium | Heavy | Heavy | Heavy | Tiny |
| **Maturity / community** | Early, single-team, pre-1.0 | Large, VC-backed | Large | Large | Medium | Large |

---

## Where Spacebar genuinely wins

1. **Local-first is the design center, not a checkbox.** Provider health checks, model pull UI, per-model inference settings, text-tool-call recovery for models without native tool support, and a scripted eval harness (`tests/llm/`) that regression-tests agent behavior against actual local models (e.g. Gemma profiles). None of the others treat sub-30B local models as a first-class agent backend the way the eval harness does.
2. **Privacy posture.** No account, no telemetry, no Node sidecar; the only network traffic is the model endpoint you configured. Electron-based rivals inherit a bigger surface, and Zed ships collaboration/cloud features by default.
3. **Tool policy granularity.** Per-project allow/ask/deny per tool, shell-command pattern rules, workspace path enforcement duplicated in Rust ([33](docs/specs/33-rust-path-enforcement.md)) — a stricter, more legible trust model than approve-each-action dialogs.
4. **Context transparency.** The segmented context bar + compaction with archive/restore ([21](docs/specs/21-context-compaction.md), [39](docs/specs/39-context-ui-enhancements.md)) is more informative than anything in the comparison set. On 8–32K-context local models this matters constantly.
5. **Footprint.** Tauri + system webview: one small binary, fast start, low RAM next to three Electron competitors.

## Where the others win

1. **Ecosystem.** VS Code hosts (Continue, Cline, Roo) inherit the entire extension marketplace, debuggers, remote dev, and full LSP for every language. Spacebar has 15 grammars, diagnostics + hover, and no plugin API — this is the structural gap.
2. **Inline completion & Cmd+K.** Every editor-shaped rival ships ghost-text completion; Spacebar's is still spec-only ([28](docs/specs/28-inline-edit-autocomplete.md)).
3. **Editor depth.** Zed's native performance, multibuffer editing, and collaboration are beyond a CodeMirror-in-webview architecture's near-term reach.
4. **Agent autonomy features.** Cline/Roo lead on MCP servers, browser automation, and checkpoint/diff review workflows. Spacebar has turn-undo via git checkpoints but no MCP and no multi-file review UI.
5. **Battle-testing.** The stability program ([49](docs/specs/49-terminal-render-corruption.md)–[52](docs/specs/52-agent-run-stability.md)) fixed real crash/freeze/scroll bugs that larger projects shook out years ago. Pre-1.0 is pre-1.0.

## Honest take

Spacebar's defensible niche is **"the agent IDE that takes local models seriously"**: strictest privacy posture, best context economics UI, a real eval harness for small models, and a legible security model — in a binary a tenth the size of the Electron options. It will not out-VS-Code VS Code; it shouldn't try. The gaps that matter most for that niche, in order: inline completion ([28](docs/specs/28-inline-edit-autocomplete.md)), MCP client support (no spec yet), deeper LSP ([25](docs/specs/25-lsp-diagnostics.md) Phase 2), MLX for Apple Silicon ([42](docs/specs/42-mlx-provider.md)), and continued stability hardening ([52](docs/specs/52-agent-run-stability.md) §6).
