import { readFile, isTauriAvailable } from "./ipc";
import { normalizeShellRules, type ShellRules } from "./shellPolicy";
import type { CustomToolEntry, ToolPolicyState, ToolRule } from "./toolPolicy";
import { EMPTY_PARAMETERS_JSON } from "./toolSchema";

export type ProjectToolsFile = {
  toolRules?: Record<string, ToolRule>;
  shellRules?: ShellRules;
  customTools?: Array<{
    name: string;
    description: string;
    rule?: ToolRule;
    parametersJson?: string;
  }>;
};

export function projectToolsPath(workspacePath: string): string {
  const base = workspacePath.replace(/\/$/, "");
  return `${base}/.sidebar/tools.json`;
}

export async function loadProjectToolsFile(
  workspacePath: string
): Promise<ProjectToolsFile | null> {
  if (!isTauriAvailable() || !workspacePath) return null;
  const path = projectToolsPath(workspacePath);
  try {
    const raw = await readFile(path);
    const parsed = JSON.parse(raw) as ProjectToolsFile;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function mergeProjectToolsLayer(
  global: ToolPolicyState,
  project: ProjectToolsFile | null
): ToolPolicyState {
  if (!project) return global;

  const customTools: CustomToolEntry[] = [...global.customTools];
  if (project.customTools) {
    for (const t of project.customTools) {
      if (!t.name?.trim()) continue;
      const idx = customTools.findIndex((c) => c.name === t.name);
      const entry: CustomToolEntry = {
        name: t.name.trim(),
        description: t.description?.trim() || "Custom tool",
        rule: t.rule ?? global.defaultRule,
        parametersJson: t.parametersJson?.trim() || EMPTY_PARAMETERS_JSON,
      };
      if (idx >= 0) customTools[idx] = entry;
      else customTools.push(entry);
    }
  }

  return {
    ...global,
    toolRules: { ...global.toolRules, ...(project.toolRules ?? {}) },
    shellRules: project.shellRules
      ? normalizeShellRules(project.shellRules)
      : global.shellRules,
    customTools,
  };
}
