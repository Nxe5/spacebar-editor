# Tiny Llama

A minimal, **local-first** desktop IDE with an integrated AI coding agent. Built with **Tauri 2**, **Svelte 5**, and **CodeMirror 6**.

Use **Ollama** or **llama.cpp** on your machine, or **Anthropic** with your own API key. Agent tools read and write files in your project; changes show up in the **Git** panel for review and discard.

**Documentation:** [OVERVIEW.md](OVERVIEW.md) (current product snapshot) · [spec.md](spec.md) (full specification and roadmap) · [ARCHITECTURE.md](ARCHITECTURE.md) (deep reference)

---

## Features

- **Chat** — Chat / Plan / Agent modes; streaming; tool policy (`allow` / `ask` / `deny`)
- **Agent tools** — Filesystem, git, grep, shell, web fetch (workspace-sandboxed paths)
- **Editor** — Multi-tab CodeMirror; 15+ language grammars; custom syntax colors; git diff highlighting
- **Git panel** — Staged/changes lists, stage, commit, open diff, discard
- **Explorer** — File tree with Seti / VS Code–style icons
- **Terminal** — xterm + native PTY in tabs or bottom dock
- **Per-project config** — `.tinyllama/prompt.md`, `tools.json`, `state.json` (chat + tabs)

---

## Quick start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) 1.70+
- Platform deps for [Tauri 2](https://tauri.app/start/prerequisites/)

**Linux (Arch):**

```bash
sudo pacman -S webkit2gtk-4.1 base-devel curl wget openssl gtk3 libayatana-appindicator librsvg libvips
pkg-config --modversion javascriptcoregtk-4.1   # should print a version
```

### Run

```bash
npm install
npm run tauri dev
```

Unit tests: `npm test` · Optional Ollama integration: see [tests/README.md](tests/README.md)

Dev server port defaults to **14200** (see `vite.config.ts`). Use `npm run dev` for frontend-only UI work (no tools/git/PTY without Tauri).

---

## Configuration

Open **Settings** (gear): providers, API keys, models, workbench theme, syntax colors, tool policy, **agent limits**, web fetch allowlist.

**Project files** (in the opened repo):

| File | Purpose |
|------|---------|
| `.tinyllama/prompt.md` | Extra instructions for the agent |
| `.tinyllama/tools.json` | Per-project tool rules and custom tool schemas |
| `.tinyllama/state.json` | Persisted chat sessions and editor tabs (auto) |

Secrets: [docs/SECRETS.md](docs/SECRETS.md) · Env hints: [.env.example](.env.example)

---

## Architecture (short)

```
Svelte UI  →  providers (fetch) + toolRunner  →  Tauri IPC
Rust       →  filesystem, git, pty, grep, shell, web_fetch
```

There is **no Node sidecar**. The agent loop runs in the webview; OS integration runs in Rust.

---

## Roadmap

See [spec.md § Roadmap](spec.md#roadmap). Highlights:

- **Now:** Dogfooding — git change review, syntax, agent limits, project state
- **Next:** Rust path sandbox, LLM in Rust + keychain, context/error handling
- **Later:** LSP, inline edit, more cloud providers (DeepSeek, Mistral, Perplexity)

---

## License

MIT
