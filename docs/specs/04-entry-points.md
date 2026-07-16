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
   - Applies workbench theme from settings
   - Initializes icon theme store
   - Starts project state autosave
   - Registers global keyboard shortcuts

### Settings Window

1. User triggers settings (gear icon or `Cmd+,`)
2. `open_settings_window` IPC creates secondary window
3. `settings.html` loads `src/settings-main.ts`
4. Mounts `SettingsWindowRoot.svelte`
