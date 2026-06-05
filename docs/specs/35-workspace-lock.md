# Spec 35 — Workspace Lock

> **Status:** ✅ Implemented — PID-based lock file, stale detection, conflict dialog (Open read-only / Cancel), read-only banner, write-tool guard in toolRunner, CloseRequested release handler.
> **Area:** Workspace · IPC · Security
> **Phase:** C — Hardening
> **Depends on:** [07-workspace.md](07-workspace.md) · [12-ipc.md](12-ipc.md) · [06-state-management.md](06-state-management.md)

---

## 1. Problem Statement

Spacebar Editor persists per-project state to `.sidebar/state.json` (autosaved on every change). If two Spacebar Editor windows open the same project folder simultaneously, they will both read and write this file, causing:

- State overwrites — whichever window saves last wins; the other's changes are silently lost
- Corrupt JSON — interleaved partial writes from concurrent saves
- Diverged chat history — the two windows accumulate separate histories that cannot be reconciled

There is currently no lock mechanism. This spec adds a **PID-based lock file** so at most one writable Spacebar Editor instance owns a given workspace at a time.

---

## 2. Lock File

### 2.1 Location and Format

```
.sidebar/.lock
```

JSON content:

```json
{
  "pid": 12345,
  "timestamp": "2026-06-01T10:30:00Z",
  "hostname": "my-machine"
}
```

- `pid`: the OS process ID of the owning Spacebar Editor window process
- `timestamp`: ISO 8601, wall clock when the lock was acquired
- `hostname`: `gethostname()` — used only for display in the conflict dialog; not used in stale detection

### 2.2 Stale Lock Detection

A lock is **stale** if the PID recorded in the file is not a currently running process. Stale locks are acquired immediately without a dialog.

Platform-specific liveness check:

| Platform | Method |
|----------|--------|
| Linux | Check if `/proc/<pid>` directory exists |
| macOS | `kill(pid, 0)` — returns 0 if the process exists (does not send a signal) |
| Windows | `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid)` — succeeds if process exists |

This check runs in Rust (see §4.1).

---

## 3. Acquisition Flow

On `applyWorkspaceFolder()` (when the user opens a folder):

```
1. Check if .sidebar/.lock exists
2. If no lock file → write lock file with current PID → proceed normally
3. If lock file exists:
   a. Read PID from lock file
   b. Check if PID is a live process (platform check)
   c. If stale → overwrite lock file → proceed normally
   d. If live → show conflict dialog (§5)
```

If writing the lock file fails (permissions error on `.sidebar/`), log a warning and proceed without a lock — degraded behavior is better than blocking the user from their project.

---

## 4. Rust Implementation

### 4.1 New Tauri Commands

Add to `src-tauri/src/modules/filesystem.rs`:

```rust
/// Attempts to acquire a workspace lock.
/// Returns Ok(true) if acquired, Ok(false) if a live lock exists from another process.
/// Returns Err if the check itself fails (e.g. cannot read the lock file).
#[tauri::command]
pub async fn acquire_workspace_lock(workspace_root: String) -> Result<LockResult, String>

/// Releases the workspace lock (deletes .sidebar/.lock).
/// No-op if the lock does not exist or belongs to another PID.
#[tauri::command]
pub async fn release_workspace_lock(workspace_root: String) -> Result<(), String>

/// Reads the current lock file without acquiring or modifying it.
/// Used to populate the conflict dialog.
#[tauri::command]
pub async fn read_workspace_lock(workspace_root: String) -> Result<Option<LockInfo>, String>
```

```rust
#[derive(serde::Serialize, serde::Deserialize)]
pub struct LockInfo {
    pub pid: u32,
    pub timestamp: String,
    pub hostname: String,
}

#[derive(serde::Serialize)]
pub enum LockResult {
    Acquired,          // lock was written; proceed normally
    ConflictLive(LockInfo),  // another process holds a live lock
}
```

### 4.2 Process Liveness Check

```rust
fn is_process_alive(pid: u32) -> bool {
    #[cfg(target_os = "linux")]
    { std::path::Path::new(&format!("/proc/{}", pid)).exists() }

    #[cfg(target_os = "macos")]
    unsafe {
        libc::kill(pid as i32, 0) == 0
    }

    #[cfg(target_os = "windows")]
    unsafe {
        let handle = winapi::um::processthreadsapi::OpenProcess(
            winapi::um::winnt::PROCESS_QUERY_LIMITED_INFORMATION,
            0, pid
        );
        if handle.is_null() { return false; }
        winapi::um::handleapi::CloseHandle(handle);
        true
    }
}
```

### 4.3 Lock Release on Window Close

In the Tauri window event handler (in `main.rs` or the window builder setup), listen for `CloseRequested`:

```rust
window.on_window_event(move |event| {
    if let tauri::WindowEvent::CloseRequested { .. } = event {
        // Best-effort release; do not block window close
        let _ = release_workspace_lock_sync(&workspace_root);
    }
});
```

This is a synchronous, best-effort operation. If the process is killed (`SIGKILL`, power loss), the lock becomes stale and will be cleared on the next open.

---

## 5. Conflict Dialog

When `acquire_workspace_lock` returns `ConflictLive`, the frontend shows a modal dialog:

```
┌─────────────────────────────────────────────────────────┐
│  This folder is already open in another Spacebar Editor      │
│  window (PID 12345, opened 10 minutes ago).             │
│                                                         │
│  Opening the same folder in two windows can corrupt     │
│  your saved state.                                      │
│                                                         │
│  [ Open read-only ]   [ Cancel ]                        │
└─────────────────────────────────────────────────────────┘
```

- **Open read-only**: proceeds to open the workspace in read-only mode (§6). The lock file is not modified.
- **Cancel**: closes the dialog; the folder is not opened.

Note: there is no "Switch to that window" option because Spacebar Editor windows are not addressable by the frontend (Tauri does not expose cross-window focus control in the webview layer without custom Rust commands). This can be added in a future iteration.

---

## 6. Read-Only Mode

When a workspace is opened without acquiring the lock (conflict + "Open read-only" chosen):

### 6.1 What is Disabled

- All agent write tools (`write_file`, `create_file`, `delete_file`, `rename_file`, `run_shell`, git stage/commit/discard)
- State autosave to `.sidebar/state.json` — the in-memory state is not written back to disk
- Manual compaction (produces state changes)

### 6.2 What Still Works

- Chat (model calls, tool reads)
- Plan mode and chat mode (no writes)
- Read-only tools (`read_file`, `list_dir`, `grep`, `get_file_tree`, `get_git_status`, etc.)
- Editor (files are opened read-only; save is disabled)

### 6.3 User Indication

- A persistent banner below the header: `Read-only — this folder is open in another window`
- The composer shows "Read-only mode" in place of the send button when the user is in Agent mode
- If the user attempts a write tool, it returns a tool result error: `Error: read_only_mode — This workspace is open read-only in this window.`

### 6.4 Clearing Read-Only Mode

There is no automatic promotion from read-only to writable. The user must close and reopen the folder. If the other window's lock is now stale, the next open will acquire the lock normally.

---

## 7. Frontend Implementation

### 7.1 `src/lib/workspace.ts`

Add:

```typescript
let workspaceLocked = false  // true = this window owns the lock
let workspaceReadOnly = false  // true = opened without the lock

export async function applyWorkspaceFolder(path: string): Promise<void> {
  // ... existing logic ...
  const result = await ipc.acquireWorkspaceLock(path)
  if (result === 'Acquired') {
    workspaceLocked = true
    workspaceReadOnly = false
  } else {
    // ConflictLive — show dialog
    const choice = await showLockConflictDialog(result.lockInfo)
    if (choice === 'readonly') {
      workspaceReadOnly = true
    } else {
      return  // cancel — don't open the folder
    }
  }
  // ... continue opening ...
}
```

### 7.2 `src/lib/ipc.ts`

Add wrappers for `acquire_workspace_lock`, `release_workspace_lock`, `read_workspace_lock`.

### 7.3 New Svelte Component

`src/modules/workspace/WorkspaceLockDialog.svelte` — the conflict dialog. A modal with the two buttons described in §5. Receives `lockInfo: LockInfo` as a prop and dispatches `'readonly'` or `'cancel'` events.

Also: `WorkspaceReadOnlyBanner.svelte` — the persistent read-only indicator shown in the workbench header.

---

## 8. Files to Change

| File | Change |
|------|--------|
| `src-tauri/src/modules/filesystem.rs` | Add lock commands, `LockInfo`, `LockResult`, `is_process_alive` |
| `src-tauri/src/main.rs` | Register new commands; add `CloseRequested` handler for lock release |
| `src/lib/ipc.ts` | Add `acquireWorkspaceLock`, `releaseWorkspaceLock`, `readWorkspaceLock` wrappers |
| `src/lib/workspace.ts` | Integrate lock acquisition into `applyWorkspaceFolder`; export `isReadOnly` store |
| `src/lib/tools/toolRunner.ts` | Check `isReadOnly` before executing write tools |
| `src/modules/workspace/WorkspaceLockDialog.svelte` | New — conflict dialog |
| `src/modules/workspace/WorkspaceReadOnlyBanner.svelte` | New — persistent read-only banner |
| `src/modules/workbench/WorkbenchShell.svelte` | Mount the read-only banner when `isReadOnly` is true |

---

*Spec created: 2026-06-01*
