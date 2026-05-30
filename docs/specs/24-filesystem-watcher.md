# Spec 24 — Filesystem Watcher

> **Status:** ✅ Implemented (core) — `watcher.rs` rewritten with replaceable `WatcherState`, debounced (250ms) `fs:changed` emit, ignored-segment filtering; `watch_workspace` command started from `applyWorkspaceFolder`; `FileTree.svelte` listens and refreshes tree + git. Deferred: open-buffer external-modification banner, re-detection hook for skills.
> **Area:** Rust Backend · IPC · Workspace · Editor · Git
> **Phase:** 0 — Polish & trust (Phase B in [17-roadmap.md](17-roadmap.md))
> **Depends on:** [12-ipc.md](12-ipc.md) (events) · [07-workspace.md](07-workspace.md) (`refreshFileTree`) · [06-state-management.md](06-state-management.md) (`files` store) · [11-git.md](11-git.md) (`gitRefresh`)

> **Related:** `extension.md` §4 · `src-tauri/src/modules/watcher.rs` · `src/lib/filesystemSync.ts` · [23-skills-system.md](23-skills-system.md) (re-detect on change)

---

## 1. Overview

The explorer does not update when files change outside the app. Running `git pull`, `npm install`, or any terminal command that creates or deletes files leaves the tree stale until manual refresh, and the git panel does not reflect terminal-driven commits. This erodes trust — a file IDE that shows stale state feels broken.

`watcher.rs` already contains watcher infrastructure but emits nothing to the webview. This spec specifies the **complete integration**: debounced `fs:changed` events, frontend listeners, silent buffer refresh for clean files, a non-destructive indicator for dirty files, and automatic git-panel refresh.

### Goals

- External file create/delete/rename refreshes the explorer tree automatically.
- External modifications to an **open, clean** file silently update the editor buffer.
- External modifications to an **open, dirty** file show a non-destructive "changed on disk" banner — never overwrite unsaved work.
- Terminal-driven git operations refresh the git panel automatically.
- Watcher lifecycle is bound to workspace open/close; `.git/` and `node_modules/` are excluded from noise.

### Non-Goals

- Conflict resolution / 3-way merge for dirty files (show banner, let user choose).
- Watching outside the workspace root.
- Sub-100ms latency (200ms debounce is acceptable and desirable).
- Replacing `filesystemSync.ts` (the watcher feeds it).

---

## 2. Rust Side — `watcher.rs`

### 2.1 Event payload

Emit a Tauri event `fs:changed` to the webview:

```typescript
interface FsChangedEvent {
  kind: "create" | "modify" | "remove" | "rename";
  path: string;        // absolute path
  newPath?: string;    // for renames (old → new)
}
```

### 2.2 Behavior

- **Debounce:** batch raw OS events within a **200ms** window and coalesce — editors emit many rapid modify events per save. Emit at most one `fs:changed` per `(path, kind)` per window.
- **Scope:** watch the workspace root **recursively**, excluding `.git/internal churn` (see §2.3) and `node_modules/`, plus the always-exclude list from [22](22-llm-file-interaction.md) §2.
- **Lifecycle:** start watching on workspace open (`pick_workspace_folder` or dev override); stop and drop the watcher on workspace close/switch. One active watcher per window.

### 2.3 `.git/` handling

`.git/` produces high-volume internal churn. Watch it **selectively**: emit a single coalesced `fs:changed { kind: "modify", path: <.git> }` signal (rate-limited to ~1/sec) used only to bump `gitRefresh` (§4). Do not stream every `.git/objects` write.

### 2.4 New commands / events

| Command / Event | Signature | Role |
|-----------------|-----------|------|
| `watch_start` | `(workspace_path) -> ()` | Begin watching (called on workspace open) |
| `watch_stop` | `() -> ()` | Stop and drop the watcher |
| Event `fs:changed` | `FsChangedEvent` | Debounced change notification |

Implementation note: reuse the `notify` crate already implied by `watcher.rs`; add debouncing via `notify-debouncer-mini` or a manual timer.

---

## 3. Frontend Side

### 3.1 IPC listener

Add to `src/lib/ipc.ts` alongside `listenPtyData`:

```typescript
export async function listenFsChanged(
  cb: (e: FsChangedEvent) => void
): Promise<UnlistenFn>;
```

Start the listener in `applyWorkspaceFolder()`; unlisten on workspace switch.

### 3.2 Routing in `workspace.ts`

On each `fs:changed`:

| `kind` | Action |
|--------|--------|
| `create` / `remove` / `rename` | `refreshFileTree()` (already exists) |
| `modify` (path in `openFiles`, **not dirty**) | Re-read file; update buffer silently |
| `modify` (path in `openFiles`, **dirty**) | Mark `externallyModified`; show banner (§3.4) — do **not** overwrite |
| `modify` (path under `.git/`) | `bumpGitRefresh()` only |

### 3.3 `files` store change

Add a divergence set to `src/lib/stores/files.ts`:

```typescript
externallyModified: Set<string>;   // paths where disk ≠ editor buffer
```

Cleared for a path when the user reloads or saves it.

### 3.4 Editor banner

`EditorSurface.svelte` shows a non-intrusive banner when the active file is in `externallyModified`:

```
⚠ File modified outside the editor.   [Reload]   [Keep mine]
```

- **Reload** — re-read disk, replace buffer, clear dirty + `externallyModified`.
- **Keep mine** — clear `externallyModified` only; next save overwrites disk.

---

## 4. Git Panel Refresh

When `fs:changed` includes a path under `.git/` (e.g. terminal `git pull` / `git commit`), automatically `bumpGitRefresh()`. This closes the current gap where terminal git operations don't update the panel. Rate-limited per §2.3 so a rebase does not spam refreshes.

---

## 5. Implementation Plan

### Phase 1 — Rust emitter

- [ ] Add `watch_start` / `watch_stop` commands; register in `main.rs`
- [ ] Debounced `fs:changed` emission with always-exclude scope
- [ ] Selective `.git/` rate-limited signal

**Deliverable:** Backend emits clean, debounced change events.

### Phase 2 — Tree + git refresh

- [ ] `listenFsChanged` in `ipc.ts`; start/stop with workspace
- [ ] Route create/remove/rename → `refreshFileTree`
- [ ] Route `.git/` → `bumpGitRefresh`

**Deliverable:** Explorer and git panel stay current with external changes.

### Phase 3 — Open-buffer handling

- [ ] `externallyModified` set in `files` store
- [ ] Silent reload for clean open files
- [ ] Editor banner with Reload / Keep mine

**Deliverable:** Open files reflect disk safely without clobbering edits.

### Phase 4 — Integrations

- [ ] Trigger skill re-detection on tree change ([23](23-skills-system.md))
- [ ] Edge-case hardening (§6)

**Touch points:**

| File | Change |
|------|--------|
| `src-tauri/src/modules/watcher.rs` | Debounced emitter, scope, lifecycle |
| `src-tauri/src/main.rs` | Register `watch_start` / `watch_stop` |
| `src/lib/ipc.ts` | `listenFsChanged` + `FsChangedEvent` type |
| `src/lib/workspace.ts` | Routing, listener lifecycle |
| `src/lib/stores/files.ts` | `externallyModified` set |
| `src/modules/editor/EditorSurface.svelte` | Changed-on-disk banner |

---

## 6. Edge Cases & Failure Modes

| Scenario | Handling |
|----------|----------|
| Editor save triggers self `modify` event | Debounce + compare buffer hash; ignore if disk matches buffer |
| Rapid bulk changes (`npm install`) | 200ms debounce coalesces; single tree refresh |
| File deleted while open | Mark tab stale; banner: "File deleted on disk. [Close] [Keep buffer]" |
| Rename of open file | Update tab path if unambiguous (`newPath`); else treat as delete+create |
| Watcher fails to start (permissions) | Toast once; fall back to manual refresh; do not retry-loop |
| `.git/` rebase churn | Rate-limited single `gitRefresh` bump (§2.3) |
| Workspace on network FS | Watcher may miss events; document as known limitation |
| No Tauri (web dev) | `listenFsChanged` is a no-op; manual refresh only |

---

## 7. Open Questions

| Question | Recommendation |
|----------|----------------|
| Debounce window — 200ms? | Yes; revisit if save-self-events leak through. |
| Hash open buffers to detect self-writes? | Yes — cheapest reliable way to suppress save echoes. |
| Watch `.git/` at all, or poll on terminal exit? | Watch selectively (rate-limited); simpler than tracking terminal lifecycle. |
| Should silent reload move the cursor? | No — preserve cursor/scroll on clean reload. |

---

## 8. Acceptance Criteria

1. Creating a file via terminal makes it appear in the explorer within ~1s without manual refresh.
2. `git commit` in the terminal refreshes the git panel automatically.
3. Editing an open, unsaved-clean file externally updates the editor buffer silently, preserving cursor.
4. Editing an open, dirty file externally shows a banner and never overwrites the user's unsaved edits.
5. `node_modules/` churn (e.g. `npm install`) does not flood the UI or scan into the tree.
6. Closing/switching the workspace stops the watcher (no leaked watchers).

---

*Spec created: 2026-05-30 · Source: `extension.md` §4 · Target: Phase 0 (polish & trust)*
