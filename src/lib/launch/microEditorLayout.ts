import type { LayoutOverride } from "../stores/layoutOverride";

/** Collapse all workbench chrome — chat, tabs, explorer, bottom panel. */
export const MICRO_EDITOR_LAYOUT: LayoutOverride = {
  showLeftPanel: false,
  showRightPanel: false,
  showBottomPanel: false,
  showTabStrip: false,
};
