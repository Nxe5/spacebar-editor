import { writable, get } from "svelte/store";
import {
  listDir,
  pathExists,
  readFile,
  writeFile,
  deleteEntry,
  ensureSkillDir,
} from "../ipc";
import type { ChatMode } from "./mode";

export interface SkillEntry {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
  modes: ChatMode[];
  version: string;
}

interface SkillManifest {
  id: string;
  title: string;
  description?: string;
  enabled?: boolean;
  modes?: ChatMode[];
  version?: string;
}

export interface SkillsState {
  entries: SkillEntry[];
  contents: Record<string, string>;
  initialized: boolean;
}

const SKILLS_SUBDIR = ".sidebar/skills";
const SKILL_JSON = "skill.json";
const SKILL_MD = "skill.md";
const ALL_MODES: ChatMode[] = ["chat", "plan", "agent"];

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "skill";
}

function skillJsonPath(ws: string, id: string): string {
  return `${ws}/${SKILLS_SUBDIR}/${id}/${SKILL_JSON}`;
}

function skillMdPath(ws: string, id: string): string {
  return `${ws}/${SKILLS_SUBDIR}/${id}/${SKILL_MD}`;
}

function parseManifest(raw: string, id: string): SkillEntry {
  try {
    const m = JSON.parse(raw) as SkillManifest;
    return {
      id: m.id ?? id,
      title: m.title ?? id,
      description: m.description ?? "",
      enabled: m.enabled ?? true,
      modes: m.modes ?? ["plan", "agent"],
      version: m.version ?? "1.0.0",
    };
  } catch {
    return { id, title: id, description: "", enabled: false, modes: ["plan", "agent"], version: "1.0.0" };
  }
}

function serializeManifest(entry: SkillEntry): string {
  return JSON.stringify(
    {
      id: entry.id,
      title: entry.title,
      description: entry.description,
      enabled: entry.enabled,
      modes: entry.modes,
      version: entry.version,
    },
    null,
    2
  );
}

function createSkillsStore() {
  const { subscribe, set, update } = writable<SkillsState>({
    entries: [],
    contents: {},
    initialized: false,
  });

  async function load(workspacePath: string): Promise<void> {
    const skillsDir = `${workspacePath}/${SKILLS_SUBDIR}`;
    const exists = await pathExists(workspacePath, skillsDir).catch(() => false);
    if (!exists) {
      set({ entries: [], contents: {}, initialized: false });
      return;
    }

    let dirs: Awaited<ReturnType<typeof listDir>> = [];
    try {
      dirs = await listDir(workspacePath, skillsDir);
    } catch {
      set({ entries: [], contents: {}, initialized: false });
      return;
    }

    const entries: SkillEntry[] = [];
    const contents: Record<string, string> = {};

    for (const entry of dirs) {
      if (!entry.is_dir) continue;
      const id = entry.name;
      const jsonPath = skillJsonPath(workspacePath, id);
      const mdPath = skillMdPath(workspacePath, id);

      try {
        const raw = await readFile(workspacePath, jsonPath);
        entries.push(parseManifest(raw, id));
      } catch {
        continue;
      }

      try {
        contents[id] = await readFile(workspacePath, mdPath);
      } catch {
        contents[id] = "";
      }
    }

    entries.sort((a, b) => a.title.localeCompare(b.title));
    set({ entries, contents, initialized: true });
  }

  async function initialize(workspacePath: string): Promise<void> {
    const skillsDir = `${workspacePath}/${SKILLS_SUBDIR}`;
    const exists = await pathExists(workspacePath, skillsDir).catch(() => false);
    if (!exists) {
      await ensureSkillDir(workspacePath, "__init__").catch(() => {});
      await deleteEntry(workspacePath, `${skillsDir}/__init__`).catch(() => {});
    }
    await load(workspacePath);
    update((s) => ({ ...s, initialized: true }));
  }

  async function addSkill(
    workspacePath: string,
    title: string,
    description: string,
    content: string,
    modes: ChatMode[] = ["plan", "agent"]
  ): Promise<void> {
    const state = get({ subscribe });
    let id = slugify(title);
    let attempt = 0;
    while (state.entries.some((e) => e.id === id)) {
      attempt++;
      id = `${slugify(title)}-${attempt}`;
    }

    await ensureSkillDir(workspacePath, id);

    const entry: SkillEntry = { id, title, description, enabled: true, modes, version: "1.0.0" };
    await writeFile(workspacePath, skillJsonPath(workspacePath, id), serializeManifest(entry));
    await writeFile(workspacePath, skillMdPath(workspacePath, id), content);

    update((s) => ({
      ...s,
      entries: [...s.entries, entry].sort((a, b) => a.title.localeCompare(b.title)),
      contents: { ...s.contents, [id]: content },
      initialized: true,
    }));
  }

  async function removeSkill(workspacePath: string, id: string): Promise<void> {
    await deleteEntry(workspacePath, `${workspacePath}/${SKILLS_SUBDIR}/${id}`);
    update((s) => ({
      ...s,
      entries: s.entries.filter((e) => e.id !== id),
      contents: Object.fromEntries(Object.entries(s.contents).filter(([k]) => k !== id)),
    }));
  }

  async function saveContent(workspacePath: string, id: string, content: string): Promise<void> {
    await writeFile(workspacePath, skillMdPath(workspacePath, id), content);
    update((s) => ({ ...s, contents: { ...s.contents, [id]: content } }));
  }

  async function updateMeta(workspacePath: string, updated: SkillEntry): Promise<void> {
    await writeFile(workspacePath, skillJsonPath(workspacePath, updated.id), serializeManifest(updated));
    update((s) => ({
      ...s,
      entries: s.entries
        .map((e) => (e.id === updated.id ? updated : e))
        .sort((a, b) => a.title.localeCompare(b.title)),
    }));
  }

  function setEnabled(workspacePath: string, id: string, enabled: boolean): Promise<void> {
    const state = get({ subscribe });
    const entry = state.entries.find((e) => e.id === id);
    if (!entry) return Promise.resolve();
    return updateMeta(workspacePath, { ...entry, enabled });
  }

  function setModes(workspacePath: string, id: string, modes: ChatMode[]): Promise<void> {
    const state = get({ subscribe });
    const entry = state.entries.find((e) => e.id === id);
    if (!entry) return Promise.resolve();
    return updateMeta(workspacePath, { ...entry, modes });
  }

  return {
    subscribe,
    load,
    initialize,
    addSkill,
    removeSkill,
    saveContent,
    updateMeta,
    setEnabled,
    setModes,
  };
}

export const skills = createSkillsStore();
export const ALL_SKILL_MODES = ALL_MODES;
