# Spec 47 — Universal Project Hub, Notes & Boards

> **Status:** 📋 **Proposed — design draft, not scheduled.** Turns Spacebar Editor into a Raycast-style organizer for *every* project you have — code, KiCad, Fusion 360, physical builds, notes — not just git repos, plus lightweight kanban boards for planning work that has no code to show.
> **Version:** 0.1 — 2026-07-13
> **Area:** New surface (Hub window) · Data layer (SQLite) · Command palette · Notes · Task boards
> **Depends on:** [46-system-tray-desktop-assistant.md](46-system-tray-desktop-assistant.md) for tray/global-hotkey plumbing only — **does not** require any of Spec 46's `system_*` write tools or its trust escalation model. This spec is lower-risk (local index + launching, no OS mutation) and can ship independently of, and before, Spec 46's later phases.
> **Companion docs:** [OVERVIEW.md](../overview/OVERVIEW.md) · [36-first-run-onboarding.md](36-first-run-onboarding.md) · [06-state-management.md](06-state-management.md) · [07-workspace.md](07-workspace.md)

---

## Table of Contents

1. [Motivation](#1-motivation)
2. [Product Shape](#2-product-shape)
3. [Project Registry](#3-project-registry)
4. [Notes Vault](#4-notes-vault)
5. [Boards (Kanban)](#5-boards-kanban)
6. [Command Palette](#6-command-palette)
7. [Hub Window](#7-hub-window)
8. [Data Layer](#8-data-layer)
9. [Architecture Changes](#9-architecture-changes)
10. [Settings](#10-settings)
11. [Phased Rollout](#11-phased-rollout)
12. [Open Questions](#12-open-questions)
13. [Files to Change](#13-files-to-change)

---

## 1. Motivation

Spacebar Editor today only understands one kind of "project": a folder you open as a workspace, generally a git repo. Real work spans more than code — KiCad boards, Fusion 360 assemblies, physical builds, and the notes/ideas/scheduling that glue them together. None of that fits the current model, and forcing it to (e.g. writing `.sidebar/`-style metadata into a KiCad or cloud-synced Fusion folder) risks confusing those tools' own file/sync expectations.

The concrete answer that came out of scoping this: **don't try to index or touch KiCad/Fusion project files at all.** Track those projects as lightweight records — a name, tags, optional links — and give them the same first-class **kanban board** (ideas, backlog, scheduling) that a hardware or any non-code project actually needs day to day. Code repos keep their existing `.sidebar/`-based richness; everything else gets a board.

This is deliberately a **separate, mostly product-level feature** — it can be described and evaluated independently of "is this a better IDE."

---

## 2. Product Shape

| Layer | What it is | Storage |
|-------|-----------|---------|
| **Project registry** | A cross-kind list of everything you're tracking: code repos (existing), and lightweight records for KiCad/Fusion/hardware/other projects | SQLite (§8) |
| **Notes vault** | One global markdown vault for quick capture, daily notes, and per-project notes, tagged rather than siloed | Plain `.md` files on disk (user-chosen root) + SQLite full-text index |
| **Boards** | A kanban board per project (or standalone) for ideas/backlog/scheduling — the primary tool for KiCad/Fusion/hardware projects since there's no code to browse | SQLite |
| **Command palette** | Raycast-style hotkey-summoned search over projects, notes, boards, and actions | In-memory, backed by the registry |
| **Hub window** | A dedicated lightweight window presenting all of the above; can also render as a compact floating palette | New Svelte entry point |

Code projects are unaffected: opening one from the Hub still launches the full workbench exactly as today. Everything new here is additive.

---

## 3. Project Registry

### 3.1 Project kinds

```typescript
type ProjectKind = "code" | "kicad" | "hardware" | "notes" | "other";
```

| Kind | How it's created | Local file access |
|------|-------------------|--------------------|
| `code` | Auto-detected by scanning configured root directories for `.git` (existing workspace-open logic reused) | Full — opens the real workbench |
| `kicad` | Auto-detected via `*.kicad_pro` in a scanned root | **Metadata only** — parse the `.kicad_pro` JSON for a title on first detection, then treat like `hardware` (no ongoing file sync); "Open in KiCad" via `open_path` |
| `hardware` | **Manual, created from the Hub** — this is the Fusion 360 / physical-build case. No local folder is required. Optional fields: a link (Fusion cloud URL, datasheet, etc.) and an optional local folder (for exports/BOMs) that is only ever *opened*, never indexed | None required — the board is the primary surface |
| `notes` | A project that is really just a note or note collection promoted to a project (e.g. "Homelab notes") | None — lives entirely in the vault |
| `other` | Manual catch-all | Optional link/folder, same as `hardware` |

**Key simplification from `hardware`:** no attempt to detect or read Fusion 360's local cache, sync folder, or any proprietary file format. The registry only ever stores what the user types in — title, tags, optional link, optional folder to *open* (via the OS, not read by Spacebar). This avoids all of the fragility that a "local Fusion detection" approach would have.

### 3.2 Registry record (conceptual)

| Field | Notes |
|-------|-------|
| `id` | UUID |
| `kind` | `ProjectKind` |
| `title` | Display name |
| `path` | Canonicalized path, **only for `code`/`kicad`** (nullable otherwise) |
| `link` | Optional URL (Fusion cloud link, datasheet, etc.) |
| `tags` | `string[]` |
| `pinned` | boolean |
| `lastOpenedAt` | timestamp — feeds frecency ranking (§6) |
| `boardId` | FK → the project's default board, created lazily on first card |

### 3.3 Relationship to `.sidebar/`

Code projects remain fully governed by today's `.sidebar/` mechanism (prompts, skills, chat/session state — see [06-state-management.md](06-state-management.md)). The registry stores **only a cross-reference** for code projects (path, `kind: "code"`, tags, pinned, last-opened) so the Hub can list/search them — it never duplicates or shadows `.sidebar/state.json`. There is exactly one source of truth per concern: `.sidebar/` for a code project's agent state, the registry for cross-project discovery.

### 3.4 Scanning

`hub_scan_roots(roots: string[])` (Rust) walks user-configured root directories (e.g. `~/Projects`, `~/Hardware`) up to a bounded depth, looking only for `.git` and `*.kicad_pro` markers (reusing patterns from `find_files`/`list_dir_tree` in `filesystem.rs`), and upserts `code`/`kicad` registry rows. `hardware`/`notes`/`other` rows are never produced by scanning — always manual.

---

## 4. Notes Vault

Per the single-vault decision: **one global markdown vault**, root configurable in Settings → Hub (default e.g. `~/SpacebarNotes/`).

- **Quick capture** — a command-palette action that creates or appends to a timestamped note in one keystroke, closing the palette immediately after (the Raycast "quick note" pattern).
- **Daily note** — optional auto-created `YYYY-MM-DD.md`, surfaced as a palette shortcut.
- **Project tagging, not folders** — a note is linked to a project via an inline tag or frontmatter field (e.g. `project: <id>` or `#project/preamp-v2`), not by physical location. This means one note can reference multiple projects, and a project's "notes" view is just a filtered query, not a folder listing.
- **Editing** — reuses the existing CodeMirror markdown mode (`src/lib/editor/`) inside the Hub window; no new editor component needed.
- **Search** — SQLite FTS5 index over note content (§8), re-indexed on save and via the existing filesystem watcher pattern (`watcher.rs`) if notes are edited externally.
- **No Obsidian-vault compatibility work in v1** — plain markdown files with simple frontmatter are already broadly compatible with other tools by construction; a dedicated Obsidian-format shim (`.obsidian/` config, wikilinks) is explicitly deferred, not designed against now.

---

## 5. Boards (Kanban)

This is the direct answer to "help organize ideas/scheduling" for projects with no files to browse — the primary UI surface for `hardware`, `kicad`, and `other` kinds, and optionally usable for `code` projects too.

### 5.1 Model

```
Board
 ├─ Columns[]      (ordered; default: Idea · Backlog · In Progress · Blocked · Done)
 └─ Cards[]
     ├─ title
     ├─ body (markdown)
     ├─ columnId, position   (drag-reorder)
     ├─ tags[]
     ├─ dueAt?               (optional scheduling)
     └─ linkedNoteIds[]      (optional — attach vault notes to a card)
```

- Every project gets **at most one board**, created lazily the first time a card is added (avoids empty-board clutter in the registry).
- A **standalone "Inbox" board** (not tied to any project) exists for ideas that don't belong anywhere yet — quick capture can target it by default.
- Columns are per-board and editable (add/rename/remove/reorder), seeded from a default template on creation.
- Drag-and-drop reordering — implementable with the existing UI primitives already in the stack (`bits-ui`) rather than a new drag library.

### 5.2 Scheduling / agenda view

A lightweight cross-board **agenda view** — not a calendar app — that lists cards with a `dueAt` grouped as *Overdue / Today / This Week / Later*, aggregated across every board. This gives day-to-day planning ("what am I supposed to be doing across all my projects today") without building a scheduling engine.

---

## 6. Command Palette

Raycast's actual mechanic — a ranked, fuzzy-searchable list, not a menu:

- **Entries:** projects, notes, boards, and "commands" (typed actions — see below), all pulled from the registry/vault/board tables.
- **Frecency ranking:** each entry accumulates a `useCount` + `lastUsedAt`; the palette ranks by a frecency score (recency-weighted frequency) rather than alphabetically or by raw match score alone — this is the detail that makes Raycast/Alfred-style palettes feel "smart" after a few days of use.
- **Built-in commands (v1):**
  - Open project (any kind) → workbench for `code`, board view for others
  - Quick note / daily note
  - New project (kind picker → title/tag/link form; for `code`, optionally scaffold + `git init` via existing agent tools)
  - New card (target board picker, defaults to the focused project's board or Inbox)
  - Open board / agenda view
  - Reveal folder / open link (only for kinds that have one)
- **Not in v1:** arbitrary user-scriptable "extensions" (Raycast's plugin model) or OS-level system actions — those belong to Spec 46's `system_*` tier and its trust model, not here.

---

## 7. Hub Window

Per the separate-window decision: a **new lightweight Tauri window**, `hub.html` → `src/hub-main.ts` → `HubRoot.svelte`, mirroring the existing `settings.html` / `open_settings_window` pattern in `commands.rs` (show-or-create-then-focus). This deliberately avoids loading the CodeMirror/xterm-heavy workbench bundle just to show a palette.

Two presentations of the same window, switched by a mode flag (not two windows):

| Mode | Trigger | Look |
|------|---------|------|
| **Palette** | Global hotkey (reuses Spec 46 §3's `tauri-plugin-global-shortcut`), auto-hides on blur/`Esc` | Small, centered/anchored, just the search input + ranked list |
| **Board** | Tray menu "Open Hub", or "expand" from the palette | Full dashboard: project grid, notes, board/agenda views |

Opening a `code` project's workbench is a **separate concern** — the Hub triggers the existing `main` window/workspace-open flow ([07-workspace.md](07-workspace.md)); it does not try to render the workbench inside itself.

---

## 8. Data Layer

Nothing in today's stack (`localStorage`, per-project JSON under `.sidebar/`) is a good fit for cross-project search, frecency ranking, or kanban card ordering at scale. This spec introduces the first embedded database in the app:

- **`rusqlite`** (bundled SQLite, no system library dependency) as a new `src-tauri` dependency.
- One local DB file in the app data dir (e.g. `$APPDATA/hub.sqlite3`), **not** inside any project folder — consistent with never writing into KiCad/Fusion directories.
- Tables (conceptual): `projects`, `notes_index` (path + FTS5 virtual table over content), `boards`, `columns`, `cards`, `command_usage` (for frecency).
- All Hub IPC commands are plain `#[tauri::command]` functions in a new `hub_db.rs` module, following the existing pattern in `commands.rs` — no new IPC framework needed.
- Migrations: a small hand-rolled `PRAGMA user_version` check + sequential `CREATE TABLE IF NOT EXISTS` blocks is sufficient at this scale; no migration framework needed yet.

---

## 9. Architecture Changes

### 9.1 Rust (`src-tauri/`)

- `src-tauri/src/modules/hub_db.rs` — SQLite connection (behind a `tauri::State`, mirroring `PtyManager`/`WatcherState`), schema init, CRUD commands for projects/notes-index/boards/cards, `hub_scan_roots`.
- `src-tauri/src/modules/commands.rs` — `open_hub_window` command, following `open_settings_window` exactly (show-or-create at `hub.html`, no decorations, palette-sized default).
- `Cargo.toml` — add `rusqlite` (bundled feature).

### 9.2 Frontend (`src/`)

- `hub.html` + `src/hub-main.ts` — new entry point, mirrors `settings.html`/`settings-main.ts`.
- `src/modules/hub/` — `HubRoot.svelte`, `PaletteView.svelte`, `ProjectGrid.svelte`, `KanbanBoard.svelte`, `KanbanCard.svelte`, `AgendaView.svelte`, `NoteQuickCapture.svelte`.
- `src/lib/hub/` — `registry.ts` (store + IPC calls), `commandRegistry.ts` (built-in command list), `frecency.ts` (scoring), `boards.ts`, `notesVault.ts`.
- Reuses existing `src/lib/editor/` (CodeMirror markdown mode) for note editing and card body editing — no new editor.

---

## 10. Settings

New **Settings → Hub** section:

- Notes vault root (folder picker; default `~/SpacebarNotes/`).
- Scan roots for auto-detected `code`/`kicad` projects (add/remove list).
- Global hotkey for the palette (via [37-shortcut-rebinding.md](37-shortcut-rebinding.md), shared with Spec 46's summon binding if both ship).
- Default board column template.
- "Open Hub on launch" vs. tray-only.

---

## 11. Phased Rollout

| Phase | Scope |
|-------|-------|
| **1 — Registry + Hub window (Board mode only)** | SQLite schema, `code`/`kicad` scanning, manual `hardware`/`other` creation, project grid in the Board-mode Hub window. No palette, no notes, no boards yet |
| **2 — Notes vault** | Global vault, quick capture, daily note, FTS5 search, note-to-project tagging |
| **3 — Boards** | Kanban model, drag-reorder, per-project + Inbox boards, agenda view |
| **4 — Command palette** | Frecency-ranked palette mode, global hotkey, built-in commands list |

Each phase is independently useful — Phase 1 alone already replaces "I forget which folder my KiCad project is in."

---

## 12. Open Questions

- Should `code`/`kicad` scan roots overlap with the existing "recent projects" list ([36-first-run-onboarding.md](36-first-run-onboarding.md)), or are they deliberately separate (recent = manually opened; scan roots = auto-discovered)?
- Board template: one global default, or per-kind defaults (e.g. hardware boards seeded with a "Fab order placed" column, code boards seeded differently)?
- Should boards support checklists/subtasks on a card, or stay single-level in v1?
- Multi-device: this is local-only per Spacebar's local-first stance — is there any appetite for a later export/import (e.g. Markdown/JSON dump of boards+notes) for backup, even without sync?
- Should `hardware` project links open via `web_fetch`-style allowlist concerns, or is `open_path` (delegates to the OS/default browser) sufficient and out of scope for network policy entirely?

---

## 13. Files to Change (initial estimate)

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Add `rusqlite` (bundled) |
| `src-tauri/src/modules/hub_db.rs` | **New** — schema, CRUD commands, `hub_scan_roots` |
| `src-tauri/src/modules/commands.rs` | `open_hub_window` (mirrors `open_settings_window`) |
| `src-tauri/src/main.rs` | Register `hub_db` state + new commands |
| `hub.html`, `src/hub-main.ts` | **New** entry point |
| `src/modules/hub/*` | **New** — Hub UI components |
| `src/lib/hub/*` | **New** — registry/board/notes stores, frecency, command registry |
| `src/modules/settings/HubSection.svelte` | **New** — Settings → Hub |
| `tests/unit/hubRegistry.test.ts`, `tests/unit/frecency.test.ts`, `tests/unit/boards.test.ts` | New unit tests |

---

*This is a design draft for scoping. Recommend starting from Phase 1 (registry + Board-mode Hub) since it is the lowest-risk, highest-immediate-value slice and requires no palette/hotkey work yet. Spec created: 2026-07-13.*
