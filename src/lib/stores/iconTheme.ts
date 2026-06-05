import { writable, derived, get } from "svelte/store";
import type { IconThemeId, VscodeIconManifest } from "../icon-packs/types";
import type { SetiIconManifest } from "../icon-packs/setiTypes";
import {
  bundledIconPackBaseUrl,
  clearBundledManifestCache,
  loadBundledVscodeIconManifest,
} from "../icon-packs/bundled";
import { clearSetiManifestCache, loadBundledSetiManifest } from "../icon-packs/setiBundled";
import { iconPackGetDir, iconPackRefreshBundled, isTauriAvailable, readFile } from "../ipc";

const STORAGE_KEY = "sidebar.iconTheme.v2";
const LEGACY_STORAGE_KEY = "sidebar.iconTheme.v1";

type IconThemeState = {
  themeId: IconThemeId;
  customPackPath: string | null;
  revision: number;
};

function normalizeThemeId(id: unknown): IconThemeId {
  if (
    id === "seti" ||
    id === "codicons" ||
    id === "custom" ||
    id === "vscode-icons"
  ) {
    return id;
  }
  return "seti";
}

function loadState(): IconThemeState {
  if (typeof localStorage === "undefined") {
    return { themeId: "seti", customPackPath: null, revision: 0 };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<IconThemeState>;
      return {
        themeId: normalizeThemeId(parsed.themeId),
        customPackPath: typeof parsed.customPackPath === "string" ? parsed.customPackPath : null,
        revision: typeof parsed.revision === "number" ? parsed.revision : 0,
      };
    }

    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw) as Partial<IconThemeState>;
      let themeId = normalizeThemeId(parsed.themeId);
      // Cursor uses Seti; old default was vscode-icons SVG — upgrade once.
      if (themeId === "vscode-icons") themeId = "seti";
      const migrated: IconThemeState = {
        themeId,
        customPackPath: typeof parsed.customPackPath === "string" ? parsed.customPackPath : null,
        revision: typeof parsed.revision === "number" ? parsed.revision : 0,
      };
      persist(migrated);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return migrated;
    }

    return { themeId: "seti", customPackPath: null, revision: 0 };
  } catch {
    return { themeId: "seti", customPackPath: null, revision: 0 };
  }
}

function persist(state: IconThemeState): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

let manifestCache: VscodeIconManifest | null = null;
let setiManifestCache: SetiIconManifest | null = null;
let packBaseDir: string | null = null;
let packSource: "bundled" | "appdata" | "custom" | null = null;

async function packHasIcons(dir: string): Promise<boolean> {
  const base = dir.replace(/\/$/, "");
  if (isTauriAvailable()) {
    try {
      await readFile(null, `${base}/icons/folder.svg`);
      return true;
    } catch {
      return false;
    }
  }
  const res = await fetch(`${base}/icons/folder.svg`, { method: "HEAD" });
  return res.ok;
}

async function readManifestFromDir(dir: string): Promise<VscodeIconManifest> {
  const base = dir.replace(/\/$/, "");
  const candidates = ["manifest.json", "icons.json"];

  if (isTauriAvailable()) {
    for (const file of candidates) {
      try {
        const raw = await readFile(null, `${base}/${file}`);
        return JSON.parse(raw) as VscodeIconManifest;
      } catch {
        /* try next */
      }
    }
    throw new Error(`No manifest.json or icons.json in ${dir}`);
  }

  for (const file of candidates) {
    const url = `${base}/${file}`;
    const res = await fetch(url);
    if (res.ok) return (await res.json()) as VscodeIconManifest;
  }
  throw new Error(`No manifest.json or icons.json in ${dir}`);
}

async function loadManifestForTheme(state: IconThemeState): Promise<VscodeIconManifest | null> {
  if (state.themeId === "codicons" || state.themeId === "seti") return null;

  if (state.themeId === "custom" && state.customPackPath) {
    manifestCache = await readManifestFromDir(state.customPackPath);
    packBaseDir = state.customPackPath.replace(/\/$/, "");
    packSource = "custom";
    return manifestCache;
  }

  if (isTauriAvailable()) {
    const dir = await iconPackGetDir();
    if (dir && (await packHasIcons(dir))) {
      manifestCache = await readManifestFromDir(dir);
      packBaseDir = dir.replace(/\/$/, "");
      packSource = "appdata";
      return manifestCache;
    }
  }

  clearBundledManifestCache();
  manifestCache = await loadBundledVscodeIconManifest();
  packBaseDir = bundledIconPackBaseUrl();
  packSource = "bundled";
  return manifestCache;
}

function createIconThemeStore() {
  const initial = loadState();
  const { subscribe, set, update } = writable<IconThemeState>(initial);
  const manifestReady = writable(false);

  async function ensureManifest(): Promise<VscodeIconManifest | null> {
    const state = get({ subscribe });
    if (state.themeId === "codicons" || state.themeId === "seti") return null;
    if (manifestCache && packSource) return manifestCache;
    return loadManifestForTheme(state);
  }

  return {
    subscribe,
    manifestReady: { subscribe: manifestReady.subscribe },
    get: () => get({ subscribe }),

    setThemeId: (themeId: IconThemeId) => {
      update((s) => {
        const next = { ...s, themeId };
        persist(next);
        return next;
      });
      manifestCache = null;
      packSource = null;
    },

    setCustomPackPath: (customPackPath: string | null) => {
      update((s) => {
        const next = {
          ...s,
          customPackPath,
          themeId: (customPackPath ? "custom" : "seti") as IconThemeId,
        };
        persist(next);
        return next;
      });
      manifestCache = null;
      packSource = null;
    },

    invalidateManifest: () => {
      manifestCache = null;
      setiManifestCache = null;
      packSource = null;
      packBaseDir = null;
      clearBundledManifestCache();
      clearSetiManifestCache();
    },

    bumpRevision: () => {
      update((s) => {
        const next = { ...s, revision: s.revision + 1 };
        persist(next);
        return next;
      });
    },

    async ensureSetiManifest(): Promise<SetiIconManifest> {
      if (setiManifestCache) return setiManifestCache;
      setiManifestCache = await loadBundledSetiManifest();
      return setiManifestCache;
    },

    async init(): Promise<void> {
      try {
        const state = get({ subscribe });
        if (state.themeId === "seti") {
          await loadBundledSetiManifest().then((m) => {
            setiManifestCache = m;
          });
        } else {
          await ensureManifest();
        }
      } finally {
        manifestReady.set(true);
      }
    },

    async reloadManifest(): Promise<void> {
      manifestCache = null;
      packSource = null;
      packBaseDir = null;
      await ensureManifest();
      manifestReady.set(true);
    },

    async refreshBundledPack(): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
      try {
        if (isTauriAvailable()) {
          const path = await iconPackRefreshBundled();
          packBaseDir = path.replace(/\/$/, "");
          packSource = "appdata";
        } else {
          clearBundledManifestCache();
          packBaseDir = bundledIconPackBaseUrl();
          packSource = "bundled";
        }
        manifestCache = null;
        await ensureManifest();
        update((s) => {
          const next: IconThemeState = { ...s, revision: s.revision + 1 };
          persist(next);
          return next;
        });
        return { ok: true, path: packBaseDir ?? bundledIconPackBaseUrl() };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },

    ensureManifest,
    getManifest: () => manifestCache,

    async iconUrl(relativePath: string): Promise<string> {
      const state = get({ subscribe });
      const v = state.revision;
      const rel = relativePath.replace(/^\.\//, "");

      if (packSource === "custom" && packBaseDir && isTauriAvailable()) {
        const { convertFileSrc } = await import("@tauri-apps/api/core");
        return `${convertFileSrc(`${packBaseDir}/${rel}`)}?v=${v}`;
      }
      if (packSource === "appdata" && packBaseDir && isTauriAvailable()) {
        const { convertFileSrc } = await import("@tauri-apps/api/core");
        return `${convertFileSrc(`${packBaseDir}/${rel}`)}?v=${v}`;
      }
      return `${bundledIconPackBaseUrl()}/${rel}?v=${v}`;
    },
  };
}

export const iconTheme = createIconThemeStore();

export const usesCodicons = derived(iconTheme, ($t) => $t.themeId === "codicons");

export const usesSetiIcons = derived(iconTheme, ($t) => $t.themeId === "seti");
