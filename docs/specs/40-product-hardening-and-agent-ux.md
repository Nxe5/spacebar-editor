# Spec 40 — Product Hardening & Agent UX

> **Status:** 🔶 **Partial** — **v0.1.1 (done):** shell patterns, write audit, agent defaults, workspace prompt/notice. **v0.1.5 (done):** GLM + Kimi providers, API keys back in app settings, PTY resize. **Deferred:** §5 activity step grouping. **LSP agent tools:** see [41-lsp-agent-tools.md](41-lsp-agent-tools.md) (implemented).
> **Area:** Security · Workspace · Agent UI · Tool policy · LSP · Defaults
> **Phase:** B → C (trust before broad distribution)
> **Depends on:** [07-workspace.md](07-workspace.md) · [09-tool-system.md](09-tool-system.md) · [14-security.md](14-security.md) · [08-ai-agent.md](08-ai-agent.md) · [25-lsp-diagnostics.md](25-lsp-diagnostics.md) · [21-context-compaction.md](21-context-compaction.md)

> **Related:** [17-roadmap.md](17-roadmap.md) · [32-agent-error-recovery.md](32-agent-error-recovery.md) · [33-rust-path-enforcement.md](33-rust-path-enforcement.md) · [38-parallel-tool-execution.md](38-parallel-tool-execution.md)

---

## 1. Overview

Spacebar Editor’s core loop (local models, `.sidebar/` project metadata, 16 tools, compaction, skills) is **shipped and usable**. This spec captures the next wave of improvements identified from dogfooding and security review: fixes that reduce silent failure modes, make agent sessions easier to audit, and close gaps between “prototype” and “desktop app you can trust.”

### Product constraints (explicit)

| Constraint | Decision |
|------------|----------|
| **Single workspace root** | One opened folder = one project. Multi-root / monorepo workspaces are **out of scope** for this spec (noted as future). |
| **Local-first cost model** | Ollama / llama.cpp runs are not billed per token; defaults may be more permissive for **local** backends than cloud. |
| **Compaction** | Stays under **Settings → Experimental → Compaction** until promotion criteria in §7 are met. |
| **App metadata root** | All project-local Sidebar state lives under **`.sidebar/`** at the workspace root only — never a second metadata tree elsewhere. |

### Goals

1. **Secrets:** API keys never stored in `localStorage` for production paths.
2. **Workspace discipline:** Stop agents from treating the opened repo as a disposable parent for nested “new project” trees (`tester/`, `minimal-ai/`, etc.) without user intent.
3. **Readable agent trace:** Chat activity shows **intent-level steps** (Plan → grouped actions), not a wall of raw `run_shell` lines.
4. **Smarter policy:** Scope-aware rules (e.g. auto-allow `pnpm test`, ask for other shell) to reduce approval fatigue without blanket `allow` on `run_shell`.
5. **Auditable writes:** Implicit parent-directory creation remains convenient but **visible** in the tool trace.
6. **Safer defaults:** Conservative agent step limits where runaway loops cause real damage; opt-in unlimited.
7. **LSP as agent capability:** Optional tools that wrap LSP queries (references, definition) — differentiated from editor-only navigation.

### Non-Goals

- Multi-root workspaces / `packages/` monorepo roots (document only; separate future spec).
- Graduating compaction out of Experimental in this spec (criteria only).
- Bundled language servers or full LSP parity (go-to-def in editor remains [25](25-lsp-diagnostics.md)).
- Replacing `run_shell` entirely with higher-level tools (scaffolding helpers are optional Phase 2).

---

## 2. Problem inventory

| # | Problem | Impact | Priority |
|---|---------|--------|----------|
| P1 | API keys in `localStorage` (`sidebar.settings.v4`) | Keys in devtools, crash dumps, any XSS in webview | **P0** |
| P2 | Agent scaffolds nested project folders inside workspace (`mkdir tester && pnpm create vite …`) | User’s repo becomes a parent of unrelated apps; explorer noise; hard to audit | **P1** |
| P3 | Activity feed lists every `run_shell` as a peer row | Sessions look like `Shell` · `Shell` · `Shell` instead of a plan | **P1** |
| P4 | Tool policy is only `allow` / `ask` / `deny` per tool name | Power users over-allow `run_shell` or suffer approval fatigue | **P2** |
| P5 | `write_file` / `create_file` create parent dirs silently in Rust | Convenient but no `mkdir` in trace; directory trees appear “from nowhere” | **P2** |
| P6 | `maxAgentSteps: 0` (unlimited) default | Confused local model can loop; asymmetric cost (time + FS damage) | **P2** |
| P7 | LSP partial in editor; agent cannot query symbols | AI pane is first-class; editor navigation is second-class | **P3** |
| P8 | Compaction experimental while load-bearing | Long sessions depend on it; failures degrade agent silently | **Monitor** (§7) |

---

## 3. Phase 0 — Secrets in OS keychain (P0)

> **Superseded (v0.1.5):** Cloud API keys are stored in app settings (`settings.apiKeys` in `sidebar.settings.v4`) to avoid OS keychain permission prompts. Current behavior: [14-security.md](14-security.md) §API Key Storage. The keychain design below is historical (shipped v0.1.2, reverted v0.1.5).

> Supersedes the “planned” wording in [14-security.md](14-security.md) — this is **required before external users**, not optional polish.

### 3.1 Target behavior

| Secret | Storage | Webview access |
|--------|---------|----------------|
| Anthropic API key | OS keychain (Keychain / libsecret / Credential Manager) | Never — read only in Rust for HTTP |
| DeepSeek API key | Same | Never |
| Non-secret settings | `localStorage` `sidebar.settings.v4` | Yes |

Use Tauri’s **keyring** plugin (or Stronghold if unified secret store is preferred). Service name: e.g. `spacebar-editor`.

### 3.2 Migration

1. On upgrade, if `settings.apiKeys.*` is non-empty in `localStorage`, write to keychain and **clear** from persisted JSON.
2. Settings UI: password-style fields; “stored in system keychain” hint; test connection still works.
3. Dev: `__SPACEBAR_EDITOR_ENV_*__` injection unchanged for local dev only.

### 3.3 LLM HTTP (follow-on)

Phase 0 can keep `fetch` in webview if keys are injected per-request from Rust via a thin `get_api_key(provider)` command that never returns the key to persistent JS — **or** move streaming to Rust in Phase 0b ([14-security.md](14-security.md) §LLM HTTP). Minimum bar: **keys not in localStorage**.

### 3.4 Acceptance

- [ ] Fresh install: no API key material in `localStorage` after save.
- [ ] Provider chat works after restart with key only in keychain.
- [ ] `14-security.md` status table updated to ✅ for key storage.

---

## 4. Phase 1 — Workspace discipline & single-root clarity (P1 / P2)

### 4.1 Nested scaffolding inside the opened folder

**Observed behavior:** In Agent mode, models often run sequences like:

```text
Plan: Initialize project with Vite…
Shell: mkdir -p tester && cd tester && pnpm init …
Shell: cd tester && pnpm create vite minimal-ai …
Shell: cd tester/minimal-ai && pnpm add -D tailwindcss …
```

The user opened `~/my-app` but the real work lands in `~/my-app/tester/minimal-ai/`, leaving an extra directory tier and polluting git status.

**Root causes:**

- No product rule that the **opened folder is the project root** for agent work.
- `run_shell` is the only “do anything” tool; models default to shell for scaffolding.
- Activity UI does not discourage or summarize this pattern.

### 4.2 Requirements

| ID | Requirement |
|----|-------------|
| W1 | System prompt (Agent + detailed verbosity): **prefer mutating and creating files under the workspace root** unless the user explicitly asks for a subfolder or new package path. |
| W2 | When the model creates a **new top-level directory** (depth 1 under workspace) containing `package.json`, `Cargo.toml`, or `.git` after `run_shell`, show a **non-blocking notice** in chat: “Agent created a nested project at `tester/` — open that folder if it should be the workspace root.” |
| W3 | **Never** create `.sidebar/` outside the workspace root; `ensure_sidebar_dir` only runs for the active `workspacePath`. |
| W4 | Document in [07-workspace.md](07-workspace.md): one folder = one project; monorepos use the repo root and paths like `packages/foo` inside it — not a second Spacebar Editor workspace. |

### 4.3 Optional tools (Phase 1b)

Reduce shell-only scaffolding:

| Tool | Purpose |
|------|---------|
| `scaffold_frontend` (name TBD) | Declarative: template (`vite-react-ts`), target dir **relative to workspace root**, idempotent guardrails |
| `ensure_dir` | Explicit mkdir with logged path (audit-friendly alternative to implicit parents) |

Not required for Phase 1 if prompt + notice (W1–W2) ship first.

### 4.4 Acceptance

- [ ] Agent asked to “add Vite to this project” modifies existing root `package.json` when present, not `tester/minimal-ai/` by default.
- [ ] Nested scaffold notice appears once per session per new top-level project dir.
- [ ] `.sidebar` exists only at `<workspace>/.sidebar/`.

---

## 5. Phase 1 — Agent activity narrative (P1 / P3)

> **Release:** **v0.1.1** (remaining). Display-only; no change to tool execution.

Replace chip-per-tool / raw shell spam with **structured, collapsible sections** aligned with how users reason about work.

### 5.1 UX model

```text
▸ Plan
    Initialize the project with Vite, React, TypeScript, and Tailwind…

▸ Step 1 — Prepare workspace
    create_dir tester/          (or grouped: mkdir -p tester)
    run_shell: pnpm init …

▸ Step 2 — Scaffold app
    run_shell: pnpm create vite minimal-ai --template react-ts
    run_shell: pnpm add -D tailwindcss …

▸ Step 3 — Configure Tailwind
    write_file: tester/minimal-ai/tailwind.config.js
    …

▸ Response
    …
```

- **Plan** — existing plan line / first assistant prose before tools (unchanged semantics).
- **Steps** — **derived in UI**, not a new model protocol in v1:
  - Group tools between plan boundaries or between “major” write/shell clusters.
  - Merge consecutive `run_shell` with same working-directory prefix into one expandable block.
  - Show **summary line** collapsed; expand for full command + stdout/stderr.
- **Per-tool rows** remain available in expanded detail (input/output), same as today.

### 5.2 Grouping heuristics (v1)

| Signal | Group into one “Step” |
|--------|------------------------|
| Same `run_shell` cwd (parsed from `cd` prefix or workspace-relative path) | Consecutive shell calls |
| `write_file` / `create_file` under same new directory prefix | “Configure &lt;dir&gt;” |
| `read_file` / `grep` only | Optional “Explore” step (collapsed by default) |
| `parse_error` | Always its own row with label **Parse error** (already labeled in activity) |

### 5.3 Implementation sketch

| Component | Change |
|-----------|--------|
| `src/lib/agent/activity.ts` | `groupToolsForDisplay(tools): ActivityStep[]` |
| `AgentActivityFeed.svelte` | Render steps; step header toggles children; preserve per-tool expand for audit |
| `ChatPane.svelte` | No change to execution — display-only |

### 5.4 Non-goals (v1)

- Model emitting explicit `step_id` in tool calls.
- Hiding raw shell from expanded view (audit trail must remain).

### 5.5 Acceptance

- [ ] Session with 5+ shell calls shows ≤3 step headers by default, not 5 identical “Shell” rows.
- [ ] Expanded step shows ordered tool list with full I/O.
- [ ] Plan / Response sections unchanged.

---

## 6. Phase 2 — Scope-aware tool policy (P2 / P4)

Extend [09-tool-system.md](09-tool-system.md) beyond flat per-tool rules.

### 6.1 Rule types

| Type | Example | Resolves to |
|------|---------|-------------|
| `tool` | `run_shell: ask` | Current behavior |
| `shell_allow_pattern` | `^pnpm (test|run build)$` | `allow` if match |
| `shell_deny_pattern` | `rm -rf` | `deny` |
| `shell_ask_default` | (fallback for `run_shell`) | `ask` |

Resolution order: deny pattern → allow pattern → per-tool rule → default rule.

### 6.2 Storage

```json
// .sidebar/tools.json (project overrides global)
{
  "toolRules": { "run_shell": "ask" },
  "shellRules": {
    "allowPatterns": ["^pnpm test", "^cargo test"],
    "denyPatterns": ["\\brm\\s+-rf\\b"]
  }
}
```

Settings → Tools: table UI for patterns + test matcher against sample command.

### 6.3 Acceptance

- [ ] `pnpm test` auto-runs when pattern configured; `curl evil.com` still asks.
- [ ] Patterns apply in Agent mode only (Chat mode has no tools).

---

## 7. Phase 2 — Auditable filesystem writes (P2 / P5)

Today `write_file` / `create_file` in Rust call `create_dir_all` on parents ([filesystem.rs](../../src-tauri/src/modules/filesystem.rs)). 

### 7.1 Options (pick one for v1)

| Option | Behavior |
|--------|----------|
| **A — Log in tool result** (recommended) | Return prefix: `Created directories: src/components/` then file body. Model and user see audit trail. |
| **B — Setting** | `agent.createParentDirs: true` (default true); when false, fail with clear error |
| **C — Explicit tool** | Add `ensure_dir`; remove implicit mkdir from write tools |

Recommend **A** immediately; **B** if users want strict audit mode.

### 7.2 Acceptance

- [ ] First write to `deep/nested/file.ts` tool result mentions created parent paths.
- [ ] No behavior change when parents already exist (no noise).

---

## 8. Phase 2 — Agent limit defaults (P2 / P6)

Unlimited steps (`maxAgentSteps: 0`) is dangerous even with local models: time, disk, and allowlisted shell compound.

### 8.1 Proposed defaults

| Backend class | `maxAgentSteps` | `maxToolCallsPerRun` | Notes |
|---------------|-----------------|----------------------|-------|
| Cloud (Anthropic, DeepSeek, GLM, Kimi) | **24** | **80** | Conservative |
| Local (Ollama, llama.cpp) | **40** | **120** | Higher; still bounded |
| User override | 0 = unlimited | 0 = unlimited | Explicit opt-in in Settings → Tools |

Implement via `normalizeAgentLimits()` defaults keyed off `chatBackend`, or separate stored defaults with migration from legacy unlimited.

### 8.2 Acceptance

- [ ] New install: Agent mode stops after step cap with [32](32-agent-error-recovery.md) continue UX.
- [ ] Existing users with saved `0` keep unlimited (no silent migration).

---

## 9. Phase 3 — LSP tools for the agent (P3 / P7)

> **Release:** Moved to [41-lsp-agent-tools.md](41-lsp-agent-tools.md) — **implemented** there (frontend `LspClient` bridge).

Editor LSP remains [25](25-lsp-diagnostics.md). **Agent-facing** LSP wraps the same `LspClient`:

| Tool | LSP method | Use case |
|------|------------|----------|
| `lsp_find_references` | `textDocument/references` | Refactor impact before edits |
| `lsp_go_to_definition` | `textDocument/definition` | Resolve symbol location |
| `lsp_document_symbols` | `documentSymbol` | Map file structure without reading entire file |

- Read-only tools → `allow` by default in Agent mode.
- Return paths + ranges as markdown/plain for model consumption.
- Requires language server running for file’s language; clear error if server missing.

**Differentiation:** Cursor does not expose “find references” as an agent tool; this is a deliberate local-first power feature.

---

## 10. Compaction — stay experimental; promotion criteria (P8)

Compaction implementation is **complete** ([21](21-context-compaction.md)); the **Experimental** flag stays until:

| Criterion | Measurement |
|-----------|-------------|
| Summarization quality | Manual eval: 10 long sessions retain task + file list + open decisions |
| Trigger logic | No compaction mid-tool-chain; threshold respects user % |
| Failure visibility | Compaction errors surface in chat + toast; never silent empty history |
| Manual override | Compact button + archive/restore used successfully in dogfooding |

When all pass for two release cycles, move toggle to **Settings → Agent** (not Experimental) without changing behavior.

**Not in scope:** New compaction algorithm in this spec.

---

## 11. Future — multi-root workspaces

Monorepos (`packages/*`, `apps/*`) need either:

- Opening the **repo root** and path-aware prompts (“edit `packages/api` only”), or
- Multiple workspace roots in one window.

Track as **Spec 41+** when Phase 0–2 of this spec are stable. No implementation in Spec 40.

---

## 12. Implementation order

| Order | Item | Spec § | Est. |
|-------|------|--------|------|
| 1 | Keychain storage + migration | §3 | ❌ Superseded — reverted v0.1.5 (app settings) |
| 2 | Activity step grouping UI | §5 | **v0.1.1** (remaining) |
| 3 | Workspace prompt + nested scaffold notice | §4 | ✅ v0.1.1 |
| 4 | Write tool parent-dir audit log | §7 | ✅ v0.1.1 |
| 5 | Backend-aware agent step defaults | §8 | ✅ v0.1.1 |
| 6 | Shell pattern policy | §6 | ✅ v0.1.1 |
| 7 | LSP agent tools | §9 → [41](41-lsp-agent-tools.md) | ✅ |

---

## 13. Documentation updates (when implementing)

| Doc | Update |
|-----|--------|
| [14-security.md](14-security.md) | App-settings keys ✅; keychain superseded |
| [07-workspace.md](07-workspace.md) | Single root; nested scaffold notice |
| [09-tool-system.md](09-tool-system.md) | Shell patterns; write audit line |
| [08-ai-agent.md](08-ai-agent.md) | Defaults table; activity steps cross-link |
| [17-roadmap.md](17-roadmap.md) | Phase B/C items from this spec |
| [README.md](../README.md) / [OVERVIEW.md](../overview/OVERVIEW.md) | One-paragraph “hardening program” link |

---

## 14. Acceptance (program-level)

- [ ] No API keys in project files under `.sidebar/` (global settings only).
- [ ] Agent session with repeated shell shows grouped steps, expandable to full trace.
- [ ] User opening `my-repo` is not left with unexplained `tester/minimal-ai/` without a notice.
- [ ] `write_file` to nested path documents created directories in tool output.
- [ ] Compaction remains under Experimental with §10 criteria documented.
- [ ] Multi-root explicitly deferred with pointer to §11.
