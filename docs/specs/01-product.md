# Product Overview

> **Status:** ✅ **COMPLETE**

---

## Purpose

Spacebar Editor is a **minimal Cursor-like IDE** for **desktop** use:

- Multi-tab **CodeMirror 6** editor with syntax highlighting and git diff view
- **File explorer** with icon themes (Seti, VS Code icons, codicons, custom packs)
- **Git** panel for status, staging, commit, and change review
- **Terminal** (xterm.js + native PTY)
- **AI chat** with streaming and **agentic tool use** (Plan / Agent modes)
- Swappable **LLM backends**: Anthropic (cloud), Ollama and llama.cpp (local)

---

## Positioning

| Principle | Description |
|-----------|-------------|
| **Local-first / BYOM** | Run models on your machine or bring your own API keys; no Spacebar Editor cloud |
| **Trust through git** | Agent file changes appear in the Git **Changes** list; review with diff highlighting and **Discard** |
| **Hackable** | Small Svelte + Rust codebase; tools and prompts are project-local under `.sidebar/` |

---

## Non-goals (Current)

| Non-goal | Status | Notes |
|----------|--------|-------|
| Browser deployment as primary product | ❌ Not planned | Tauri desktop only for real use |
| Node sidecar / Pi harness | ❌ **Not in product** | Agent + LLM HTTP run in the webview; tools use Rust IPC only. No `sidecar/`, no harness commands |
| Full LSP | ❌ Not started | Editor is syntax-highlighted text; no completions/diagnostics |
| Multi-root workspaces | ❌ Not planned | Single folder per window |
| Cloud sync / accounts | ❌ Not planned | All state is local |
| Cmd+K inline edit | ❌ Not started | Chat + tools only for edits |
