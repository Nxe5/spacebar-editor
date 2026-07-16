/** Presets applied via `data-workbench-theme` on `<html>` (see `styles/workbench-themes.css`). */
export const WORKBENCH_THEME_OPTIONS = [
  { id: "spacebar", label: "Spacebar" },
  { id: "dark-bubblegum", label: "Dark Bubblegum" },
  { id: "cursor-dark", label: "Cursor Dark" },
  { id: "light-paper", label: "Light Paper" },
  { id: "light-cloud", label: "Light Cloud" },
  { id: "pink-studio", label: "Pink Studio" },
  { id: "blue-nova", label: "Blue Nova" },
] as const;

export type WorkbenchThemeId = (typeof WORKBENCH_THEME_OPTIONS)[number]["id"];

const KNOWN = new Set<string>(WORKBENCH_THEME_OPTIONS.map((t) => t.id));

/** Maps removed presets to the closest current theme (settings migration). */
const LEGACY_THEME_ALIASES: Record<string, WorkbenchThemeId> = {
  "vscode-dark": "spacebar",
  nxe5: "spacebar",
  "rose-pine": "spacebar",
  "catppuccin-mocha": "dark-bubblegum",
  "tokyo-night": "blue-nova",
  "one-dark-pro": "spacebar",
  sidebar: "spacebar",
  dracula: "pink-studio",
  "github-dark": "spacebar",
};

const LIGHT_THEMES = new Set<WorkbenchThemeId>(["light-paper", "light-cloud"]);

export function isLightWorkbenchTheme(id: WorkbenchThemeId): boolean {
  return LIGHT_THEMES.has(id);
}

export function normalizeWorkbenchTheme(id: unknown): WorkbenchThemeId {
  if (typeof id === "string") {
    if (KNOWN.has(id)) return id as WorkbenchThemeId;
    const alias = LEGACY_THEME_ALIASES[id];
    if (alias) return alias;
  }
  return "dark-bubblegum";
}

/** Apply preset CSS vars and toggle `dark` class for light themes. */
export function applyWorkbenchTheme(id: string | undefined | null): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const themeId = normalizeWorkbenchTheme(id);
  root.setAttribute("data-workbench-theme", themeId);
  root.classList.toggle("dark", !isLightWorkbenchTheme(themeId));
}
