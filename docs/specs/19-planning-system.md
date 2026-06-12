# Spec 19 — Planning System (`plans/`)

> **Status:** ❌ Not started  
> **Area:** Plan Mode · Persistence · Agent Integration  
> **Depends on:** [08-ai-agent.md](08-ai-agent.md) (agent loop) · [09-tool-system.md](09-tool-system.md) (tool runner) · [06-state-management.md](06-state-management.md) (`.sidebar/state.json`)

> **Related:** [07-workspace.md](07-workspace.md) · [17-roadmap.md](17-roadmap.md) · [NOT-IMPLEMENTED.md](../../NOT-IMPLEMENTED.md)

---

## 1. Overview

Today, Plan mode is a prompt gate: the agent operates read-only and a planning-flavored system prompt is injected. Plans exist only as chat messages and die when the session ends.

This spec introduces **persistent, file-backed plans** stored under `plans/` at the workspace root. Plans survive session switches, are diffable and committable alongside code, and become the source of truth for multi-session work.

### Goals

- Plans outlive chat sessions and survive mode switches
- Plans are visible to teammates (git-trackable, not hidden in `.sidebar/`)
- The agent can read, create, and update plan files — not just chat about plans
- Progress is human-readable (checkboxes) with minimal machine-readable frontmatter
- The feature is buildable in a single focused sprint; no over-engineered schema on day one

### Non-Goals

- Real-time collaborative editing of plan files
- A dedicated plan editor UI (plans open in the existing CodeMirror editor)
- Dependency graphs or inter-plan linking (deferred)
- Automatic plan execution without user confirmation
- Plans stored outside the workspace (no cloud, no app-global plan registry)
- Specialized plan tools (`list_plans`, `read_plan`, …) — use `read_file` / `write_file` (see §13)

---

## 2. File Layout

```
<workspace-root>/
  plans/
    README.md                        # optional: how plans work in this project
    2026-05-29-refactor-auth.md
    fix-percolation-edge-case.md
    add-websocket-support.md
```

### 2.1 Naming Convention

```
YYYY-MM-DD-<slug>.md
```

- Date prefix: ISO date the plan was created (not last updated)
- Slug: lowercase, hyphen-separated, derived from the first user message or manually set
- No spaces, no special characters beyond hyphens

Examples:

```
2026-05-29-refactor-auth.md      ✅
2026-06-01-fix-search-crash.md   ✅
My Plan (June).md                ❌
plan1.md                         ❌ (no date, ambiguous)
```

The UI generates the slug automatically; the user can rename the file freely afterward.

---

## 3. Plan File Format

Plans are standard Markdown with a minimal YAML frontmatter block.

### 3.1 Full Example

```markdown
---
id: refactor-auth
status: in_progress
created: 2026-05-29
updated: 2026-05-29T14:32:00Z
---

# Refactor Auth Module

Replace the legacy session-cookie auth with JWT. Goal: remove `src/auth/legacy.ts`
entirely and migrate all consumers to `src/auth/jwt.ts`.

## Tasks

- [x] Audit all files importing from `src/auth/legacy.ts`
- [x] Implement `src/auth/jwt.ts` with equivalent interface
- [ ] Migrate `src/api/routes/user.ts`
- [ ] Migrate `src/api/routes/admin.ts`
- [ ] Remove `src/auth/legacy.ts`
- [ ] Update tests

## Notes

`admin.ts` has a non-standard session shape — see comment on line 88.
JWT secret is currently hardcoded in `.env.example`; rotate before merging.
```

### 3.2 Frontmatter Schema

Only these four fields are required. Keep it minimal.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✅ | Stable slug identifier. Must be unique within `plans/`. Matches filename slug. |
| `status` | enum | ✅ | See §3.3 |
| `created` | ISO date | ✅ | `YYYY-MM-DD`. Set once, never changed. |
| `updated` | ISO datetime | ✅ | `YYYY-MM-DDTHH:MM:SSZ`. Updated on every write. |

**Do not** add additional frontmatter fields in v1. No `progress` arrays, no `linkedSessionId`, no `files` lists. Those are sync burdens. Checkboxes in the body are the progress tracker.

### 3.3 Status Values

| Status | Meaning |
|--------|---------|
| `draft` | Created but not yet acted on |
| `in_progress` | Actively being worked on |
| `blocked` | Waiting on something external |
| `done` | All tasks complete |
| `cancelled` | Abandoned; kept for reference |

Transitions:

```
draft → in_progress → done
              ↓            ↑
           blocked ────────┘
              ↓
          cancelled
draft → cancelled
```

### 3.4 Body Conventions

- **`## Tasks`** section: the canonical progress tracker. Use GFM task list syntax (`- [ ]` / `- [x]`).
- **`## Notes`** section: freeform. Caveats, gotchas, context that doesn't belong in the task list.
- **`## Context`** section (optional): file paths, links, related issues. Helps the agent orient.
- Additional sections are allowed. The agent should not restructure existing sections without user instruction.

---

## 4. Session Integration

### 4.1 `activePlanPath` in Session State

Extend `ChatSession` (persisted in `.sidebar/state.json` via `PersistedProjectState`) with one optional field:

```typescript
interface ChatSession {
  // ... existing fields ...
  activePlanPath?: string;  // relative to workspace root, e.g. "plans/2026-05-29-refactor-auth.md"
}
```

This is a **session → plan** reference only. Plans do not reference sessions. Sessions are ephemeral relative to plans.

**Touch points:** `src/lib/stores/chat.ts`, `src/lib/projectState.ts`.

### 4.2 Plan Picker on Plan Mode Entry

When the user enters Plan mode:

1. Glob `plans/*.md` and parse frontmatter for each file.
2. Show a **plan picker UI** (not a chat prompt) before the session starts.
3. Options presented:
   - Each existing plan: name, status badge, unchecked task count
   - **"New plan"** — opens a new plan with a generated slug from the user's first message
4. The selected plan path is stored as `activePlanPath` on the session.

**Do not ask the model to pick.** Models are eager to create new artifacts. A UI affordance prevents plan accumulation.

### 4.3 System Prompt Injection

On Plan mode session start, inject a plan context block into the system prompt:

```
## Active Plan

File: plans/2026-05-29-refactor-auth.md
Status: in_progress

### Open Tasks
- [ ] Migrate `src/api/routes/user.ts`
- [ ] Migrate `src/api/routes/admin.ts`
- [ ] Remove `src/auth/legacy.ts`
- [ ] Update tests

(Full plan available via read_file if needed)
```

Keep the injection concise. Only open tasks and metadata, not the full body. The agent can call `read_file` for the rest.

### 4.4 Plan Index Injection (Secondary)

In addition to the active plan, inject a brief index of all plans for awareness:

```
## All Plans (summary)

| Plan | Status | Open Tasks |
|------|--------|-----------|
| refactor-auth | in_progress | 4 |
| fix-percolation-edge-case | done | 0 |
| add-websocket-support | draft | 6 |
```

This lives after the active plan block and before the general system instructions. Keeps token cost low.

---

## 5. Tool Policy in Plan Mode

Plan mode restricts `write_file` and `create_file` to `plans/**` only. (Today Plan mode is fully read-only — this spec **changes** that policy for plan files only.)

### 5.1 Path Gate

```typescript
// In toolRunner.ts — enforced before any tool execution in Plan mode
function isPlanModeWriteAllowed(toolName: string, args: Record<string, unknown>): boolean {
  if (toolName !== 'write_file' && toolName !== 'create_file') return true;
  const path = String(args.path ?? '');
  return path.startsWith('plans/') || path.startsWith('./plans/');
}
```

If the model attempts to write outside `plans/` in Plan mode, the tool call is blocked and an error is returned in the tool result: `"Write blocked: Plan mode only allows writes to plans/. Switch to Agent mode to modify project files."`

### 5.2 Permitted Operations in Plan Mode

| Tool | Permitted | Notes |
|------|-----------|-------|
| `read_file` | ✅ Always | Read anything |
| `write_file` | ✅ `plans/**` only | Blocked elsewhere |
| `create_file` | ✅ `plans/**` only | Blocked elsewhere |
| `list_dir` | ✅ Always | |
| `get_file_tree` | ✅ Always | |
| `find_file` | ✅ Always | |
| `grep` / `search_files` | ✅ Always | Useful for staleness checks |
| `run_shell` | ❌ Blocked | Not needed in Plan mode |
| `run_tests` | ❌ Blocked | |
| `run_script` | ❌ Blocked | |
| `get_git_status` | ✅ Always | Useful context |
| `get_git_log` | ✅ Always | |
| `get_git_diff` | ✅ Always | |
| `web_fetch` | ✅ Hostname allowlist applies | |
| `delete_file` | ❌ Blocked | Prevent accidental plan deletion |
| `move_file` | 🔶 `plans/**` only | Renaming plans OK |

### 5.3 Agent Mode Access to Plans

In Agent mode, `plans/**` is **readable and writable** with no special restriction — plans are project files. The model should be instructed (via system prompt) to treat `plans/` as documentation it may read and update, not as a protected zone.

---

## 6. Plan Lifecycle Workflows

### 6.1 Creating a New Plan

1. User enters Plan mode → plan picker appears → selects "New plan"
2. User sends first message describing the goal
3. Agent creates `plans/YYYY-MM-DD-<slug>.md` with:
   - Frontmatter: `id`, `status: draft`, `created`, `updated`
   - `# <Title>` derived from user message
   - `## Tasks` section with initial breakdown
   - `## Notes` section (empty or populated if context was provided)
4. `activePlanPath` is set on the session
5. Status auto-advances to `in_progress` when the first task is checked off

### 6.2 Resuming an Existing Plan

1. User enters Plan mode → plan picker → selects an `in_progress` plan
2. `activePlanPath` set on new session
3. System prompt injects open tasks
4. Agent performs optional reconcile pass (§6.4) before proceeding

### 6.3 Implementing a Plan (Agent Mode)

The standard handoff flow:

1. User finishes planning, switches to Agent mode
2. User message: `"implement plans/2026-05-29-refactor-auth.md"` (or similar)
3. Agent reads the plan file as its first action
4. Agent works through tasks, checking them off (`write_file` on the plan) as it goes
5. Agent updates `updated` timestamp in frontmatter on each write

This is the **only** way plans stay current: the agent writes back to the file during implementation, not just at the end.

### 6.4 Reconcile Pass (Staleness Check)

On Plan mode entry for an `in_progress` plan, inject a reconcile instruction into the system prompt:

```
Before proceeding, perform a quick staleness check:
1. For each unchecked task, check whether the referenced files/symbols exist as described.
2. If tasks reference files that have been deleted, moved, or significantly changed, note this in the plan under ## Notes.
3. Do not mark tasks complete unless they are verifiably complete.
4. Report a brief summary of what you found before asking what to work on next.
```

This is a read-only pass. No writes until the user confirms the reconcile summary looks correct.

### 6.5 Closing a Plan

- The agent marks `status: done` in frontmatter when all tasks are checked off
- The user can manually set any status at any time by editing the file
- Done/cancelled plans remain in `plans/` — do not delete them
- The plan picker filters by default to show only `draft` and `in_progress` plans, with a "Show all" toggle

---

## 7. UI Components

### 7.1 Plan Picker

Displayed on Plan mode entry, before chat begins.

```
┌─────────────────────────────────────────────────────┐
│  Select a plan                              [✕ close] │
├─────────────────────────────────────────────────────┤
│  🔵 in_progress   refactor-auth             4 tasks  │
│  🔵 in_progress   add-websocket-support     6 tasks  │
│  ⚪ draft         improve-error-messages    3 tasks  │
│                                      [Show all ↓]    │
├─────────────────────────────────────────────────────┤
│  + New plan                                          │
└─────────────────────────────────────────────────────┘
```

- Clicking a plan sets `activePlanPath` and starts the session
- "New plan" starts the session with no `activePlanPath`; slug is generated from first message
- "Close" enters Plan mode with no active plan (free-form planning)

### 7.2 Active Plan Indicator

In the chat header or status bar while in Plan mode:

```
Plan mode  •  📄 refactor-auth  •  4 tasks remaining
```

Clicking the plan name opens the plan file in the editor.

### 7.3 Plan Status Badge (Explorer)

In the file explorer, `plans/*.md` files display a colored status dot:

- 🔵 `in_progress`
- ⚪ `draft`
- 🟡 `blocked`
- ✅ `done`
- ⬜ `cancelled`

Derived from frontmatter; re-parsed on file save.

---

## 8. Plan Parsing

A lightweight parser is needed to read frontmatter and extract task counts for the picker and system prompt injection. No heavy YAML library required.

### 8.1 Required Parse Operations

```typescript
interface ParsedPlan {
  path: string;              // relative path from workspace root
  id: string;
  status: PlanStatus;
  created: string;           // ISO date string, unparsed
  updated: string;           // ISO datetime string, unparsed
  title: string;             // first H1 in body
  openTaskCount: number;     // count of `- [ ]` lines
  totalTaskCount: number;    // count of all `- [ ]` + `- [x]` lines
  bodyPreview: string;       // first 300 chars of body (for tooltip)
}

type PlanStatus = 'draft' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
```

**Module:** `src/lib/plans.ts` (or `src/lib/plans/` if split grows).

### 8.2 Parse Strategy

- Split on `---` to extract frontmatter block
- Parse frontmatter with a minimal line-by-line key: value parser (no YAML library needed)
- Extract H1 title with a single regex: `/^# (.+)$/m`
- Count tasks with: `/^- \[[ x]\]/gm`
- Fail gracefully: if frontmatter is missing or malformed, treat as `status: draft` with `id` derived from filename

### 8.3 Update Strategy

When writing back to a plan file (e.g., checking off a task, updating status):

1. Read the full file content
2. Update the specific frontmatter field(s) via string replacement on the frontmatter block
3. Always update `updated` to `new Date().toISOString()`
4. Write the full file back — do not reconstruct the body, only touch what changed

---

## 9. Agent Instructions (System Prompt Additions)

These additions are injected into the base system prompt in Plan mode only.

```
## Plan Mode Instructions

You are operating in Plan Mode. Your job is to create, read, and update plan files under plans/.

Rules:
- Write all plans to plans/<YYYY-MM-DD-slug>.md
- Use the frontmatter schema: id, status, created, updated only
- Track progress with GFM checkboxes (- [ ] / - [x]) in a ## Tasks section
- Update the plan file as you work — do not only describe changes in chat
- Always update the `updated` timestamp in frontmatter when writing the plan
- Do NOT write to files outside plans/ in this mode
- Do NOT run shell commands or tests in this mode

When starting work on an existing plan:
- Read the plan file first
- Perform a brief staleness check (do referenced files still exist as described?)
- Report what you found before asking what to work on next
```

---

## 10. `.sidebar/state.json` Changes

```typescript
// No changes to project-level state needed in v1.
// activePlanPath lives on the session, not the project.
```

Extend persisted session shape (`ChatSession` in `PersistedProjectState.sessions` / `history`):

```typescript
interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  messages: PersistedMessage[];
  // NEW:
  activePlanPath?: string;   // e.g. "plans/2026-05-29-refactor-auth.md"
                              // undefined if session has no associated plan
}
```

No other state changes in v1.

---

## 11. Current State (As-Is)

> **Status:** ✅ Documented — behavior exists but is **not** this planning system.

| Area | Today | Target (this spec) |
|------|-------|---------------------|
| Plan mode tools | `READ_ONLY_TOOLS` only (`src/lib/stores/mode.ts`) | Read repo + write **`plans/**` only** |
| Plan storage | Assistant messages only | `plans/*.md` on disk |
| Plan index | Not injected | Glob + parse on Plan mode entry |
| Session link | No `activePlanPath` | Optional per session |
| Activity feed “Plan” row | `planText` from chat (`src/lib/agent/activity.ts`) | Unchanged; optional link to plan file later |

---

## 12. Implementation Plan

### Phase 1 — File convention + basic injection (no UI)

- [ ] Define `ParsedPlan` type and parser (`src/lib/plans.ts`)
- [ ] On Plan mode entry, glob `plans/*.md`, parse all, inject index + active plan summary into system prompt
- [ ] Add `activePlanPath` to `ChatSession` + persistence
- [ ] Enforce `plans/**`-only write gate in `toolRunner.ts` for Plan mode (replace full read-only for writes)

**Deliverable:** Plan context appears in system prompt; writes outside `plans/` are blocked. No UI changes yet.

### Phase 2 — Plan picker UI

- [ ] Build `PlanPicker.svelte` component
- [ ] Wire picker to Plan mode entry flow (`ChatPane.svelte` / mode store)
- [ ] Show active plan indicator in chat header
- [ ] Status dot in file explorer

**Deliverable:** Users can select plans before entering Plan mode. Active plan is visible in UI.

### Phase 3 — Agent write-back

- [ ] Verify `write_file` correctly updates checkboxes in plan body
- [ ] Verify frontmatter `updated` timestamp is written correctly
- [ ] Test agent loop for a full "create plan → implement → mark done" flow

**Deliverable:** Plans stay current as agent works through tasks.

### Phase 4 — Polish

- [ ] Reconcile pass instruction in system prompt on `in_progress` plan load
- [ ] Plan status badges in explorer
- [ ] "Show all" toggle in picker for done/cancelled plans
- [ ] Edge cases: malformed frontmatter, missing `plans/` directory, plan file deleted mid-session
- [ ] Auto-create `plans/README.md` on first plan creation (see §14)

**Touch points (summary):**

| File | Change |
|------|--------|
| `src/lib/stores/mode.ts` | Plan mode tool policy + base prompt |
| `src/lib/stores/chat.ts` | `activePlanPath` on session |
| `src/lib/projectState.ts` | Persist `activePlanPath` |
| `src/lib/tools/toolRunner.ts` | `plans/**` write gate |
| `src/modules/agent/ChatPane.svelte` | Plan picker, prompt injection |
| `src/lib/agent/workspaceContext.ts` | Plan index / active plan blocks (if used) |

---

## 13. Edge Cases and Failure Modes

| Scenario | Handling |
|----------|----------|
| `plans/` directory does not exist | Create it on first plan creation; do not error on Plan mode entry |
| No plans exist | Plan picker shows only "New plan" |
| Frontmatter missing or malformed | Parse best-effort; treat as `status: draft`; do not crash picker |
| Plan file deleted mid-session | Clear `activePlanPath` from session; show warning in chat header |
| Agent writes a plan with an existing `id` | Overwrite — last write wins; user is responsible for naming |
| Model attempts to write outside `plans/` | Tool call returns blocked error; model should self-correct |
| Plan body grows very large | No truncation in file; system prompt injection uses summary only (§4.3) |
| Two sessions with same `activePlanPath` open simultaneously | Last write wins; no locking in v1 |
| User renames plan file | `activePlanPath` on existing sessions becomes stale; clear and warn (v1) |

---

## 14. Out of Scope (Future Specs)

These are explicitly deferred and should not be designed into v1:

- `list_plans` / `read_plan` / `update_plan` specialized tools (use `read_file` / `write_file`)
- `depends_on` / inter-plan dependency links
- `files:` list in frontmatter for staleness tracking
- `linkedSessionId` — sessions reference plans, not the reverse
- `progress` arrays in frontmatter (checkboxes only)
- Plan templates
- Plan export (markdown is already portable)
- OS-level file watcher for external edits to plan files
- Plans stored in `.sidebar/` (drafts not intended for git) — possible future addition

---

## 15. Open Questions

| Question | Recommendation |
|----------|---------------|
| Should `plans/README.md` be auto-created? | Yes, on first plan creation. Explains the format briefly. |
| Should the agent be allowed to delete plan files? | No — `delete_file` blocked in Plan mode; in Agent mode it can but the system prompt should discourage it. |
| Should done plans be shown in the picker? | No by default; "Show all" toggle reveals them. |
| What if the user renames a plan file? | `activePlanPath` on existing sessions becomes stale. Acceptable in v1; clear and warn. |
| Should `updated` be set by the app or the agent? | Both. The app sets it when it detects a save; the agent instruction tells it to set it too. Redundant but correct. |

---

## 16. Acceptance Criteria (MVP)

1. User opens Plan mode → sees plan index in system context (or empty state) after Phase 1; plan picker after Phase 2.
2. User asks for a plan → model creates `plans/YYYY-MM-DD-<slug>.md` with valid frontmatter and checklist.
3. User continues planning → model updates same file (checkboxes + `status` / `updated`).
4. User selects plan in picker → `activePlanPath` persists across app restart.
5. User switches to Agent with “implement plans/foo.md” → agent reads file and edits codebase.
6. Plan files appear in git diff like normal markdown.

---

*Spec updated: 2026-05-29 · Target: Phase 1 in current sprint; Phases 2–3 in following sprint*
