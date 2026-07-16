# Workbench Layout

> **Status:** ✅ **COMPLETE**

Implemented in `src/modules/workbench/WorkbenchShell.svelte`.

---

## Layout Structure

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Title bar: workspace label, toggles, folder picker, settings             │
├──────────────┬──────────────────────────────────────────┬───────────────┤
│              │                                          │               │
│  ChatPane    │  CenterWorkbench                         │ RightSidebar  │
│  (left)      │  - Editor tabs (CodeMirror)              │ - Activity    │
│              │  - Terminal tabs (xterm)                 │   strip       │
│  - Messages  │  - Preview tabs (iframe)                 │ - File tree   │
│  - Tool UI   │                                          │ - Search      │
│  - Input     │  [BottomDock: terminal, stubs]           │ - Git         │
│              │                                          │               │
├──────────────┴──────────────────────────────────────────┴───────────────┤
│ StatusBar: toggle panes, context meter, settings                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Components

| Area | Component | Location | Status |
|------|-----------|----------|--------|
| Shell | `WorkbenchShell.svelte` | `src/modules/workbench/` | ✅ |
| Chat | `ChatPane.svelte`, `ChatTabBar.svelte` | `src/modules/agent/` | ✅ |
| Center | `CenterWorkbench.svelte` | `src/modules/workbench/` | ✅ |
| Tab bar | `WorkbenchTabBar.svelte` | `src/modules/workbench/` | ✅ |
| Editor | `EditorSurface.svelte` | `src/modules/editor/` | ✅ |
| Terminal | `TerminalPane.svelte` | `src/modules/terminal/` | ✅ |
| Preview | `PreviewPane.svelte` | `src/modules/preview/` | ✅ |
| Explorer | `RightSidebar.svelte`, `FileTree.svelte`, `FileTreeRow.svelte` | `src/modules/explorer/` | ✅ |
| Search | `SearchPanel.svelte` | `src/modules/explorer/` | ✅ |
| Git | `GitPanel.svelte`, `SourceControl.svelte` | `src/modules/explorer/` | ✅ |
| Welcome | `WelcomeScreen.svelte` | `src/modules/workspace/` | ✅ |
| Settings | `SettingsPane.svelte` | `src/modules/settings/` | ✅ |
| Status bar | `StatusBar.svelte` | `src/modules/workbench/` | ✅ |
| Bottom dock | `BottomDock.svelte` | `src/modules/workbench/` | ✅ |

---

## Keyboard Shortcuts

Handled by `src/modules/shortcuts/dispatcher.ts`:

| Shortcut | Action | Status |
|----------|--------|--------|
| `Mod+Shift+F` | Focus workspace search | ✅ |
| `Mod+B` | Toggle chat pane | ✅ |
| `Mod+Shift+E` | Toggle explorer | ✅ |
| `Mod+J` | Toggle bottom dock | ✅ |
| `Mod+,` | Open settings | ✅ |
| `Mod+W` | Close active tab | ✅ |
| `Alt+Shift+T` | New terminal tab | ✅ |
| `Alt+Shift+P` | New preview tab | ✅ |
| `Alt+Shift+X` | Close all workbench tabs | ✅ |

Shortcuts ignored when focus is in input, textarea, CodeMirror, or xterm.
