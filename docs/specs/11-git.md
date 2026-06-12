# Git Integration

> **Status:** ✅ **COMPLETE**

---

## Git UI

### GitPanel.svelte

Located at `src/modules/explorer/GitPanel.svelte`:

| Feature | Description | Status |
|---------|-------------|--------|
| Branch display | Current branch + refresh button | ✅ |
| Staged section | Collapsible list of staged files | ✅ |
| Changes section | Collapsible list of unstaged changes | ✅ |
| File rows | Icon, path, status badge (M/A/D/U/R) | ✅ |
| Click action | Open file in diff view | ✅ |
| Hover actions | Open, Discard, Stage/Unstage | ✅ |
| Commit | Message input + recent log display | ✅ |
| Collapse state | Persisted in localStorage | ✅ |

---

## Rust Backend

Located at `src-tauri/src/modules/git.rs`, using **git2**:

| Function | Description | Status |
|----------|-------------|--------|
| `git_current_branch` | Get current branch name | ✅ |
| `git_status` | List changed, staged, untracked files | ✅ |
| `git_diff` | Diff against HEAD (optional path filter) | ✅ |
| `git_stage` | Add file to index | ✅ |
| `git_unstage` | Remove file from index | ✅ |
| `git_commit` | Create commit with message | ✅ |
| `git_log` | Recent commits (up to 500) | ✅ |
| `git_discard` | Restore tracked from HEAD; delete untracked | ✅ |
| `git_file_at_head` | Content at HEAD for diff base | ✅ |
| `git_create_checkpoint` | Snapshot as detached commit under `refs/sidebar/checkpoints/` | ✅ |
| `git_restore_checkpoint` | Restore worktree + index from checkpoint | ✅ |
| `git_is_repo` | Check if path is a git repo | ✅ |

---

## Agent Tools

Formatted for model context:

| Tool | Description | Status |
|------|-------------|--------|
| `get_git_status` | List changed, staged, untracked | ✅ |
| `get_git_log` | Show recent commits | ✅ |
| `get_git_diff` | Show unstaged diff | ✅ |

---

## Diff View

### Opening Diff

1. User clicks file in Git panel Changes/Staged list
2. `openGitDiffFile()` called (`src/lib/git/openChangedFile.ts`)
3. Fetches `diffBase` via `git_file_at_head` IPC
4. Opens file with `diffBase` set

### Diff Decorations

`src/lib/editor/diffDecorations.ts`:
- Compares current content to `diffBase`
- Highlights added lines (green)
- Highlights modified lines (yellow)
- Editor is read-only in diff mode

---

## Git Refresh

`src/lib/stores/gitRefresh.ts`:
- `bumpGitRefresh()` triggers refresh after filesystem mutations
- Git panel subscribes to refresh signal

---

## Status Badges

| Badge | Index | Worktree | Meaning |
|-------|-------|----------|---------|
| A | A | - | Added to index |
| M | M | - | Modified in index |
| M | - | M | Modified in worktree |
| D | D | - | Deleted from index |
| D | - | D | Deleted from worktree |
| R | R | - | Renamed in index |
| ?? | - | ?? | Untracked |

---

## Known Limitations

| Limitation | Status | Notes |
|------------|--------|-------|
| Checkpoint UI | ✅ Complete | Git checkpoints + "↩ Undo last turn" in chat |
| Agent turn undo | ✅ Complete | Restores git checkpoint from agent turn — shipped v0.1.2 |
