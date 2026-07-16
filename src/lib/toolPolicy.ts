import type { Tool } from "./providers/openaiCompat";
import { resolveShellPatternRule, type ShellRules } from "./shellPolicy";
import { ALL_TOOL_NAMES, TOOL_DEFINITIONS } from "./tools/toolDefinitions";
import {
  buildToolDefinition,
  defaultBuiltinEditorJson,
  EMPTY_PARAMETERS_JSON,
  getBuiltinToolTemplate,
} from "./toolSchema";

export type ToolRule = "allow" | "deny" | "ask";

const TOOL_RULE_STRICTNESS: Record<ToolRule, number> = {
  deny: 0,
  ask: 1,
  allow: 2,
};

/** Pick the more restrictive of two tool rules (deny < ask < allow). */
export function strictestToolRule(a: ToolRule, b: ToolRule): ToolRule {
  return TOOL_RULE_STRICTNESS[a] <= TOOL_RULE_STRICTNESS[b] ? a : b;
}

export function globalToolRule(state: ToolPolicyState, toolName: string): ToolRule {
  const custom = state.customTools.find((t) => t.name === toolName);
  if (custom) return custom.rule;
  if (state.toolRules[toolName] != null) return state.toolRules[toolName];
  return state.defaultRule;
}

export type BuiltinToolOverride = {
  description?: string;
  parametersJson?: string;
};

export type CustomToolEntry = {
  name: string;
  description: string;
  rule: ToolRule;
  parametersJson: string;
};

export type ToolPolicyState = {
  defaultRule: ToolRule;
  toolRules: Record<string, ToolRule>;
  shellRules?: ShellRules;
  removedBuiltinTools: string[];
  builtinOverrides: Record<string, BuiltinToolOverride>;
  customTools: CustomToolEntry[];
};

/**
 * Tools that require approval on a fresh install. Empty by default: all
 * commands are allowed out of the box; users can tighten rules per tool in
 * Settings → Tools, and workspace trust still gates the first run.
 */
const DEFAULT_ASK_TOOLS = [] as const;

/** Per-tool rules for a fresh install / Reset to defaults. */
export function buildDefaultToolRules(): Record<string, ToolRule> {
  const rules = Object.fromEntries(ALL_TOOL_NAMES.map((n) => [n, "allow" as ToolRule]));
  for (const name of DEFAULT_ASK_TOOLS) {
    if (name in rules) rules[name] = "ask";
  }
  return rules;
}

export const DEFAULT_TOOL_POLICY: ToolPolicyState = {
  defaultRule: "allow",
  toolRules: buildDefaultToolRules(),
  shellRules: { allowPatterns: [], denyPatterns: [] },
  removedBuiltinTools: [],
  builtinOverrides: {},
  customTools: [],
};

export type ToolEditorPayload = {
  name: string;
  description: string;
  rule: ToolRule;
  parametersJson: string;
  builtin: boolean;
};

export function shellCommandFromInput(
  toolName: string,
  input: Record<string, unknown> | undefined
): string | null {
  if (toolName !== "run_shell" || !input) return null;
  const cmd = input.command;
  return typeof cmd === "string" ? cmd : null;
}

export function resolveToolRule(
  state: ToolPolicyState,
  toolName: string,
  input?: Record<string, unknown>
): ToolRule {
  const shellCmd = shellCommandFromInput(toolName, input);
  if (shellCmd != null) {
    const patternRule = resolveShellPatternRule(state.shellRules, shellCmd);
    if (patternRule === "deny") return "deny";
    if (patternRule === "allow") return "allow";
  }
  const custom = state.customTools.find((t) => t.name === toolName);
  if (custom) return custom.rule;
  if (state.toolRules[toolName] != null) return state.toolRules[toolName];
  return state.defaultRule;
}

export function toolNeedsUserApproval(
  state: ToolPolicyState,
  toolName: string,
  input?: Record<string, unknown>
): boolean {
  return resolveToolRule(state, toolName, input) === "ask";
}

export function toolIsDenied(
  state: ToolPolicyState,
  toolName: string,
  input?: Record<string, unknown>
): boolean {
  return resolveToolRule(state, toolName, input) === "deny";
}

export function setToolRule(
  state: ToolPolicyState,
  toolName: string,
  rule: ToolRule
): ToolPolicyState {
  const customIdx = state.customTools.findIndex((t) => t.name === toolName);
  if (customIdx >= 0) {
    const customTools = [...state.customTools];
    customTools[customIdx] = { ...customTools[customIdx], rule };
    return { ...state, customTools };
  }
  return {
    ...state,
    toolRules: { ...state.toolRules, [toolName]: rule },
  };
}

function effectiveBuiltinDescription(state: ToolPolicyState, name: string): string {
  const override = state.builtinOverrides[name]?.description;
  if (override != null && override.trim()) return override.trim();
  return TOOL_DEFINITIONS[name]?.function.description ?? "No description.";
}

function effectiveBuiltinTool(state: ToolPolicyState, name: string): Tool | null {
  const template = getBuiltinToolTemplate(name);
  if (!template) return null;

  const override = state.builtinOverrides[name];
  const description = effectiveBuiltinDescription(state, name);

  let parameters = template.function.parameters;
  if (override?.parametersJson?.trim()) {
    const built = buildToolDefinition(name, description, override.parametersJson);
    if (built.ok) parameters = built.tool.function.parameters;
  }

  return {
    type: "function",
    function: {
      name,
      description,
      parameters,
    },
  };
}

export function getToolDescription(state: ToolPolicyState, toolName: string): string {
  const custom = state.customTools.find((t) => t.name === toolName);
  if (custom) return custom.description;
  return effectiveBuiltinDescription(state, toolName);
}

export function getEditorPayloadForTool(
  state: ToolPolicyState,
  name: string,
  builtin: boolean
): ToolEditorPayload | null {
  if (builtin) {
    const template = getBuiltinToolTemplate(name);
    if (!template) return null;
    const override = state.builtinOverrides[name];
    return {
      name,
      builtin: true,
      description: effectiveBuiltinDescription(state, name),
      rule: resolveToolRule(state, name),
      parametersJson: override?.parametersJson?.trim()
        ? override.parametersJson
        : defaultBuiltinEditorJson(name),
    };
  }

  const custom = state.customTools.find((t) => t.name === name);
  if (!custom) return null;
  return {
    name: custom.name,
    builtin: false,
    description: custom.description,
    rule: custom.rule,
    parametersJson: custom.parametersJson || EMPTY_PARAMETERS_JSON,
  };
}

export function listManagedTools(state: ToolPolicyState): Array<{
  name: string;
  description: string;
  rule: ToolRule;
  builtin: boolean;
  hasOverride: boolean;
}> {
  const out: Array<{
    name: string;
    description: string;
    rule: ToolRule;
    builtin: boolean;
    hasOverride: boolean;
  }> = [];

  for (const name of ALL_TOOL_NAMES) {
    if (state.removedBuiltinTools.includes(name)) continue;
    const override = state.builtinOverrides[name];
    out.push({
      name,
      description: effectiveBuiltinDescription(state, name),
      rule: resolveToolRule(state, name),
      builtin: true,
      hasOverride: !!(override?.description || override?.parametersJson),
    });
  }

  for (const t of state.customTools) {
    out.push({
      name: t.name,
      description: t.description,
      rule: t.rule,
      builtin: false,
      hasOverride: true,
    });
  }

  return out;
}

export function getActiveToolDefinitions(state: ToolPolicyState): Record<string, Tool> {
  const out: Record<string, Tool> = {};

  for (const name of ALL_TOOL_NAMES) {
    if (state.removedBuiltinTools.includes(name)) continue;
    if (toolIsDenied(state, name)) continue;
    const tool = effectiveBuiltinTool(state, name);
    if (tool) out[name] = tool;
  }

  for (const custom of state.customTools) {
    if (toolIsDenied(state, custom.name)) continue;
    const built = buildToolDefinition(
      custom.name,
      custom.description,
      custom.parametersJson || EMPTY_PARAMETERS_JSON
    );
    if (built.ok) out[custom.name] = built.tool;
  }

  return out;
}

export function getToolsForPolicy(state: ToolPolicyState, names: string[]): Tool[] {
  const defs = getActiveToolDefinitions(state);
  return names.filter((n) => n in defs).map((n) => defs[n]);
}

export function validateToolEditorPayload(
  payload: ToolEditorPayload,
  isNew: boolean,
  state: ToolPolicyState
): { ok: true } | { ok: false; error: string } {
  const name = payload.name.trim();
  if (!name) return { ok: false, error: "Tool name is required." };
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    return { ok: false, error: "Name must be a valid identifier (letters, numbers, underscore)." };
  }

  if (isNew) {
    if (ALL_TOOL_NAMES.includes(name) && !state.removedBuiltinTools.includes(name)) {
      return { ok: false, error: "A built-in tool with this name already exists." };
    }
    if (state.customTools.some((t) => t.name === name)) {
      return { ok: false, error: "A custom tool with this name already exists." };
    }
  }

  if (!payload.description.trim()) {
    return { ok: false, error: "Description is required." };
  }

  const built = buildToolDefinition(name, payload.description, payload.parametersJson);
  if (!built.ok) return built;

  return { ok: true };
}

export function applyToolEditorSave(
  state: ToolPolicyState,
  payload: ToolEditorPayload,
  isNew: boolean
): ToolPolicyState {
  let next = setToolRule(state, payload.name, payload.rule);

  if (payload.builtin) {
    const builtinOverrides = { ...next.builtinOverrides };
    const entry: BuiltinToolOverride = {
      description: payload.description.trim(),
      parametersJson: payload.parametersJson.trim(),
    };
    const template = getBuiltinToolTemplate(payload.name);
    const defaultDesc = template?.function.description ?? "";
    const defaultParams = defaultBuiltinEditorJson(payload.name);
    const descChanged = entry.description !== defaultDesc;
    const paramsChanged = entry.parametersJson !== defaultParams;
    if (descChanged || paramsChanged) {
      builtinOverrides[payload.name] = {
        ...(descChanged ? { description: entry.description } : {}),
        ...(paramsChanged ? { parametersJson: entry.parametersJson } : {}),
      };
    } else {
      delete builtinOverrides[payload.name];
    }
    return { ...next, builtinOverrides };
  }

  const customTools = isNew
    ? [
        ...next.customTools,
        {
          name: payload.name.trim(),
          description: payload.description.trim(),
          rule: payload.rule,
          parametersJson: payload.parametersJson.trim() || EMPTY_PARAMETERS_JSON,
        },
      ]
    : next.customTools.map((t) =>
        t.name === payload.name
          ? {
              name: payload.name.trim(),
              description: payload.description.trim(),
              rule: payload.rule,
              parametersJson: payload.parametersJson.trim() || EMPTY_PARAMETERS_JSON,
            }
          : t
      );

  return { ...next, customTools };
}

/** Migrate legacy global policy. */
export function migrateLegacyToolPolicy(
  legacy: { mode?: "allow_all" | "ask_each" } | null
): ToolPolicyState {
  if (!legacy?.mode) return cloneDefaultToolPolicy();
  if (legacy.mode === "allow_all") return cloneDefaultToolPolicy();
  return {
    defaultRule: "ask",
    toolRules: Object.fromEntries(ALL_TOOL_NAMES.map((n) => [n, "ask" as ToolRule])),
    shellRules: { allowPatterns: [], denyPatterns: [] },
    removedBuiltinTools: [],
    builtinOverrides: {},
    customTools: [],
  };
}

export function cloneDefaultToolPolicy(): ToolPolicyState {
  return structuredClone(DEFAULT_TOOL_POLICY);
}
