# Tiny Llama

A minimal Cursor-like IDE with chat integration, built with Tauri, Svelte, and CodeMirror.

## Features

- **Chat Pane** (left) — Conversational AI assistant with streaming responses
- **File Explorer** (right) — Browse and open files from your workspace
- **Code Editor** — CodeMirror 6 with syntax highlighting and tabs
- **Context (per chat)** — Estimated tokens for the active conversation (bottom of chat pane)
- **Tool policy** — Allow all, whitelist, or confirm each tool (Anthropic path); see [tests/README.md](tests/README.md)
- **Model Support** — Anthropic Claude (API key) or **Ollama** on your machine; OpenAI key field reserved for a future provider
- **Harness presets** — Default **Pi (bundled SDK)** uses `@mariozechner/pi-coding-agent` in the sidecar (upgrade with `npm update` there); optional **read-only** Pi-style harness; see Settings → Harness

## Architecture

```
┌─────────────────┬────────────────────────────┐
│                 │  [Files] [Search] [Git]    │
│   Chat Pane     ├────────────────────────────┤
│                 │                            │
│   - Messages    │   CodeMirror Editor        │
│   - Tool cards  │   (tabs for open files)    │
│   - Input       │                            │
├─────────────────┴────────────────────────────┤
│  [Context: 12k / 128k tokens]      [Settings]│
└──────────────────────────────────────────────┘
```

## Prerequisites

### Linux (Arch/Manjaro)

Tauri **2** needs **WebKitGTK 4.1** (not the older `webkit2gtk` 4.0 package). That stack provides `javascriptcoregtk-4.1` for `pkg-config`:

```bash
sudo pacman -Syu webkit2gtk-4.1 base-devel curl wget openssl gtk3 libayatana-appindicator librsvg libvips
```

Verify before `npm run tauri dev`:

```bash
pkg-config --modversion javascriptcoregtk-4.1
```

If that prints a version (e.g. `2.38.x`), the Rust build should find the library. If it still fails, ensure you did not only install `webkit2gtk` (4.0) — uninstall or ignore that for this project and use **`webkit2gtk-4.1`**.

### Linux (Ubuntu/Debian)

Follow [Tauri’s Linux prerequisites](https://tauri.app/start/prerequisites/) (Debian section). At minimum:

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev \
  libayatana-appindicator3-dev librsvg2-dev libxdo-dev
```

Check:

```bash
pkg-config --modversion javascriptcoregtk-4.1
```

### macOS

```bash
xcode-select --install
```

### All Platforms

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) 1.70+

### Linux: `javascriptcoregtk-4.1` / `pkg-config` errors when running `tauri dev`

If Cargo fails on **`javascriptcore-rs-sys`** with *Package 'javascriptcoregtk-4.1' not found*, the WebKit 4.1 **dev** files are missing or not on `PKG_CONFIG_PATH`. Install the packages for your distro above, then confirm `pkg-config --modversion javascriptcoregtk-4.1` works in the same shell you use for `cargo` / `npm run tauri dev`.

## Setup

```bash
# Install frontend dependencies
npm install

# Install sidecar dependencies and build
cd sidecar
npm install
npm run build
cd ..

# Run in development mode
npm run tauri dev
```

## Project Structure

```
tiny-llama/
├── src/                    # Svelte frontend
│   ├── modules/            # Feature modules (workbench, agent, explorer, editor, …)
│   ├── lib/
│   │   ├── components/ui/  # shadcn-svelte primitives
│   │   ├── stores/         # Svelte stores
│   │   └── ipc.ts          # Tauri IPC wrappers
│   ├── styles/globals.css  # Design tokens + Tailwind
│   ├── App.svelte
│   └── main.ts
├── settings.html           # Secondary settings window (Vite MPA)
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── main.rs         # Entry point
│   │   └── modules/        # filesystem, sidecar, watcher, pty, commands
│   └── Cargo.toml
├── sidecar/                # Node harness sidecar
│   ├── src/
│   │   ├── index.ts        # Entry, JSON-RPC
│   │   ├── harness.ts      # Abstract harness
│   │   ├── adapters/       # Pi.dev adapter
│   │   └── models/         # Model providers
│   └── package.json
└── package.json
```

Secrets and keys (what not to commit, where settings are stored) are summarized in [docs/SECRETS.md](docs/SECRETS.md). Optional env hints live in [.env.example](.env.example).

## Configuration

Open **Settings** (gear in the navbar):

- **Who answers chat** — **Anthropic (cloud)**, **Ollama (local)**, or **llama.cpp (local)** via `llama-server`’s OpenAI-compatible HTTP API (no key unless you set `--api-key` on the server).
- **Anthropic API key** — Required when the backend is Anthropic (`sk-ant-…`).
- **OpenAI API key** — Stored for a future built-in OpenAI chat path (not used yet).
- **Ollama** — Base URL, default `http://127.0.0.1:11434`. Click **Refresh** to load tags from `GET /api/tags`. Pick an installed model, or choose a suggested small tag and run `ollama pull <name>` in a terminal.

Quick local stack:

```bash
# install models (optional helper)
./scripts/pull-recommended-ollama.sh
```

Then in Settings choose **Ollama (local)**, confirm the endpoint, **Refresh**, pick a model, **Save**. The chat bar also has an **Ollama model** menu (left of Send) to switch models and flip the app to the Ollama backend.

See [tests/README.md](tests/README.md) for **`npm run test:ollama`** against your daemon.

## Development

`npm run tauri dev` runs Vite on **port 14200** by default (`vite.config.ts` and `build.devUrl` in `src-tauri/tauri.conf.json`) to avoid colliding with another process on **1420**. Each **`npm run dev`** starts with **`scripts/free-dev-port.mjs`** (listener SIGKILL via `lsof`, then `kill-port`, brief pause) so a leftover dev server usually releases the port. Override with `VITE_PORT` only if you also set `devUrl` in `tauri.conf.json` to the same port.

```bash
# Run frontend only (no Tauri)
npm run dev

# Build for production
npm run tauri build

# Type check
npx svelte-check

# Unit tests (Ollama integration optional — see tests/README.md)
npm test
```

## Extending the Harness

The harness is abstracted to allow swapping AI backends. To add a new adapter:

1. Create `sidecar/src/adapters/your-adapter.ts`
2. Implement the `Harness` interface from `harness.ts`
3. Update `sidecar/src/index.ts` to use your adapter

## Roadmap

- [ ] Git integration (status, diff, blame)
- [ ] LSP integration for linting
- [ ] File search
- [ ] Inline diffs for tool edits
- [ ] Custom themes

## License

MIT
