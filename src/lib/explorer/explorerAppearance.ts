/** Explorer tree colors and sizing — persisted in localStorage. */

export const EXPLORER_APPEARANCE_DEFAULTS = {
  selectionBg: "#2a2a2a",
  fontSizePx: 12,
  iconSizePx: 15,
  fileModifiedColor: "#d4a656",
  fileUntrackedColor: "#6b9bd1",
  folderOpenFileColor: "#d4a656",
  folderUntrackedColor: "#6b9bd1",
  folderModifiedColor: "#c9a227",
  folderErrorColor: "#e34671",
} as const;

export type ExplorerAppearanceKey = keyof typeof EXPLORER_APPEARANCE_DEFAULTS;

export type ExplorerAppearanceMap = Record<ExplorerAppearanceKey, string | number>;

export const EXPLORER_APPEARANCE_FIELDS: {
  key: ExplorerAppearanceKey;
  label: string;
  hint: string;
  kind: "color" | "number";
  min?: number;
  max?: number;
}[] = [
  { key: "selectionBg", label: "Selection highlight", hint: "Row background when selected", kind: "color" },
  { key: "fontSizePx", label: "Label size", hint: "File and folder names (px)", kind: "number", min: 10, max: 16 },
  { key: "iconSizePx", label: "Icon size", hint: "Explorer icons (px)", kind: "number", min: 12, max: 22 },
  { key: "fileModifiedColor", label: "Modified file", hint: "Git modified file name", kind: "color" },
  { key: "fileUntrackedColor", label: "Untracked file", hint: "Git untracked file name", kind: "color" },
  { key: "folderOpenFileColor", label: "Folder (open file)", hint: "Folder containing the active editor tab", kind: "color" },
  { key: "folderUntrackedColor", label: "Folder (untracked)", hint: "Folder with untracked files", kind: "color" },
  { key: "folderModifiedColor", label: "Folder (modified)", hint: "Folder with modified files", kind: "color" },
  { key: "folderErrorColor", label: "Folder (errors)", hint: "Folder with diagnostic errors", kind: "color" },
];

const STORAGE_KEY = "tinyllama.explorerAppearance.v1";

function normalizeHex(raw: string, fallback: string): string {
  const t = raw.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(t)) return t.toLowerCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(t)) {
    const h = t.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }
  return fallback;
}

function clampPx(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(max, Math.max(min, n)));
}

export function defaultExplorerAppearance(): ExplorerAppearanceMap {
  return { ...EXPLORER_APPEARANCE_DEFAULTS };
}

export function normalizeExplorerAppearance(
  parsed: Partial<ExplorerAppearanceMap> | null | undefined
): ExplorerAppearanceMap {
  const base = defaultExplorerAppearance();
  if (!parsed || typeof parsed !== "object") return base;
  const out = { ...base };
  for (const field of EXPLORER_APPEARANCE_FIELDS) {
    const v = parsed[field.key];
    if (field.kind === "color" && typeof v === "string") {
      out[field.key] = normalizeHex(v, base[field.key] as string);
    } else if (field.kind === "number" && (typeof v === "number" || typeof v === "string")) {
      const n = typeof v === "number" ? v : Number(v);
      out[field.key] = clampPx(n, field.min ?? 8, field.max ?? 24, base[field.key] as number);
    }
  }
  return out;
}

export function loadExplorerAppearance(): ExplorerAppearanceMap {
  if (typeof localStorage === "undefined") return defaultExplorerAppearance();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultExplorerAppearance();
    return normalizeExplorerAppearance(JSON.parse(raw) as Partial<ExplorerAppearanceMap>);
  } catch {
    return defaultExplorerAppearance();
  }
}

export function saveExplorerAppearance(colors: ExplorerAppearanceMap): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  } catch {
    /* ignore */
  }
}

export function applyExplorerAppearanceToDocument(appearance: ExplorerAppearanceMap): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--explorer-selection-bg", appearance.selectionBg as string);
  root.style.setProperty("--explorer-font-size", `${appearance.fontSizePx}px`);
  root.style.setProperty("--explorer-icon-size", `${appearance.iconSizePx}px`);
  root.style.setProperty("--explorer-file-modified", appearance.fileModifiedColor as string);
  root.style.setProperty("--explorer-file-untracked", appearance.fileUntrackedColor as string);
  root.style.setProperty("--explorer-folder-open", appearance.folderOpenFileColor as string);
  root.style.setProperty("--explorer-folder-untracked", appearance.folderUntrackedColor as string);
  root.style.setProperty("--explorer-folder-modified", appearance.folderModifiedColor as string);
  root.style.setProperty("--explorer-folder-error", appearance.folderErrorColor as string);
}
