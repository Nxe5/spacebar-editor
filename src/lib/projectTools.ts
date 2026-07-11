import { readFile, isTauriAvailable } from "./ipc";
import { normalizeShellRules, type ShellRules } from "./shellPolicy";
import {
  strictestToolRule,
  globalToolRule,
  type CustomToolEntry,
  type ToolPolicyState,
  type ToolRule,
} from "./toolPolicy";
import { ALL_TOOL_NAMES } from "./tools/toolDefinitions";
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

export type ProjectToolsMergeResult = {
  state: ToolPolicyState;
  /** Tool names whose project rules tried to widen global policy (ignored). */
  ignoredPolicyWidening: string[];
  /** Custom tool names dropped because they shadow a built-in tool. */
  ignoredCustomToolShadows: string[];
};

const BUILTIN_SET = new Set<string>(ALL_TOOL_NAMES);

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
    const raw = await readFile(workspacePath, path);
    const parsed = JSON.parse(raw) as ProjectToolsFile;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function mergeProjectToolRules(
  global: ToolPolicyState,
  projectRules: Record<string, ToolRule> | undefined
): { toolRules: Record<string, ToolRule>; ignoredPolicyWidening: string[] } {
  if (!projectRules) {
    return { toolRules: { ...global.toolRules }, ignoredPolicyWidening: [] };
  }

  const toolRules = { ...global.toolRules };
  const ignoredPolicyWidening: string[] = [];

  for (const [name, projectRule] of Object.entries(projectRules)) {
    const base = globalToolRule(global, name);
    const merged = strictestToolRule(base, projectRule);
    if (merged !== projectRule) {
      ignoredPolicyWidening.push(name);
    }
    toolRules[name] = merged;
  }

  return { toolRules, ignoredPolicyWidening };
}

export function mergeProjectToolsLayer(
  global: ToolPolicyState,
  project: ProjectToolsFile | null
): ToolPolicyState {
  return mergeProjectToolsLayerDetailed(global, project).state;
}

export function mergeProjectToolsLayerDetailed(
  global: ToolPolicyState,
  project: ProjectToolsFile | null
): ProjectToolsMergeResult {
  if (!project) {
    return {
      state: global,
      ignoredPolicyWidening: [],
      ignoredCustomToolShadows: [],
    };
  }

  const { toolRules, ignoredPolicyWidening } = mergeProjectToolRules(
    global,
    project.toolRules
  );

  const customTools: CustomToolEntry[] = [...global.customTools];
  const ignoredCustomToolShadows: string[] = [];

  if (project.customTools) {
    for (const t of project.customTools) {
      if (!t.name?.trim()) continue;
      const name = t.name.trim();
      if (BUILTIN_SET.has(name)) {
        ignoredCustomToolShadows.push(name);
        continue;
      }
      const idx = customTools.findIndex((c) => c.name === name);
      const entry: CustomToolEntry = {
        name,
        description: t.description?.trim() || "Custom tool",
        rule: t.rule ?? global.defaultRule,
        parametersJson: t.parametersJson?.trim() || EMPTY_PARAMETERS_JSON,
      };
      if (idx >= 0) customTools[idx] = entry;
      else customTools.push(entry);
    }
  }

  return {
    state: {
      ...global,
      toolRules,
      shellRules: project.shellRules
        ? normalizeShellRules(project.shellRules)
        : global.shellRules,
      customTools,
    },
    ignoredPolicyWidening,
    ignoredCustomToolShadows,
  };
}
