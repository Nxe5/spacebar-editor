/** Editor surface chrome colors — persisted overrides for `--editor-*` CSS variables. */

export const EDITOR_CHROME_DEFAULTS = {
  bg: "#1e1e1e",
  fg: "#d4d4d4",
  gutterFg: "#858585",
  lineHighlight: "#2a2d2e",
  selection: "#264f78",
  cursor: "#d4d4d4",
} as const;

export type EditorChromeKey = keyof typeof EDITOR_CHROME_DEFAULTS;

export type EditorChromeMap = Record<EditorChromeKey, string>;

export const EDITOR_CHROME_FIELDS: {
  key: EditorChromeKey;
  label: string;
  hint: string;
  cssVar: string;
}[] = [
  { key: "bg", label: "Background", hint: "Editor pane background", cssVar: "--editor-bg" },
  { key: "fg", label: "Text", hint: "Default text and cursor", cssVar: "--editor-fg" },
  { key: "gutterFg", label: "Line numbers", hint: "Gutter foreground", cssVar: "--editor-gutter-fg" },
  { key: "lineHighlight", label: "Active line", hint: "Current line highlight", cssVar: "--editor-line-hl" },
  { key: "selection", label: "Selection", hint: "Selected text background", cssVar: "--editor-selection" },
  { key: "cursor", label: "Cursor", hint: "Caret color (falls back to text if unset)", cssVar: "--editor-cursor" },
];

const STORAGE_KEY = "tinyllama.editorChrome.v1";

function normalizeHex(raw: string, fallback: string): string {
  const t = raw.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(t)) return t.toLowerCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(t)) {
    const h = t.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }
  return fallback;
}

export function defaultEditorChrome(): EditorChromeMap {
  return { ...EDITOR_CHROME_DEFAULTS };
}

export function normalizeEditorChrome(
  parsed: Partial<EditorChromeMap> | null | undefined
): EditorChromeMap {
  const base = defaultEditorChrome();
  if (!parsed || typeof parsed !== "object") return base;
  const out = { ...base };
  for (const key of Object.keys(base) as EditorChromeKey[]) {
    const v = parsed[key];
    if (typeof v === "string") out[key] = normalizeHex(v, base[key]);
  }
  return out;
}

export function loadEditorChrome(): EditorChromeMap {
  if (typeof localStorage === "undefined") return defaultEditorChrome();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultEditorChrome();
    return normalizeEditorChrome(JSON.parse(raw) as Partial<EditorChromeMap>);
  } catch {
    return defaultEditorChrome();
  }
}

export function saveEditorChrome(colors: EditorChromeMap): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  } catch {
    /* ignore */
  }
}

export function applyEditorChromeToDocument(colors: EditorChromeMap): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const field of EDITOR_CHROME_FIELDS) {
    root.style.setProperty(field.cssVar, colors[field.key]);
  }
}

/** Read active workbench theme editor colors from computed styles (after `applyWorkbenchTheme`). */
export function readEditorChromeFromDocument(): EditorChromeMap {
  if (typeof document === "undefined") return defaultEditorChrome();
  const s = getComputedStyle(document.documentElement);
  const pick = (varName: string, fallback: string) => {
    const v = s.getPropertyValue(varName).trim();
    return v || fallback;
  };
  const base = defaultEditorChrome();
  return {
    bg: pick("--editor-bg", base.bg),
    fg: pick("--editor-fg", base.fg),
    gutterFg: pick("--editor-gutter-fg", base.gutterFg),
    lineHighlight: pick("--editor-line-hl", base.lineHighlight),
    selection: pick("--editor-selection", base.selection),
    cursor: pick("--editor-cursor", pick("--editor-fg", base.cursor)),
  };
}
