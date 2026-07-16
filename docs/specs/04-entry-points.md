# Entry Points and Windows

> **Status:** ✅ **COMPLETE**

---

## Application Entry Points

| Entry | File | Role | Status |
|-------|------|------|--------|
| Main | `index.html` → `src/main.ts` → `App.svelte` → `WorkbenchShell` | Primary IDE | ✅ |
| Settings | `settings.html` → `src/settings-main.ts` → `SettingsWindowRoot` | Secondary window | ✅ |
| Tauri | `src-tauri/src/main.rs` | `invoke_handler`, PTY manager | ✅ |

---

## Window Management

| Window | ID | Creation | Status |
|--------|----| ---------|--------|
| Main workbench | `main` | App launch | ✅ |
| Settings | `settings` | On demand via `open_settings_window` | ✅ |

---

## Bootstrap Sequence

### Main Window

1. Tauri opens `index.html`
2. `src/main.ts` mounts `App.svelte`
3. `App.svelte` renders `WorkbenchShell.svelte`
4. `WorkbenchShell` on mount:
   - Applies **CLI launch args** (`initLaunchArgs()` → `src/lib/launch/initLaunchArgs.ts`) once — see CLI section below
   - Applies workbench theme from settings
   - Initializes icon theme store
   - Starts project state autosave
   - Registers global keyboard shortcuts

---

## CLI Launch Modes

The `spacebar` CLI (installed via Homebrew cask or `pnpm install-cli`) passes a path to the app, read in Rust via `get_launch_args` and applied at startup by `initLaunchArgs.ts`:

| Invocation | Behavior |
|------------|----------|
| `spacebar <dir>` | Opens the directory as the workspace |
| `spacebar <file>` | Opens the file's parent directory as the workspace, opens the file, and applies `MICRO_EDITOR_LAYOUT` (`src/lib/launch/microEditorLayout.ts`) — chat, tabs, explorer, and bottom panel collapsed for a chrome-free single-file view |
| `spacebar` (no path) | Stays on the Welcome screen |

Launch handling lives in `WorkbenchShell` (mounts at startup), not `FileTree` (which only mounts after a workspace is open). See [36-first-run-onboarding.md](36-first-run-onboarding.md).

### Settings Window

1. User triggers settings (gear icon or `Cmd+,`)
2. `open_settings_window` IPC creates secondary window
3. `settings.html` loads `src/settings-main.ts`
4. Mounts `SettingsWindowRoot.svelte`
