# Spec 45 — Security Hardening & Capability Expansion

> **Status:** 📋 **Draft for review** — not yet scheduled against a release
> **Version:** 0.1 — 2026-07-10
> **Area:** Security · Trust · Tools · Agent UX · Network egress
> **Companion docs:** [OVERVIEW.md](../overview/OVERVIEW.md) · [ARCHITECTURE.md](../architecture/ARCHITECTURE.md) · [14-security.md](14-security.md) · [40-product-hardening-and-agent-ux.md](40-product-hardening-and-agent-ux.md)
> **Supersedes / extends:** Trust-boundary gaps not covered by [33-rust-path-enforcement.md](33-rust-path-enforcement.md) or [40-product-hardening-and-agent-ux.md](40-product-hardening-and-agent-ux.md)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Track A — Trust & Injection](#2-track-a--trust--injection)
3. [Track B — Enforcement Gaps](#3-track-b--enforcement-gaps)
4. [Track C — Capability Expansion](#4-track-c--capability-expansion)
5. [Prioritized Roadmap](#5-prioritized-roadmap)
6. [Open Questions & Codebase Notes](#6-open-questions--codebase-notes)

---

## 1. Executive Summary

Spacebar Editor's core safety model — mode-scoped tools, policy gates (`allow` / `ask` / `deny`), a two-layer path sandbox, and git-checkpoint undo — is sound. The gaps below are not flaws in that model; they are places where **opening a project folder implicitly grants it trust** that the policy layer assumes only the user grants.

The single highest-priority fix is **Workspace Trust** (§2.1): today, a cloned repository can inject system-prompt content and potentially loosen tool policy the moment its folder is opened, with no user action beyond "Open Folder." Everything else in this plan is secondary to closing that gap, because several other issues (widened policy, silent shell escape of the `web_fetch` allowlist) are only dangerous *in combination* with untrusted-folder auto-load.

Issues are grouped into three tracks:

| Track | Focus |
|-------|--------|
| **A — Trust & Injection** (§2) | What a hostile project can do to the agent without user consent |
| **B — Enforcement Gaps** (§3) | Places where an existing safety boundary can be bypassed |
| **C — Capability Expansion** (§4) | Tools/features that reduce risk *and* improve the product |

Each item has a priority (**P0** = blocks safe multi-repo use today, **P1** = should land before broader distribution, **P2** = roadmap), a proposed fix, and open questions for the team to resolve before implementation.

**Suggested release:** Ship all **P0** items together as a single **"trust boundary"** release (target **v0.1.6**) before any further multi-repo or team-facing distribution.

---

## 2. Track A — Trust & Injection

### 2.1 Workspace Trust gate (P0)

**Problem:**
Opening a folder auto-loads, with no confirmation:

- `.sidebar/prompts.json` + `prompts/*.md` → injected into the assembled system prompt
- `.sidebar/skills/<id>/` → interpolated skill blocks, also injected into the system prompt
- `.sidebar/tools.json` → tool rules **and custom tool schemas**

A cloned or downloaded repository can therefore inject instructions into the agent's context before the user has typed a single message, and — if `tools.json` can *widen* policy rather than only narrow it — can disarm the `ask` gate on `run_shell` / `delete_file` / etc. This is functionally equivalent to prompt injection with no click-through required.

**Proposed fix:**

1. **Introduce a per-folder trust state** (`trusted` / `untrusted` / `restricted`), stored **outside** the project (e.g. a global `trustedWorkspaces` list keyed by canonicalized path — not inside `.sidebar/` where the untrusted content lives). Persist in `localStorage` under a new key (e.g. `sidebar.trustedWorkspaces.v1`).
2. **On first open of an unfamiliar folder**, show a modal **before** any `.sidebar/` agent content is loaded:
   - Summarize what will be injected: number of skill files, prompt files, and a diff-style view of any policy overrides in `tools.json`
   - Offer: *Trust & Open* / *Open in Restricted Mode* / *Cancel*
3. **Restricted mode** still allows browsing/editing files — skip system-prompt injection and project custom tool schemas until the user explicitly upgrades trust. Default chat mode to **Chat** (no tools) or **Plan** (read-only) only.
4. **Re-prompt** if `.sidebar/tools.json`, `prompts/*.md`, or `skills/*` change on disk after trust was granted (hook into existing `fs:changed` / filesystem watcher from [24-filesystem-watcher.md](24-filesystem-watcher.md)).

**UI indicator:** Show a subtle badge in the status bar when the workspace is in restricted mode (e.g. "Restricted" pill next to the git branch pill) so users do not forget.

**Open questions:**

- Should trust be per-machine only, or exportable via a signed team manifest to avoid re-prompting every teammate?
- Should restricted mode block `.sidebar/state.json` session restore of prior agent transcripts that assumed full trust?

**Files (initial estimate):** `src/lib/workspaceTrust.ts`, `src/modules/workspace/TrustGateModal.svelte`, `src/lib/projectState.ts` (defer prompt/skill load), `WorkbenchShell.svelte`.

---

### 2.2 Tool policy: project files may only narrow, never widen (P0)

**Problem:**
If `.sidebar/tools.json` can move a tool from `ask` / `deny` to `allow`, a hostile repo can neutralize the user's own safety settings — turning "the agent will ask before running shell commands" into "the agent silently runs shell commands," without the user changing anything in Settings.

**Codebase confirmation (v0.1.5):** `mergeProjectToolsLayer()` in `src/lib/projectTools.ts` spreads project rules **over** global rules with no strictness ordering:

```typescript
toolRules: { ...global.toolRules, ...(project.toolRules ?? {}) },
```

A project file **can widen** policy today. This is a **confirmed bug**, not a hypothetical hardening measure.

**Proposed fix:**

- Define strictness order: `deny` (strictest) → `ask` → `allow` (most permissive).
- Compute per-tool effective rule as: `minStrictness(globalUserPolicy, projectPolicy)`.
- Project-level `tools.json` may only move a tool **down** the strictness order, never up.
- If a project file attempts to widen a policy, **ignore** that override and surface a non-blocking notice: "This project attempted to loosen tool permissions; the request was ignored."
- **Custom tool schemas:** project custom tools must not shadow built-in tool names (no project-defined `run_shell` replacing the real handler).

**Optional:** Audit log of policy override attempts per project in Settings → Tools.

**Files:** `src/lib/projectTools.ts`, `src/lib/toolPolicy.ts`, `src/lib/stores/toolPolicy.ts`, tests in `tests/unit/projectTools.test.ts`.

---

### 2.3 Dead IPC surface: legacy secrets commands (P1)

**Problem:**
`secrets.rs` keychain commands (`save_cloud_api_key`, `get_cloud_api_key`, `has_cloud_api_key`, `delete_cloud_api_key`) remain registered in the Tauri `invoke_handler` but are unused by the frontend (`apiSecrets.ts` reads from `settings.apiKeys` instead). Any registered Tauri command is invokable from the webview context — unnecessary attack surface for zero product value today.

**Proposed fix:**

- **Option A (preferred):** Remove `secrets.rs` commands from `invoke_handler` registration and delete or archive the module. If OS-keychain storage returns (§2.5), reintroduce deliberately with a fresh audit.
- **Option B:** Gate behind a compile-time feature flag disabled in production builds.

**Files:** `src-tauri/src/main.rs`, `src-tauri/src/modules/secrets.rs`.

---

### 2.4 Webview XSS → Tauri invoke pivot (P1)

**Problem:**
Two rendering surfaces need explicit audit:

1. **Chat message rendering** — if model output (including tool results from file contents or `web_fetch`) is rendered as raw HTML, injected script could call `window.__TAURI__.invoke(...)`.
2. **Preview iframe** — renders arbitrary project web content inside the main webview ([44-editor-actions-browser-tab.md](44-editor-actions-browser-tab.md) §4.1). Sandbox attribute is **intentionally omitted** on WebKitGTK; iframe shares the parent Tauri bridge context.

**Codebase confirmation (v0.1.5):** Chat messages are rendered as **plain text** today ([14-security.md](14-security.md)). Preview uses an `<iframe>` in `PreviewPane.svelte` inside the main webview, localhost-only URLs, **no** `sandbox` attribute.

**Proposed fix:**

- Confirm/enforce: any future Markdown renderer uses sanitization (`DOMPurify` or HTML-disabled Markdown) — no raw `{@html}` on untrusted content.
- Evaluate Tauri **isolation** pattern or a separate unprivileged webview for preview so `contentWindow` cannot reach `__TAURI__`.
- Add standing release checklist item in [14-security.md](14-security.md): "Can content rendered from project/model data reach a Tauri `invoke` call?"

---

### 2.5 API key storage regression (P2)

**Problem:**
Per v0.1.5, API keys moved from OS keychain back into `sidebar.settings.v4`. This is a confidentiality downgrade vs. keychain storage — easier to read via local malware, backup leakage, or (given §2.4) XSS-driven exfiltration.

**Codebase confirmation (v0.1.5):** Reverted because OS keychain triggered repeated permission prompts on some platforms ([14-security.md](14-security.md) §API Key Storage).

**Proposed fix:**

- Re-evaluate whether the UX tradeoff still holds after Track A/B land.
- If keychain returns: rebuild cleanly (not resurrect `secrets.rs` as-is — see §2.3).
- **Minimum bar if staying in settings:** confirm keys are never written to `.sidebar/state.json` or any project-scoped export; exclude from any future "export settings" feature.

---

## 3. Track B — Enforcement Gaps

### 3.1 `web_fetch` allowlist is bypassable via `run_shell` (P0)

**Problem:**
The hostname allowlist on `web_fetch` provides no real security boundary once `run_shell` is enabled in Agent mode — the model can `curl` / `wget` / `Invoke-WebRequest` any host. The allowlist is effectively a UX nudge, not a control.

**Proposed fix (pick one):**

| Option | Action |
|--------|--------|
| **A (recommended now)** | Reframe allowlist in UI as "default hosts for the fetch tool," not a security boundary. Rely on `ask` policy on `run_shell` + the web access toggle (§4.7). Document honestly in Settings → Tools and [09-tool-system.md](09-tool-system.md). |
| **B (roadmap)** | Sandbox `run_shell` network egress to share the same allowlist (network namespace / proxy). Only way the allowlist becomes a real boundary. |

**Recommendation:** Option A now; Option B as a Track C follow-on if users demand hard egress controls.

---

### 3.2 SSRF via DNS rebinding on `web_fetch` (P1)

**Problem:**
If the allowlist matches hostname strings rather than resolved IPs, DNS rebinding could point an allowlisted hostname at an internal address at request time.

**Proposed fix:**

- Resolve hostname at request time in Rust `web_fetch`.
- Reject resolved IPs in private/loopback/link-local ranges (RFC 1918, 127.0.0.0/8, 169.254.0.0/16, etc.).
- Pin the resolved IP for the actual fetch (no re-resolve between check and connect).

**Files:** `src-tauri/src/modules/filesystem.rs` (or dedicated `web_fetch.rs`).

---

### 3.3 `workspace_root` enforcement must be non-optional from model-facing tool calls (P0)

**Problem:**
[33-rust-path-enforcement.md](33-rust-path-enforcement.md) notes `workspace_root` is optional on Rust FS commands (`null` allowed for UI reads like icon packs). The sandbox is only as strong as the guarantee that **agent tool calls always pass a non-null, app-supplied root** — never one from model output.

**Codebase confirmation (v0.1.5):** `toolRunner.ts` passes `workspacePath` from the agent loop context (`executeTool`), not from model tool-call arguments. Model supplies only tool-specific args (`path`, `pattern`, etc.) resolved via `resolveWorkspacePath()`. **Likely safe today** — this item is primarily an **audit + regression test** exercise.

**Proposed fix:**

- Audit every `toolRunner` → `ipc.ts` call on behalf of model tools; assert `workspacePath` comes from `files.workspacePath` / session state only.
- Rust-side: fail closed if an agent-tagged invocation lacks `workspace_root` (optional: new IPC metadata flag `source: "agent" | "ui"`).
- Regression test: model supplies a fake `workspace_root` in tool args → confirm it is ignored.

---

### 3.4 Shell/grep argument construction (P1)

**Problem:**
Unclear whether `run_shell` and grep spawn via argv arrays or shell string interpolation. Paths and patterns can contain metacharacters.

**Proposed fix:**

- Audit `commands.rs`: grep must spawn `rg` with an argument vector, never a concatenated shell string.
- `run_shell` is intentionally arbitrary shell — confirm `cwd` scoping is not injectable when constructing the process spawn.

---

### 3.5 "Undo last turn" reversibility gap (P2)

**Problem:**
Git checkpoint undo covers tracked/untracked file state, but `run_shell` in the same turn may have side effects undo cannot touch: network calls, `npm install`, processes left running, writes outside the workspace.

**Proposed fix (disclosure only):**

- When a turn included `run_shell` / `run_script`, change "↩ Undo last turn" tooltip to: "Restores file changes — shell effects (installed packages, network calls) are not undone."

**Files:** `ChatPane.svelte` (undo button), [11-git.md](11-git.md) cross-link.

---

## 4. Track C — Capability Expansion

Ordered by leverage (risk reduction + product value), not strictly by effort.

### 4.1 Patch-style edit tool (P1)

**Problem:** `write_file` / `create_file` are whole-file operations — token-expensive and risky on large files.

**Proposal:** Add `str_replace` (or `apply_patch`):

- Args: `path`, `old_str` (must match exactly once), `new_str`
- Fail loudly if `old_str` is missing or ambiguous — forces re-read of current file state
- Keep `write_file` for new files and full rewrites

**Files:** `toolDefinitions.ts`, `toolRunner.ts`, `filesystem.rs` (optional dedicated command), [09-tool-system.md](09-tool-system.md).

---

### 4.2 Preview screenshot / DOM inspection tool (P2)

**Problem:** Agent writes frontend code but cannot see rendered output unless the user describes it.

**Proposal:** `capture_preview_screenshot` and/or `get_console_errors` tool returning image/text from the preview iframe.

**Dependency:** Build **after** §2.4 iframe sandboxing work.

---

### 4.3 LSP go-to-definition / rename (P2 — bump priority)

**Problem:** Multi-file refactors rely on `grep` (string match, not symbol-aware).

**Proposal:** Prioritize [25-lsp-diagnostics.md](25-lsp-diagnostics.md) Phase 2 (go-to-def, rename). Compounds with §4.1 patch tool.

---

### 4.4 Structured dependency-install tool (P2)

**Problem:** `npm install <pkg>` routes through generic `run_shell` with raw command approval UI.

**Proposal:** Dedicated `install_dependency` tool with purpose-built approval UI (package, version, registry); typosquat heuristic optional; fallback to `run_shell` for edge cases.

---

### 4.5 Per-session cost ceiling (P2)

**Problem:** `agentLimits` caps steps/tool calls but not dollar spend on metered cloud providers (Anthropic, DeepSeek, GLM, Kimi).

**Proposal:** Optional spend ceiling per session/day using `providerUsage` token totals + known pricing tables; hard stop with clear notice.

---

### 4.6 Adversarial fixtures in the eval harness (P1)

**Problem:** [31-llm-eval-harness.md](31-llm-eval-harness.md) does not exercise prompt-injection scenarios.

**Proposal:** Add fixtures for:

- Hidden instructions in fetched web content
- `.sidebar/tools.json` / skills attempting policy escalation (validates §2.2)
- Injected instructions inside `read_file` output ("ignore previous instructions…")

**Files:** `tests/llm/fixtures/adversarial/`, harness runner updates.

---

### 4.7 Web access toggle + status bar globe indicator (P1)

**Problem:** Users cannot tell at a glance whether the agent can reach the network. The `web_fetch` allowlist in Settings is easy to misread as a hard security boundary (see §3.1). There is no quick session-level way to disable web tools without opening Settings.

**Proposal:** Add a **web access** toggle with a visible status-bar indicator.

#### Behavior

| State | Agent effect |
|-------|----------------|
| **Web access ON** | `web_fetch` follows normal effective tool policy (`allow` / `ask` / `deny`). Future `web_search` tool (if added) is gated the same way. |
| **Web access OFF** | `web_fetch` (and future web tools) treated as **`deny`** regardless of global/project policy — strictest-wins overlay. Tool schema excludes network tools from the model's tool list. |

Default for **new chat sessions:** `off` (aligns with Track A trust posture). Optional global default in Settings → Tools ("Enable web access for new sessions").

Persist per-session in `.sidebar/state.json` (`sessions[].webAccessEnabled`) so reopening a workspace restores the last choice per tab.

#### UI — status bar globe icon

**Placement:** In `StatusBar.svelte`, inside the **Explorer panels** toolbar (`aria-label="Explorer panels"`), immediately **to the right of the Git button** — after the `{#each EXPLORER_PANEL_TABS}` loop, not as a fourth explorer tab.

```
[ Explorer ] [ Search ] [ Git ] [ 🌐 ]   ← globe is separate from panel tabs
```

**Visual design:**

| Property | Detail |
|----------|--------|
| Icon | Phosphor `Globe` (or `GlobeSimple`) at 16px — match `workbench-icon-btn` sizing of adjacent explorer tabs |
| ON state | `class:active` — full opacity, optional subtle accent (e.g. `--syntax-string` or workbench accent) |
| OFF state | Dimmed via existing `AppIcon` `dimmed` pattern or ~45% opacity |
| Tooltip (ON) | "Web access enabled — agent can fetch URLs" |
| Tooltip (OFF) | "Web access disabled — click to allow web_fetch for this session" |
| Click | Toggle `webAccessEnabled` for the **active chat session** |
| Keyboard | Optional: none in v1 (avoid shortcut conflicts) |

**Interaction with §3.1:** When web access is OFF, the globe being dimmed is the primary signal that network tools are disabled — independent of the hostname allowlist in Settings.

#### Implementation sketch

```typescript
// src/lib/stores/chat.ts — extend ChatSession
webAccessEnabled: boolean; // default false

// src/lib/tools/getToolsForPolicy.ts (or ChatPane tool assembly)
function effectiveToolsForSession(policy, modeTools, webAccessEnabled) {
  let tools = getToolsForPolicy(policy, modeTools);
  if (!webAccessEnabled) {
    tools = tools.filter(t => t.name !== "web_fetch" /* + future web_search */);
  }
  return tools;
}
```

**Files:** `StatusBar.svelte`, `WorkbenchShell.svelte` (wire toggle callback), `src/lib/stores/chat.ts`, `ChatPane.svelte` (tool list assembly), `projectState.ts` (persist), `tests/unit/webAccessToggle.test.ts`.

**Acceptance criteria:**

- [ ] Globe appears to the right of Git in the status bar explorer group
- [ ] Dimmed when web access off; lit when on
- [ ] Toggle updates active session only; other chat tabs retain their own state
- [ ] With web access off, agent turn does not include `web_fetch` in tool schema
- [ ] Setting persists across app restart via `state.json`
- [ ] Tooltip text matches ON/OFF state

---

## 5. Prioritized Roadmap

| Priority | Item | Track | Target |
|----------|------|-------|--------|
| **P0** | Workspace Trust gate | §2.1 | v0.1.6 trust release |
| **P0** | Tool policy: narrow-only project overrides | §2.2 | v0.1.6 |
| **P0** | Honest scoping of `web_fetch` allowlist vs `run_shell` | §3.1 | v0.1.6 |
| **P0** | Non-optional `workspace_root` on agent tool calls (audit + test) | §3.3 | v0.1.6 |
| **P1** | Web access toggle + globe status indicator | §4.7 | v0.1.6 or v0.1.7 |
| **P1** | Remove/gate dead `secrets.rs` IPC surface | §2.3 | v0.1.6 |
| **P1** | Audit chat-render + preview-iframe XSS→invoke path | §2.4 | v0.1.6 |
| **P1** | SSRF/DNS-rebinding check on `web_fetch` | §3.2 | v0.1.7 |
| **P1** | Shell/grep argv construction audit | §3.4 | v0.1.7 |
| **P1** | Patch-style edit tool (`str_replace`) | §4.1 | v0.1.7 |
| **P1** | Prompt-injection fixtures in eval harness | §4.6 | v0.1.7 |
| **P2** | API key storage re-evaluation (keychain vs settings) | §2.5 | Backlog |
| **P2** | "Undo last turn" reversibility disclosure | §3.5 | Backlog |
| **P2** | Preview screenshot / console tool | §4.2 | Backlog |
| **P2** | Bump LSP go-to-def/rename priority | §4.3 | Backlog |
| **P2** | Structured dependency-install tool | §4.4 | Backlog |
| **P2** | Per-session cost ceiling | §4.5 | Backlog |

**Suggested sequencing:**

1. **v0.1.6 — Trust boundary:** All P0 items + §4.7 globe toggle + §2.2 fix (confirmed bug) + §2.3 IPC cleanup.
2. **v0.1.7 — Hardening + leverage:** P1 enforcement audits, `str_replace`, adversarial eval fixtures.
3. **Backlog:** P2 capability and disclosure items.

---

## 6. Open Questions & Codebase Notes

### 6.1 Questions for the team

1. ~~Is `.sidebar/tools.json` capable of widening policy?~~ **Yes** — see §2.2 confirmation.
2. ~~Preview pane architecture?~~ **`<iframe>` in main webview**, no sandbox — see §2.4.
3. ~~Is `workspace_root` ever from model args?~~ **Not in toolRunner today** — audit still required — see §3.3.
4. ~~Why API keys moved back to settings in v0.1.5?~~ **OS keychain permission prompts** — see §2.5 / [14-security.md](14-security.md).
5. **Team appetite for §3.1 Option B** (real shell network sandbox) vs Option A (honest UX) — Option B is a significantly larger lift.

### 6.2 Additional open questions

- Trust store: per-machine only, or team-exportable signed manifest?
- Restricted mode: block restoring prior agent sessions that assumed full trust?
- Globe toggle: should OFF also block `web_fetch` at the Rust IPC layer (defense in depth), or UI/schema removal only?
- Future `web_search` tool: same toggle as `web_fetch`, or separate permission?

### 6.3 Documentation updates (when implementing)

| Doc | Update |
|-----|--------|
| [14-security.md](14-security.md) | Workspace trust, web access toggle, SSRF checks |
| [09-tool-system.md](09-tool-system.md) | `str_replace`, web_fetch honest scoping, narrow-only project policy |
| [07-workspace.md](07-workspace.md) | Trust states, restricted mode |
| [06-state-management.md](06-state-management.md) | `trustedWorkspaces`, `webAccessEnabled` on sessions |
| [05-workbench.md](05-workbench.md) | Globe icon in status bar |
| [17-roadmap.md](17-roadmap.md) | v0.1.6 trust release |
| [README.md](../../README.md) | One paragraph on workspace trust |

---

*This plan is a starting point for scoping — each P0/P1 item should get its own short design note before implementation. Spec created: 2026-07-10.*
