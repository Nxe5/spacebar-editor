/** Workbench shell chrome — panel fills and control surfaces (tabs, composer pills). */

/** Matches the "dark-bubblegum" theme's sidebar/secondary/accent — the app default. */
export const WORKBENCH_CHROME_DEFAULTS = {
  panelBg: "#141414",
  controlBg: "#262626",
  controlActiveBg: "#343434",
} as const;

export type WorkbenchChromeKey = keyof typeof WORKBENCH_CHROME_DEFAULTS;

export type WorkbenchChromeMap = Record<WorkbenchChromeKey, string>;

export const WORKBENCH_CHROME_FIELDS: {
  key: WorkbenchChromeKey;
  label: string;
  hint: string;
}[] = [
  {
    key: "panelBg",
    label: "Panel background",
    hint: "Title bar, chat, explorer, tab strip, status bar, messages, composer",
  },
  {
    key: "controlBg",
    label: "Control background",
    hint: "Chat/editor tabs, composer mode & model, toolbar cluster, + button",
  },
  {
    key: "controlActiveBg",
    label: "Control active",
    hint: "Selected tab and control hover/active state",
  },
];

export const WORKBENCH_CHROME_THEME_SOURCES: Record<
  WorkbenchChromeKey,
  { themeVar: string; clearVars: string[] }
> = {
  panelBg: {
    themeVar: "--sidebar",
    clearVars: [
      "--workbench-panel-bg",
      "--chat-panel-bg",
      "--explorer-panel-bg",
      "--workbench-tab-strip-bg",
      "--workbench-shell-bg",
    ],
  },
  controlBg: {
    themeVar: "--secondary",
    clearVars: ["--workbench-control-bg"],
  },
  controlActiveBg: {
    themeVar: "--muted",
    clearVars: ["--workbench-control-active-bg"],
  },
};

const STORAGE_KEY = "sidebar.workbenchChrome.v1";

function normalizeHex(raw: string, fallback: string): string {
  const t = raw.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(t)) return t.toLowerCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(t)) {
    const h = t.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }
  return fallback;
}

export function defaultWorkbenchChrome(): WorkbenchChromeMap {
  return { ...WORKBENCH_CHROME_DEFAULTS };
}

export function normalizeWorkbenchChrome(
  parsed: Partial<WorkbenchChromeMap> | null | undefined
): WorkbenchChromeMap {
  const base = defaultWorkbenchChrome();
  if (!parsed || typeof parsed !== "object") return base;
  const out = { ...base };
  for (const key of Object.keys(base) as WorkbenchChromeKey[]) {
    const v = parsed[key];
    if (typeof v === "string") out[key] = normalizeHex(v, base[key]);
  }
  return out;
}

export function loadWorkbenchChrome(): WorkbenchChromeMap {
  if (typeof localStorage === "undefined") return defaultWorkbenchChrome();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultWorkbenchChrome();
    return normalizeWorkbenchChrome(JSON.parse(raw) as Partial<WorkbenchChromeMap>);
  } catch {
    return defaultWorkbenchChrome();
  }
}

export function saveWorkbenchChrome(colors: WorkbenchChromeMap): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  } catch {
    /* ignore */
  }
}

export function applyWorkbenchChromeToDocument(colors: WorkbenchChromeMap): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--workbench-panel-bg", colors.panelBg);
  root.style.setProperty("--chat-panel-bg", colors.panelBg);
  root.style.setProperty("--explorer-panel-bg", colors.panelBg);
  root.style.setProperty("--workbench-tab-strip-bg", colors.panelBg);
  root.style.setProperty("--workbench-shell-bg", colors.panelBg);
  root.style.setProperty("--workbench-control-bg", colors.controlBg);
  root.style.setProperty("--workbench-control-active-bg", colors.controlActiveBg);
}

export function clearWorkbenchChromeInlineOverrides(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const v of [
    "--workbench-panel-bg",
    "--chat-panel-bg",
    "--explorer-panel-bg",
    "--workbench-tab-strip-bg",
    "--workbench-shell-bg",
    "--workbench-control-bg",
    "--workbench-control-active-bg",
  ]) {
    root.style.removeProperty(v);
  }
}

export function readWorkbenchChromeFromDocument(): WorkbenchChromeMap {
  if (typeof document === "undefined") return defaultWorkbenchChrome();
  const s = getComputedStyle(document.documentElement);
  const pick = (varName: string, fallback: string) => {
    const v = s.getPropertyValue(varName).trim();
    return v || fallback;
  };
  const base = defaultWorkbenchChrome();
  return {
    panelBg: pick("--sidebar", base.panelBg),
    controlBg: pick("--secondary", base.controlBg),
    controlActiveBg: pick("--muted", base.controlActiveBg),
  };
}
