import type { AppIconName } from "./icons/appIcons";

export type ExplorerPanelTab = "files" | "search" | "git";

export const EXPLORER_PANEL_TABS: { id: ExplorerPanelTab; title: string; icon: AppIconName }[] = [
  { id: "files", title: "Explorer", icon: "page-search" },
  { id: "search", title: "Search", icon: "search" },
  { id: "git", title: "Git", icon: "git" },
];
