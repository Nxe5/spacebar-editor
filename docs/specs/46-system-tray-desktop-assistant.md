# Spec 46 — System Tray & Desktop Assistant

> **Status:** 📋 **Proposed — design draft, not scheduled.** Explores turning Spacebar Editor into a persistent, tray-resident desktop assistant that can act on the wider system (not just the open workspace).
> **Version:** 0.1 — 2026-07-13
> **Area:** App lifecycle · Windowing · Tools · Security · Trust · Agent UX
> **Depends on:** [03-architecture.md](03-architecture.md) · [04-entry-points.md](04-entry-points.md) · [09-tool-system.md](09-tool-system.md) · [14-security.md](14-security.md) · [33-rust-path-enforcement.md](33-rust-path-enforcement.md) · [45-security-hardening-and-capability-expansion.md](45-security-hardening-and-capability-expansion.md)
> **Companion docs:** [OVERVIEW.md](../overview/OVERVIEW.md) · [17-roadmap.md](17-roadmap.md)

---

## Table of Contents

1. [Motivation](#1-motivation)
2. [Product Shape](#2-product-shape)
3. [Tauri Capabilities Required](#3-tauri-capabilities-required)
4. [Window & Lifecycle Model](#4-window--lifecycle-model)
5. [Assistant Surface (Quick Ask)](#5-assistant-surface-quick-ask)
6. [System-Scope Tools](#6-system-scope-tools)
7. [Security & Trust Model](#7-security--trust-model)
8. [Architecture Changes](#8-architecture-changes)
9. [Settings](#9-settings)
10. [Phased Rollout](#10-phased-rollout)
11. [Open Questions](#11-open-questions)
12. [Files to Change](#12-files-to-change)

---

## 1. Motivation

Today Spacebar Editor is a **project-scoped IDE**: it launches to a workspace, and every agent tool is bound to that workspace root by a two-layer sandbox ([33-rust-path-enforcement.md](33-rust-path-enforcement.md)). When the last window closes, the process exits (`main.rs` releases the workspace lock and stops LSP on `CloseRequested`).

The goal of this spec is a second, complementary mode: **a always-available desktop assistant** that

- lives in the **system tray / menu bar** and keeps running when all editor windows are closed,
- can be **summoned by a global hotkey** for a quick question or action without opening a full workspace, and
- can, *with explicit and revocable consent*, **act on the wider system** — files outside a workspace, running processes, clipboard, shell tasks, app automation — as a general assistant rather than only a code editor.

This is a significant expansion of the trust boundary. The current model assumes "opening a folder is the unit of trust." A system assistant has **no folder** to scope to, so §7 defines a new, stricter consent model. **Nothing in this spec should ship before the [Spec 45](45-security-hardening-and-capability-expansion.md) P0 trust-boundary items land** — the system-scope surface only makes those gaps more dangerous.

---

## 2. Product Shape

Two coexisting modes over one binary:

| Mode | Entry | Scope | Tools |
|------|-------|-------|-------|
| **Editor** (today) | `spacebar <dir>`, Welcome screen, dock/app icon | One workspace folder | Workspace-sandboxed tools (17 built-ins) |
| **Assistant** (new) | Tray icon, global hotkey, launch-at-login | System / user-selected roots | Workspace tools **+** opt-in system-scope tools (§6) |

The assistant is not a separate app: it reuses the same agent loop (`ChatPane` / `streamTurn.ts`), providers, skills, and settings. It differs in **what it is allowed to touch** and **how it is presented** (a compact "Quick Ask" surface, §5, rather than the full workbench).

Non-goals for the first iterations:

- Voice input / wake-word.
- OS-level accessibility automation (clicking arbitrary app UIs). Deferred; high risk.
- Multi-user / remote control.

---

## 3. Tauri Capabilities Required

Current setup (`src-tauri/`): Tauri 2, single `main` window with `decorations: false`, `tauri-plugin-shell` only, `panic = "abort"` release profile. The following are **not yet present** and would be added:

| Capability | Plugin / API | Notes |
|------------|--------------|-------|
| Tray icon + menu | `tauri::tray::TrayIconBuilder` (core in Tauri 2) | No extra crate; needs a tray icon asset and a menu (`Show`, `Quick Ask`, `Settings`, `Quit`) |
| Run without windows | `tauri::Builder` + hide-on-close | Prevent process exit when the last window closes; keep the tray alive |
| Global hotkey | `tauri-plugin-global-shortcut` | Summon Quick Ask (default e.g. `Cmd/Ctrl+Shift+Space`); user-rebindable via [37-shortcut-rebinding.md](37-shortcut-rebinding.md) |
| Launch at login | `tauri-plugin-autostart` | Opt-in in Settings; off by default |
| Single instance | `tauri-plugin-single-instance` | A second `spacebar` launch focuses/forwards to the running tray process instead of spawning a duplicate |
| Notifications (optional) | `tauri-plugin-notification` | Surface completed background tasks / approvals when window hidden |

macOS specifics: to behave as a menu-bar agent (no persistent Dock icon while backgrounded) set `ActivationPolicy::Accessory` when no windows are visible, and flip back to `Regular` when a window is shown. Each new plugin requires matching **capability permissions** under `src-tauri/capabilities/`.

---

## 4. Window & Lifecycle Model

### 4.1 Close-to-tray

Change the `CloseRequested` handler in `main.rs`:

- **Assistant enabled:** intercept close, **hide** the window instead of exiting; keep the tray icon and process alive. Continue to release the *workspace* lock and stop *workspace* LSP for that window, but do not tear down the app.
- **Assistant disabled (today's behavior):** exit as now.

The app quits only via the tray **Quit** item, `Cmd/Ctrl+Q`, or OS logout.

### 4.2 Tray menu

```
Spacebar
├── Quick Ask…            ⌘⇧Space
├── Open Editor…          (folder picker → editor mode)
├── Recent ▸              (recent projects, from get_recent_projects)
├── ───────────
├── Assistant: On/Off     (toggle system-scope availability)
├── Settings…
└── Quit
```

### 4.3 Window reuse

Reuse the single `main` webview where possible: showing Quick Ask toggles a **route/layout** (like `layoutOverride` / `MICRO_EDITOR_LAYOUT` from [36](36-first-run-onboarding.md)) rather than spawning a heavy second window. A dedicated small always-on-top `assistant` window is an option if reusing `main` proves awkward; decide during Phase 1 (§11).

### 4.4 Multiple states to persist

- Whether assistant mode is enabled, launch-at-login, and the global hotkey.
- The assistant conversation is its own chat session (no workspace) persisted outside any `.sidebar/` folder — see §8/§9.

---

## 5. Assistant Surface (Quick Ask)

A compact palette shown when summoned by hotkey or tray:

- Small centered/anchored window (or `main` collapsed to a `MICRO_EDITOR_LAYOUT`-style chrome-free view): a single input, streaming response area, and an inline tool-approval strip reusing `ChatPane`'s existing approval UI + **file edit preview** ([09-tool-system.md](09-tool-system.md)).
- `Esc` hides; it does not quit.
- Defaults to a **read-only / no-system-write** posture until the user escalates (§7).
- Can "graduate" a conversation into a full editor window ("Open in editor") when the task turns into real project work.

Reuses the agent loop unchanged; only the tool set and presentation differ.

---

## 6. System-Scope Tools

To be an assistant that "can modify my system," the workspace-only tool set must be extended with a **new capability tier**. These are **off by default**, gated by §7, and never available in plain editor mode without explicit escalation.

| Tool (proposed) | Capability | Risk | Default |
|-----------------|-----------|------|---------|
| `system_read_file` / `system_list_dir` | Read files/dirs outside any workspace, within granted roots | Medium | deny |
| `system_write_file` / `system_str_replace` | Write files outside a workspace, within granted roots | High | deny |
| `system_run_command` | Run a shell command with the user's environment, arbitrary `cwd` | **Critical** | deny (per-call approval always) |
| `open_path` / `reveal_in_os` | Open a file/URL/app via `tauri-plugin-shell` `open` | Low | ask |
| `read_clipboard` / `write_clipboard` | Clipboard access (`tauri-plugin-clipboard-manager`) | Medium | ask |
| `list_processes` / `signal_process` | Inspect / terminate processes | High | deny |
| `system_notify` | Post an OS notification | Low | allow |

Design rules:

- **Distinct names from workspace tools.** System tools are a separate namespace (`system_*`) so a workspace tool can never silently gain system reach, and so policy/audit treat them differently.
- **Granted roots, not "the whole disk."** `system_*` file tools operate only inside an explicit, user-granted allowlist of directories (§7.2), re-using the Rust `canonicalize_workspace_path` pattern but against each granted root instead of a single workspace.
- **`system_run_command` always asks**, always shows the exact argv + `cwd`, and is never auto-allowed by pattern rules ([40](40-product-hardening-and-agent-ux.md) §6 scope rules do **not** apply to system scope).
- **Dry-run first** where feasible (e.g. system writes show the §5 edit preview; destructive process signals show target + name before sending).

---

## 7. Security & Trust Model

This is the core of the spec. A general system assistant deliberately breaks the "everything is workspace-bound" invariant, so it needs its own, stricter consent layer that composes with — never replaces — the existing policy gates.

### 7.1 Capability tiers

| Tier | What it can touch | Consent |
|------|-------------------|---------|
| **Chat** | Nothing (conversation only) | None |
| **Workspace** (today) | The open folder, via sandboxed tools | Open folder (+ Spec 45 trust gate) |
| **System (granted roots)** | Only directories the user explicitly grants | Per-root grant + per-tool policy |
| **System (command)** | Shell with user env | Per-call approval, no exceptions |

Escalation is always **user-initiated and revocable**; the model can *request* a tier but cannot grant it.

### 7.2 Granted-roots model

- Maintain a global, **out-of-workspace** allowlist (e.g. `sidebar.systemRoots.v1` in `localStorage`, keyed by canonicalized absolute path) of directories the assistant may read/write.
- Adding a root is an explicit action (folder picker) with a clear scope label (read-only vs read-write).
- Rust `system_*` FS commands enforce membership by canonicalizing the target and checking it is within a granted root (same symlink-resolving approach as [33](33-rust-path-enforcement.md)); fail closed if no root matches.
- Never auto-grant a root from model output. The `root` argument comes from app state, never from tool-call args (mirror [45](45-security-hardening-and-capability-expansion.md) §3.3).

### 7.3 Standing safeguards

- **Global "Assistant: system access" master switch** (tray + Settings). Off ⇒ all `system_*` tools removed from the schema entirely, independent of policy.
- **Session-scoped by default:** system access resets to off for each new assistant session unless the user pins a root as persistent.
- **Audit log** of every `system_*` invocation (tool, args, root, decision, timestamp) viewable in Settings; append-only for the session, optionally persisted.
- **Deny-list of sensitive paths** even inside granted roots (e.g. `~/.ssh`, keychains, browser profiles, `.sidebar` API-key blob) — refuse or require an extra confirmation.
- **No secret exfiltration path:** `system_*` reads must not become an easy way to read API keys / credentials and forward them via `web_fetch` — pair with [45](45-security-hardening-and-capability-expansion.md) §3.1 (honest `web_fetch` scoping) and the web-access globe (§4.7 there).
- **Undo caveat disclosure:** the "Undo last turn" git checkpoint ([11-git.md](11-git.md)) covers only workspace git state; system writes and `system_run_command` effects are **not** reversible — the UI must say so.

### 7.4 Threat notes

Backgrounded + global-hotkey + system-scope is a materially larger attack surface than an editor:

- A hostile skill/prompt now targets the *machine*, not just a repo — reinforces the need for Spec 45 §2.1 workspace trust and §2.2 narrow-only policy first.
- Single-instance + autostart means a compromised assistant persists across reboots — autostart stays opt-in and clearly indicated.
- XSS→invoke pivots ([45](45-security-hardening-and-capability-expansion.md) §2.4) become system-level; sanitized rendering is a hard prerequisite.

---

## 8. Architecture Changes

Reuses the existing two-tier runtime ([03-architecture.md](03-architecture.md)); additions only.

### 8.1 Rust (`src-tauri/`)

- New module `tray.rs`: build tray icon + menu, wire menu events to show/hide/quit and to emit events into the webview.
- New module `system_tools.rs`: `system_*` command handlers with granted-root canonicalization; **must** be separate from workspace `filesystem.rs` so their enforcement path is auditable in isolation.
- `main.rs`: register global-shortcut, autostart, single-instance, (optional) notification/clipboard plugins; change `CloseRequested` to hide-to-tray when assistant mode is on; manage macOS activation policy.
- `capabilities/`: new permission set scoping each plugin and the `system_*` commands.

### 8.2 Frontend (`src/`)

- `src/lib/assistant/` — assistant session store (workspace-less chat), Quick Ask layout override, escalation state machine (§7.1).
- `src/lib/tools/` — register `system_*` tool definitions and handlers behind a capability flag; extend `toolPolicy.ts` with a system-scope default map (all `deny`/`ask`, none `allow`).
- `src/lib/systemRoots.ts` — granted-roots store + IPC to add/remove/list roots.
- `ChatPane.svelte` — reuse for Quick Ask; surface the capability-tier badge and audit affordance.
- `StatusBar` / tray — master switch + indicator (compose with the Spec 45 §4.7 web-access globe pattern).

---

## 9. Settings

New **Settings → Assistant** section:

- Enable assistant / run in tray (master).
- Launch at login (autostart) — off by default.
- Global hotkey binding (via [37-shortcut-rebinding.md](37-shortcut-rebinding.md)).
- System access master switch + granted-roots manager (add/remove, read-only vs read-write).
- Per-`system_*`-tool policy (defaults deny/ask).
- Audit log viewer + "reset system access on new session" toggle.

Persistence keys (proposed): `sidebar.assistant.v1` (mode/hotkey/autostart), `sidebar.systemRoots.v1` (granted roots), and system-tool rules folded into the tool-policy store as a distinct namespace.

---

## 10. Phased Rollout

| Phase | Scope | Gate |
|-------|-------|------|
| **0 — Prereqs** | Spec 45 P0 trust items shipped (workspace trust, narrow-only policy, `workspace_root` audit, honest `web_fetch`) | Blocks everything below |
| **1 — Tray & lifecycle** | Tray icon + menu, close-to-tray, single-instance, quit; **no system tools** | Reuses existing tools only |
| **2 — Quick Ask** | Global hotkey summon, compact assistant surface, workspace-less chat session | Read/chat only |
| **3 — Granted-roots reads** | `system_read_file` / `system_list_dir` within granted roots; audit log | Master switch + per-root grant |
| **4 — Guarded system writes** | `system_write_file` / `system_str_replace` with edit preview; `open_path`, clipboard | Per-tool ask + previews |
| **5 — Command & process (opt-in)** | `system_run_command` (always-ask), process tools | Explicit, heavily gated |

Each phase is independently shippable and reversible via the master switch.

---

## 11. Open Questions

- **Window strategy:** reuse `main` with a layout override, or a dedicated always-on-top `assistant` window? (Affects focus, screen placement, and macOS activation policy.)
- **Session storage:** where does the workspace-less assistant transcript live — a global app-data path, and how does compaction/history apply?
- **Granted-root granularity:** per-directory only, or also per-file grants and time-boxed ("allow for this session") grants?
- **Command sandboxing:** is `system_run_command` acceptable as raw shell with per-call approval, or must it be constrained (allowlist of executables, no network) before shipping?
- **Cross-platform tray parity:** menu-bar (macOS) vs system tray (Windows/Linux/Wayland) differences, especially icon theming and activation policy.
- **Notifications:** required for background task completion, or defer to Phase 5+?
- **Relationship to Spec 45 §4.7 globe:** one unified "capabilities" indicator (web + system) or separate controls?

---

## 12. Files to Change (initial estimate)

| File | Change |
|------|--------|
| `src-tauri/src/main.rs` | Register tray, global-shortcut, autostart, single-instance plugins; hide-to-tray on close; macOS activation policy |
| `src-tauri/src/modules/tray.rs` | **New** — tray icon + menu + event wiring |
| `src-tauri/src/modules/system_tools.rs` | **New** — `system_*` handlers with granted-root enforcement |
| `src-tauri/capabilities/` | New permission sets for plugins + system commands |
| `src-tauri/Cargo.toml` | Add `tauri-plugin-global-shortcut`, `-autostart`, `-single-instance` (+ optional `-notification`, `-clipboard-manager`) |
| `src-tauri/tauri.conf.json` | Tray config, plugin config, (optional) `assistant` window |
| `src/lib/assistant/*` | **New** — assistant session store, Quick Ask layout, escalation state |
| `src/lib/systemRoots.ts` | **New** — granted-roots store + IPC |
| `src/lib/tools/toolDefinitions.ts`, `toolRunner.ts`, `toolPolicy.ts` | `system_*` tool namespace + system-scope policy defaults |
| `src/modules/agent/ChatPane.svelte` | Quick Ask reuse, capability-tier badge, audit affordance |
| `src/modules/settings/` | **New** Assistant settings section |
| `tests/unit/systemRoots.test.ts`, `tests/unit/systemTools.test.ts` | Granted-root enforcement + policy tests |

---

*This is a design draft for scoping. Each phase should get its own short design note and a dedicated security review before implementation, and no system-scope phase should land before the Spec 45 P0 trust boundary is in place. Spec created: 2026-07-13.*
