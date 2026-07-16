export type ExplorerPanelTab = "files" | "search" | "git";

export const EXPLORER_PANEL_TABS: { id: ExplorerPanelTab; title: string }[] = [
  { id: "files", title: "Explorer" },
  { id: "search", title: "Search" },
  { id: "git", title: "Git" },
];
