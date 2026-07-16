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

---

## macOS Code Signing & Notarization

> **Status:** ❌ Not configured — the app currently ships **ad-hoc signed only** (Tauri's automatic fallback when no identity is set). This is why a downloaded `.dmg`/`.app` gets Gatekeeper-quarantined and macOS reports "app is damaged, move to Trash" — fixed today by running `sudo xattr -cr /Applications/Spacebar\ Editor.app`, which just deletes the quarantine attribute so Gatekeeper skips verification.

### Why local builds usually don't need `xattr -cr`

macOS only sets the `com.apple.quarantine` extended attribute on files that arrive via a "quarantine-aware" path (browser download, AirDrop, Mail/Messages). A `.dmg`/`.app` produced locally by `pnpm tauri build` and installed by hand on the same machine is never quarantined, so it launches with the default ad-hoc signature with no extra steps.

### The permanent fix (real Developer ID + notarization)

Requires an [Apple Developer Program](https://developer.apple.com/programs/) membership (**$99/year**). One-time setup:

1. Create a **Developer ID Application** certificate (Xcode → Settings → Accounts → Manage Certificates, or the Developer portal + a CSR via Keychain Access). Export as `.p12` with a password from Keychain Access.
2. Base64-encode it: `base64 -i DeveloperID.p12 | pbcopy`.
3. Create an **app-specific password** for your Apple ID at [appleid.apple.com](https://appleid.apple.com) (not your account password — used only by `notarytool`).
4. Note your **Team ID** (Developer portal → Membership).
5. Add these as **GitHub Actions secrets** (already wired into `.github/workflows/release.yml`'s build step — no-op if unset):

   | Secret | Value |
   |--------|-------|
   | `APPLE_CERTIFICATE` | base64 `.p12` from step 2 |
   | `APPLE_CERTIFICATE_PASSWORD` | password you set exporting the `.p12` |
   | `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Your Name (TEAMID)` |
   | `APPLE_ID` | your Apple ID email |
   | `APPLE_PASSWORD` | app-specific password from step 3 |
   | `APPLE_TEAM_ID` | Team ID from step 4 |

   `tauri-action` reads these directly — no `tauri.conf.json` changes needed. Once set, every tagged release is signed and notarized automatically and users never need `xattr -cr`.

### Local signed build (optional, without CI)

Set the same env vars before running `tauri build` locally, then notarize + staple manually:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
pnpm tauri build --target universal-apple-darwin

xcrun notarytool submit "src-tauri/target/universal-apple-darwin/release/bundle/dmg/Spacebar Editor_<version>_universal.dmg" \
  --apple-id "<your-apple-id>" --password "<app-specific-password>" --team-id "<TEAMID>" --wait

xcrun stapler staple "src-tauri/target/universal-apple-darwin/release/bundle/dmg/Spacebar Editor_<version>_universal.dmg"
```

### Without an Apple Developer account

There is no equivalent free fix — Apple intentionally requires notarization for quarantined, downloaded apps; a self-signed certificate does not change Gatekeeper's verdict for anyone other than you on your own keychain. The only two supported paths are: (1) build and install locally (no quarantine, no signing needed), or (2) notarize via a paid Developer ID as above.
