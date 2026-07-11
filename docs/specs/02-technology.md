# Technology Stack

> **Status:** ✅ **COMPLETE** — No Node sidecar; agent and providers run in the Svelte webview.

---

## Runtime vs toolchain

| Role | Technology | Notes |
|------|------------|--------|
| **Agent + LLM clients** | TypeScript in Tauri webview | `streamTurn.ts`, `providers/*`, `ChatPane` — not a separate Node process |
| **OS integration** | Rust (Tauri commands) | Filesystem, git, PTY, ripgrep, `web_fetch` |
| **Dev/build only** | Node.js + pnpm | Vite dev server, Vitest, `tauri` CLI, `scripts/*.mjs` |

There is **no** `sidecar/` directory, **no** harness IPC, and **no** `@mariozechner/pi-coding-agent` dependency. See [03-architecture.md](03-architecture.md#agent-runtime-model-current).

---

## Stack Overview

| Layer | Technology | Status |
|-------|------------|--------|
| Desktop shell | **Tauri 2**, `@tauri-apps/api`, `tauri-plugin-shell` | ✅ |
| UI | **Svelte 5** (runes: `$state`, `$props`, `$effect`, `$derived`) | ✅ |
| Styling | **Tailwind CSS 4**, CSS variables (`globals.css`, `workbench-themes.css`, `editor-syntax.css`) | ✅ |
| Editor | **CodeMirror 6** + language packs (see [10-editor.md](10-editor.md)) | ✅ |
| Terminal | **xterm.js**, `@xterm/addon-fit` | ✅ |
| Rust | serde, **git2**, portable-pty, **notify** (watcher → debounced `fs:changed` → explorer/git refresh), rfd, walkdir, **reqwest** (`web_fetch`) | ✅ |
| AI | **Direct HTTP/SSE** from webview: `anthropic.ts`, `openaiCompat.ts`, `deepseek.ts`, `glm.ts`, `kimi.ts` via `streamTurn.ts` | ✅ |
| Token estimate | `gpt-tokenizer` (cl100k) for context meter pre-send | ✅ |
| Tests | **Vitest** (`tests/unit/`), optional Ollama integration | ✅ |

---

## Development Environment

| Aspect | Detail |
|--------|--------|
| Package manager | pnpm 9+ |
| Build tool | Vite 6 MPA |
| Entry points | `index.html` (main), `settings.html` (settings window) |
| Default dev port | **14200** (`vite.config.ts`, `tauri.conf.json`) |
| Node version | 18+ |
| Rust version | 1.70+ |

---

## Key Dependencies

### Frontend

```json
{
  "@tauri-apps/api": "^2.x",
  "svelte": "^5.x",
  "@codemirror/view": "^6.x",
  "xterm": "^5.x",
  "gpt-tokenizer": "^2.x"
}
```

### Rust

```toml
[dependencies]
tauri = { version = "2", features = [...] }
git2 = "0.18"
portable-pty = "0.8"
notify = "6"
reqwest = { version = "0.12", features = ["json"] }
walkdir = "2"
```
