/** Workspace trust — per-folder agent context consent (Spec 45 §2.1). */

import { writable, get } from "svelte/store";
import { listDir, pathExists, isTauriAvailable } from "./ipc";
import { loadProjectToolsFile } from "./projectTools";
import { normalizeFilePath } from "./fsPath";

export type WorkspaceTrustLevel = "trusted" | "restricted";

export type WorkspaceAgentContentSummary = {
  hasAgentContent: boolean;
  toolRuleCount: number;
  customToolCount: number;
  promptFileCount: number;
  skillCount: number;
};

const STORAGE_KEY = "sidebar.trustedWorkspaces.v1";

type TrustStore = Record<string, WorkspaceTrustLevel>;

function loadTrustStore(): TrustStore {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as TrustStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persistTrustStore(store: TrustStore): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function getWorkspaceTrustLevel(workspacePath: string): WorkspaceTrustLevel | null {
  const key = normalizeFilePath(workspacePath.trim());
  if (!key) return null;
  return loadTrustStore()[key] ?? null;
}

export function setWorkspaceTrustLevel(
  workspacePath: string,
  level: WorkspaceTrustLevel
): void {
  const key = normalizeFilePath(workspacePath.trim());
  if (!key) return;
  const store = loadTrustStore();
  store[key] = level;
  persistTrustStore(store);
}

/** True when agent context from `.sidebar/` must not load (skills, prompts, project tools). */
export const workspaceRestricted = writable(false);

export function applyWorkspaceTrustLevel(level: WorkspaceTrustLevel | null): void {
  workspaceRestricted.set(level === "restricted");
}

/** Scan `.sidebar/` for injectable agent content. */
export async function scanWorkspaceAgentContent(
  workspacePath: string
): Promise<WorkspaceAgentContentSummary> {
  const root = normalizeFilePath(workspacePath.trim());
  const empty: WorkspaceAgentContentSummary = {
    hasAgentContent: false,
    toolRuleCount: 0,
    customToolCount: 0,
    promptFileCount: 0,
    skillCount: 0,
  };
  if (!root || !isTauriAvailable()) return empty;

  let toolRuleCount = 0;
  let customToolCount = 0;
  const toolsFile = await loadProjectToolsFile(root);
  if (toolsFile?.toolRules) toolRuleCount = Object.keys(toolsFile.toolRules).length;
  if (toolsFile?.customTools) customToolCount = toolsFile.customTools.length;

  let promptFileCount = 0;
  const promptsDir = `${root}/.sidebar/prompts`;
  if (await pathExists(root, promptsDir).catch(() => false)) {
    try {
      const entries = await listDir(root, promptsDir);
      promptFileCount = entries.filter((e) => !e.is_dir && e.name.endsWith(".md")).length;
    } catch {
      /* ignore */
    }
  }

  let skillCount = 0;
  const skillsDir = `${root}/.sidebar/skills`;
  if (await pathExists(root, skillsDir).catch(() => false)) {
    try {
      const entries = await listDir(root, skillsDir);
      skillCount = entries.filter((e) => e.is_dir).length;
    } catch {
      /* ignore */
    }
  }

  const hasAgentContent =
    toolRuleCount > 0 ||
    customToolCount > 0 ||
    promptFileCount > 0 ||
    skillCount > 0 ||
    (await pathExists(root, `${root}/.sidebar/prompts.json`).catch(() => false));

  return {
    hasAgentContent,
    toolRuleCount,
    customToolCount,
    promptFileCount,
    skillCount,
  };
}

export type PendingTrustDecision = {
  workspacePath: string;
  summary: WorkspaceAgentContentSummary;
};

export const pendingTrustDecision = writable<PendingTrustDecision | null>(null);

let trustResolver: ((level: WorkspaceTrustLevel | "cancel") => void) | null = null;

export function resolveTrustDecision(level: WorkspaceTrustLevel | "cancel"): void {
  pendingTrustDecision.set(null);
  trustResolver?.(level);
  trustResolver = null;
}

/** Prompt user when opening a folder with untrusted agent content. */
export async function promptWorkspaceTrust(
  workspacePath: string,
  summary: WorkspaceAgentContentSummary
): Promise<WorkspaceTrustLevel | "cancel"> {
  return new Promise((resolve) => {
    trustResolver = resolve;
    pendingTrustDecision.set({ workspacePath, summary });
  });
}

/** Resolve trust before loading agent context. Auto-trusts folders with no agent files. */
export async function resolveWorkspaceTrustOnOpen(
  workspacePath: string
): Promise<WorkspaceTrustLevel | "cancel"> {
  const existing = getWorkspaceTrustLevel(workspacePath);
  if (existing) {
    applyWorkspaceTrustLevel(existing);
    return existing;
  }

  const summary = await scanWorkspaceAgentContent(workspacePath);
  if (!summary.hasAgentContent) {
    setWorkspaceTrustLevel(workspacePath, "trusted");
    applyWorkspaceTrustLevel("trusted");
    return "trusted";
  }

  const choice = await promptWorkspaceTrust(workspacePath, summary);
  if (choice === "cancel") {
    applyWorkspaceTrustLevel(null);
    return "cancel";
  }

  setWorkspaceTrustLevel(workspacePath, choice);
  applyWorkspaceTrustLevel(choice);
  return choice;
}

/** @internal tests */
export function resetWorkspaceTrustForTests(): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
  workspaceRestricted.set(false);
  pendingTrustDecision.set(null);
  trustResolver = null;
}
