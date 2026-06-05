# Spec 33 — Rust Workspace Path Enforcement

> **Status:** ✅ **Complete** — 2026-06-05
> **Area:** Security · Filesystem · IPC
> **Phase:** B — Enhancement
> **Depends on:** [14-security.md](14-security.md) · [12-ipc.md](12-ipc.md) · [09-tool-system.md](09-tool-system.md)

---

## 1. Problem Statement

The current path sandboxing implementation only enforces workspace bounds in the TypeScript layer (`src/lib/pathUtils.ts`). The Rust backend (`src-tauri/src/modules/filesystem.rs`) accepts any path the operating system will allow. This means:

- A bug or injection in the IPC call could bypass the TS check and reach the Rust layer unguarded
- An attacker who can craft a Tauri IPC payload (e.g. via XSS in a displayed file's content) could read or write arbitrary paths
- Symlinks within the workspace can be used to escape the root — the TS check does not resolve symlinks

The fix is defense-in-depth: **the Rust layer must independently enforce workspace bounds**, resolving symlinks before comparing paths. The TypeScript layer keeps its checks as a first line of defense, not as the sole guard.

---

## 2. Affected Commands

All Rust commands that accept a file or directory path must enforce workspace bounds:

| Command | Path parameters |
|---------|----------------|
| `read_file` | `path` |
| `write_file` | `path` |
| `create_file` | `path` |
| `delete_file` | `path` |
| `rename_file` | `old_path`, `new_path` |
| `list_dir` | `path` |
| `list_dir_tree` | `path` |

Commands that do **not** take workspace-relative paths (PTY, git commands with no user-supplied path, `web_fetch`) are not affected.

---

## 3. Implementation

### 3.1 `canonicalize_workspace_path` Function

Add a new function to `filesystem.rs`:

```rust
/// Resolves `path` to an absolute path and verifies it is inside `workspace_root`.
/// Rejects paths that escape the root via `..` components or symlinks.
///
/// Returns the canonical absolute path on success.
/// Returns `WorkspaceEscapeError` if the resolved path is outside the workspace.
fn canonicalize_workspace_path(
    workspace_root: &Path,
    path: &Path,
) -> Result<PathBuf, WorkspaceEscapeError> {
    // Resolve the workspace root first (it may itself contain symlinks)
    let root = workspace_root.canonicalize().map_err(|e| {
        WorkspaceEscapeError::new(format!("Cannot resolve workspace root: {}", e))
    })?;

    // Build the candidate absolute path (may not yet exist — use lexical join for new files)
    let candidate = if path.is_absolute() {
        path.to_path_buf()
    } else {
        root.join(path)
    };

    // For paths that already exist, use canonicalize to resolve symlinks
    let resolved = if candidate.exists() {
        candidate.canonicalize().map_err(|e| {
            WorkspaceEscapeError::new(format!("Cannot resolve path: {}", e))
        })?
    } else {
        // Path does not exist yet (e.g. create_file target).
        // Resolve the parent directory instead, then re-append the filename.
        let parent = candidate.parent().ok_or_else(|| {
            WorkspaceEscapeError::new("Path has no parent directory".into())
        })?;
        let resolved_parent = if parent.exists() {
            parent.canonicalize().map_err(|e| {
                WorkspaceEscapeError::new(format!("Cannot resolve parent: {}", e))
            })?
        } else {
            // Parent also doesn't exist — use lexical normalization only
            normalize_lexically(&candidate)
        };
        resolved_parent.join(candidate.file_name().unwrap_or_default())
    };

    // The resolved path must start with the workspace root
    if !resolved.starts_with(&root) {
        return Err(WorkspaceEscapeError::new(format!(
            "Path '{}' is outside the workspace root '{}'",
            resolved.display(),
            root.display()
        )));
    }

    Ok(resolved)
}
```

`normalize_lexically` is a helper that removes `.` and `..` components without hitting the filesystem (used when intermediate directories do not exist yet).

### 3.2 `WorkspaceEscapeError` Type

```rust
#[derive(Debug, thiserror::Error, serde::Serialize)]
#[error("WorkspaceEscapeError: {message}")]
pub struct WorkspaceEscapeError {
    pub message: String,
}

impl WorkspaceEscapeError {
    fn new(message: String) -> Self {
        Self { message }
    }
}
```

This error is serialized and returned to the frontend as a Tauri command error. The `ipc.ts` wrapper catches it and formats it as a user-readable tool result (see §4).

### 3.3 Integration in Each Command

Each affected command receives a `workspace_root: String` parameter and calls `canonicalize_workspace_path` before any filesystem operation:

```rust
#[tauri::command]
pub async fn read_file(
    workspace_root: String,
    path: String,
) -> Result<String, CommandError> {
    let root = Path::new(&workspace_root);
    let safe_path = canonicalize_workspace_path(root, Path::new(&path))
        .map_err(CommandError::from)?;
    // ... existing read logic using safe_path ...
}
```

`CommandError` is the existing error enum used by Tauri commands in `filesystem.rs`. Add a `From<WorkspaceEscapeError>` impl.

### 3.4 `rename_file` — Two-Path Check

`rename_file` validates both `old_path` and `new_path` independently. Both must resolve within the workspace root:

```rust
let safe_old = canonicalize_workspace_path(root, Path::new(&old_path))?;
let safe_new = canonicalize_workspace_path(root, Path::new(&new_path))?;
```

---

## 4. Frontend Changes

### 4.1 `ipc.ts` — Add `workspacePath` Parameter

Every wrapper function that calls an affected command gains a `workspacePath` parameter:

```typescript
export async function readFile(workspacePath: string, path: string): Promise<string> {
  return invoke<string>('read_file', { workspacePath, path })
}

export async function writeFile(workspacePath: string, path: string, content: string): Promise<void> {
  return invoke<void>('write_file', { workspacePath, path, content })
}

// ... same pattern for createFile, deleteFile, renameFile, listDir, listDirTree
```

`workspacePath` is already available throughout the app via the `workspacePath` store. Callsites in `toolRunner.ts` pass it through.

### 4.2 `toolRunner.ts` — Pass Through Workspace Path

Tool handlers that invoke filesystem IPC calls must pass `workspacePath`. This is available from the agent context passed into the tool runner.

If a `WorkspaceEscapeError` is returned, format it as a tool result error string (same as other tool errors — see [32-agent-error-recovery.md](32-agent-error-recovery.md)):

```
Error: workspace_escape — Path '../../../etc/passwd' is outside the workspace root.
```

This error is returned to the model as a tool result. The model should treat it as a failed tool call and not retry with the same path.

---

## 5. TypeScript Layer Relationship

The TypeScript `pathUtils.ts` checks remain in place. They run **before** the IPC call, providing a fast-fail that does not require a Rust round-trip for obvious violations (e.g. absolute paths to `/etc/passwd`). The Rust layer is the authoritative enforcement.

| Check | Layer | Handles |
|-------|-------|---------|
| Syntactic `..` traversal | TypeScript (`pathUtils.ts`) | Fast-fail, no Rust round-trip |
| Absolute path outside workspace | TypeScript | Fast-fail |
| Symlink escape | **Rust only** | TS cannot resolve symlinks without `stat` |
| Workspace root resolution | **Rust only** | OS-level canonicalization |

The TS checks do not need to change. They stay as defense-in-depth at the call site level.

---

## 6. Platform Notes

- **Linux/macOS:** `std::fs::canonicalize` uses `realpath(3)` — fully resolves symlinks
- **Windows:** `std::fs::canonicalize` uses `GetFinalPathNameByHandleW` — resolves symlinks and junctions; returns UNC paths (`\\?\...`). The `starts_with` comparison must strip the UNC prefix before comparing: use `dunce::canonicalize` (the `dunce` crate) to get normal Windows paths

Add `dunce = "1"` to `Cargo.toml` dependencies.

---

## 7. Error Messages to the User

When the Rust check fires (meaning the TS check was bypassed), the error reaches the user through the tool result in the chat. The model typically reports the error back in its response. No separate toast is needed — this is a tool execution error (see [32-agent-error-recovery.md](32-agent-error-recovery.md) §3.3).

If the IPC call throws an unhandled `WorkspaceEscapeError` from outside a tool context, `ipc.ts` logs it and shows a generic error toast.

---

## 8. Files to Change

| File | Change |
|------|--------|
| `src-tauri/src/modules/filesystem.rs` | Add `canonicalize_workspace_path`, `WorkspaceEscapeError`; add `workspace_root` param to all 7 affected commands |
| `src-tauri/Cargo.toml` | Add `dunce = "1"` |
| `src/lib/ipc.ts` | Add `workspacePath` param to all 7 affected wrappers |
| `src/lib/tools/toolRunner.ts` | Pass `workspacePath` from agent context into all filesystem IPC calls; handle `WorkspaceEscapeError` in tool result |

The TypeScript `pathUtils.ts` is **not changed** — it remains as-is.

---

*Spec created: 2026-06-01*
