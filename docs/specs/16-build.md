# Build

> **Status:** ✅ **COMPLETE**

---

## Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Vite + Tauri desktop (default)
pnpm dev:desktop      # Tauri desktop only (starts Vite via beforeDevCommand)
pnpm dev:web          # Vite only — browser UI, no Rust IPC
pnpm tauri build      # Release bundle
pnpm test             # Run unit tests
pnpm release 0.1.5    # Bump version, commit, tag, push (after other commits)
```

### Release

After feature and docs commits are on a **clean** working tree:

```bash
pnpm release 0.1.5
pnpm release 0.1.5 -m "v0.1.5 — short release notes for the tag"
pnpm release 0.1.5 --dry-run    # preview only
pnpm release 0.1.5 --no-push    # local commit + tag only
```

Updates `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`, then creates `chore: bump version to X.Y.Z`, an annotated `vX.Y.Z` tag, and pushes both to `origin`. Pushing the tag triggers `.github/workflows/release.yml`.

---

## Development

### Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 18+ |
| pnpm | 9+ |
| Rust | 1.70+ |
| Tauri prerequisites | [See docs](https://tauri.app/start/prerequisites/) |

### Linux (Arch) Dependencies

```bash
sudo pacman -S webkit2gtk-4.1 base-devel curl wget openssl gtk3 libayatana-appindicator librsvg libvips
pkg-config --modversion javascriptcoregtk-4.1   # verify
```

### Dev Server

- Default port: **14200** (configurable in `vite.config.ts`)
- `pnpm dev` — Vite + Tauri desktop (shared dev server; use browser or app window)
- `pnpm dev:desktop` — Tauri only (still starts Vite internally)
- `pnpm dev:web` — frontend-only UI work (no tools/git/PTY)

---

## Build Outputs

### Development

- Vite dev server with hot reload
- Tauri window loads from dev server
- Source maps enabled

### Release

- Optimized Vite build
- Tauri bundles for target platform:
  - **Linux:** `.deb`, `.AppImage`
  - **macOS:** `.app`, `.dmg`
  - **Windows:** `.msi`, `.exe`

---

## Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | npm scripts, dependencies |
| `vite.config.ts` | Vite bundler config |
| `tsconfig.json` | TypeScript config |
| `svelte.config.js` | Svelte compiler config |
| `tailwind.config.ts` | Tailwind CSS config |
| `src-tauri/Cargo.toml` | Rust dependencies |
| `src-tauri/tauri.conf.json` | Tauri app config |

---

## No Sidecar

There is **no Node sidecar** to build, bundle, or spawn.

| Build step | Included? |
|------------|-----------|
| `pnpm install` / `vite build` | ✅ Frontend |
| `cargo build` (via Tauri) | ✅ Rust backend |
| `sidecar/` compile or copy | ❌ **Does not exist** |

**Runtime layout:**

```
tauri dev / release
  └── Webview: Svelte + agent loop + provider fetch()
  └── Rust:    filesystem, git, pty, grep, shell, web_fetch
```

Node is **not** a third runtime process for chat. Dev uses Node only to run Vite and the Tauri CLI ([02-technology.md](02-technology.md#runtime-vs-toolchain)).

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `VITE_PORT` | Override dev server port |
| `RUN_OLLAMA_TESTS` | Enable Ollama integration tests |

See `.env.example` for additional hints.
