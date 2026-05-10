/** Declarative defaults (merged with user overrides in `registry.ts`). Keys use `mod` = Ctrl on Linux/Windows, Cmd on macOS. */
export const SHORTCUT_DEFAULTS = [
  { id: "closeTab", keys: "Mod+W", category: "Workbench", description: "Close active center tab" },
  { id: "openSettings", keys: "Mod+,", category: "Workbench", description: "Open settings" },
  { id: "toggleChat", keys: "Mod+B", category: "View", description: "Toggle chat pane" },
  { id: "toggleExplorer", keys: "Mod+Shift+E", category: "View", description: "Toggle explorer sidebar" },
  { id: "toggleBottom", keys: "Mod+J", category: "View", description: "Toggle bottom panel" },
  {
    id: "newTerminal",
    keys: "Alt+Shift+T",
    category: "Terminal",
    description: "New terminal tab (also Mod+Shift+`)",
  },
  { id: "newPreview", keys: "Alt+Shift+P", category: "Workbench", description: "Open preview tab" },
  {
    id: "closeAllWorkbench",
    keys: "Alt+Shift+X",
    category: "Workbench",
    description: "Close all extra windows and center tabs",
  },
] as const;

export type ShortcutId = (typeof SHORTCUT_DEFAULTS)[number]["id"];
