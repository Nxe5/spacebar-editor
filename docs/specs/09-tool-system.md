# Tool System

> **Status:** ✅ **COMPLETE**

---

## Built-in Tools (17)

See `src/lib/tools/toolDefinitions.ts` and `src/lib/tools/toolRunner.ts`.

### Read / Discovery Tools

| Tool | Description | Default Policy | Status |
|------|-------------|----------------|--------|
| `read_file` | Read file contents | allow | ✅ |
| `list_dir` | List directory contents | allow | ✅ |
| `grep` | Search with ripgrep (max 500 matches) | allow | ✅ |
| `find_file` | Find files by glob/substring | allow | ✅ |
| `get_file_tree` | Nested directory tree | allow | ✅ |
| `get_git_status` | List changed/staged/untracked files | allow | ✅ |
| `get_git_log` | Recent commits | allow | ✅ |
| `get_git_diff` | Diff against HEAD | allow | ✅ |
| `web_fetch` | HTTP GET (hostname allowlist) | ask | ✅ |

### Write / Execute Tools

| Tool | Description | Default Policy | Status |
|------|-------------|----------------|--------|
| `str_replace` | Replace an exact substring in an existing file | ask | ✅ |
| `write_file` | Write/overwrite file | allow | ✅ |
| `create_file` | Create new file (fails if exists) | allow | ✅ |
| `delete_file` | Delete file/directory | ask | ✅ |
| `move_file` | Move/rename file | ask | ✅ |
| `run_shell` | Execute shell command | ask | ✅ |
| `run_tests` | Auto-detect and run test suite | ask | ✅ |
| `run_script` | Run script file | ask | ✅ |

---

## Custom Tools

Defined in Settings or `.sidebar/tools.json`:

```json
{
  "customTools": [
    {
      "name": "my_tool",
      "description": "...",
      "parameters": { ... }
    }
  ],
  "toolRules": {
    "my_tool": "allow"
  }
}
```

**Note:** Custom tools require a handler in `TOOL_HANDLERS` to execute; otherwise runtime returns `"Unknown tool"`.

---

## Tool Execution

`src/lib/tools/toolRunner.ts` — **`executeTool(name, args, workspacePath, context?)`**:

1. Requires Tauri environment
2. Requires valid workspace path (not `/` or empty)
3. Dispatches to `TOOL_HANDLERS` map
4. Returns `{ success: boolean, output: string }`

### Path Resolution

Paths resolved via `src/lib/tools/pathUtils.ts`:
- Workspace sandbox: blocks `..` traversal
- Absolute paths outside workspace rejected
- `/file.txt` treated as workspace-relative

---

## Tool Policy

### Resolution Order

1. Custom tool rule (from `.sidebar/tools.json`)
2. Per-tool rule (from global settings)
3. Default rule

### Policy Store

- **Global:** `localStorage` `sidebar.toolPolicy.v2` + Settings UI
- **Project:** `.sidebar/tools.json` merged via `effectiveToolPolicy`

### Functions

- `getActiveToolDefinitions(state)` — builds tool list for model
- `getToolsForPolicy(state, modeToolNames)` — intersects mode list with active definitions
- `resolveToolRule()` — applies resolution order

---

## Tool-specific Notes

### `str_replace`

Patch-style edit for surgical changes to existing files (preferred over `write_file` on large files to save tokens).

- Args: `path`, `old_str`, `new_str`, optional `replace_all` (default `false`)
- Logic lives in `src/lib/tools/strReplace.ts` (`applyStrReplace`) — pure, unit-tested (`tests/unit/strReplace.test.ts`)
- **Fails loudly** when `old_str` is missing, not found, or matches more than once (unless `replace_all` is `true`), forcing the model to re-read the file and copy exact text
- Reports the number of replacements applied; the file write goes through the same Rust `write_file` path (so parent dirs and audit apply)
- Defaults to the `ask` policy (`DEFAULT_ASK_TOOLS` in `toolPolicy.ts`) — treated as a write/mutate tool everywhere (`WRITE_TOOLS`, read-only-mode block)
- Implements Spec [45](45-security-hardening-and-capability-expansion.md) §4.1

### File edit preview (approval UI)

When a write tool (`write_file`, `create_file`, `str_replace`) hits the `ask` gate, the approval panel shows a compact before/after diff so the user can review the change before allowing it.

- `src/lib/agent/fileEditPreview.ts` — `buildFileEditPreview()` resolves the current file (via Rust IPC) and computes the resulting content; `summarizeEditPreview()` renders added/removed lines (bounded, not a full diff engine)
- `ChatPane.svelte` runs this in a `$effect` keyed to the pending approval and renders `.tool-approval-preview`
- For `str_replace`, a preview that cannot apply (ambiguous / missing `old_str`) surfaces the same error the runtime would return

### `web_fetch`

- Requires non-empty host allowlist from settings
- Rust `web_fetch` enforces hostname match
- Default hosts: `github.com`, `raw.githubusercontent.com`, `docs.rs`, `developer.mozilla.org`

### `run_tests`

Auto-detects test runner:
- `package.json` → `pnpm test` / `npm test`
- `Cargo.toml` → `cargo test`
- `pytest.ini` / `setup.py` → `pytest`

### `grep`

- Invokes ripgrep (`rg`) in Rust backend
- Max 500 matches returned
- Supports optional file glob filter

---

## Known Limitations & Roadmap

| Feature | Status | Notes |
|---------|--------|-------|
| Custom tool handlers | ❌ Not started | Filter tools without handlers in policy UI |
| Parallel read-only tools | ✅ Complete | [38-parallel-tool-execution.md](38-parallel-tool-execution.md) |
| Rust path enforcement | ✅ Complete | [33-rust-path-enforcement.md](33-rust-path-enforcement.md) |
| Scope-aware shell policy | ✅ Complete | Allow/deny patterns — [40-product-hardening-and-agent-ux.md](40-product-hardening-and-agent-ux.md) §6 |
| LSP agent tools | ✅ Complete | [41-lsp-agent-tools.md](41-lsp-agent-tools.md) |
