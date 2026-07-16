# Spec 50 — Editor Scroll Shift on Explorer Folder Expand

> **Status:** ✅ **Implemented**
> **Area:** Workbench layout · Explorer · Editor
> **Related:** `src/modules/workbench/WorkbenchShell.svelte` · `src/modules/workbench/CenterWorkbench.svelte`

---

## 1. Problem

Expanding a folder in the explorer sometimes makes the **editor area shift/scroll by a few pixels**. Nothing in the editor changed; the shift persists (there is no scrollbar the user can drag to undo it).

## 2. Root Cause

The workbench's fixed panes (`workbench-root`, `workbench-body`, `center-column`, `center-workbench-stack`, `center-workbench`) used `overflow: hidden`. **`overflow: hidden` boxes are still scrollable** — programmatic `scrollTop` and, critically, WebKit's *scroll-focused-element-into-view* behavior can scroll them. Clicking a file-tree row focuses a `<button>`; when that button sits close to a pane edge, WKWebView nudges the scroll offset of ancestor boxes — including the shared ancestors of the sidebar **and** the editor — to reveal it. Because these boxes render no scrollbar, the offset silently sticks, appearing as the editor "slightly scrolling."

The expanding-children layout change makes the focused row's geometry cross the pane edge, which is why the nudge correlates with expanding folders.

## 3. Fix

Replace `overflow-hidden` with **`overflow-clip`** on the workbench's fixed panes. `overflow: clip` clips like `hidden` but **forbids all scrolling of the box** — programmatic and UA-initiated — so no focus-reveal can displace fixed chrome. Supported by WKWebView (Safari ≥ 16) and WebKitGTK on all shipping targets.

Changed boxes:

| Box | File |
|-----|------|
| `workbench-root`, `workbench-body`, `center-column`, `center-workbench-stack` | `WorkbenchShell.svelte` |
| `center-workbench`, `center-workbench__main` | `CenterWorkbench.svelte` |

Intentional scroll containers (file tree `overflow-y: auto`, editor `.cm-scroller`, chat `.messages`, terminal viewport) are untouched.

## 4. Acceptance

- Expand/collapse deeply nested folders repeatedly, with the tree scrolled to various offsets: editor content never shifts.
- Editor, chat, terminal, and tree scrolling all still work.
- Keyboard-focus traversal (Tab) does not displace fixed panes.

## 5. Notes

If any future pane needs programmatic scrolling (e.g. scroll-into-view of a revealed file-tree row), scroll the *intended* container explicitly rather than reverting these boxes to `hidden`.
