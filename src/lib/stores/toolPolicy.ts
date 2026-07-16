import { writable, derived, get } from "svelte/store";
import { loadProjectToolsFile, mergeProjectToolsLayer, mergeProjectToolsLayerDetailed, type ProjectToolsFile } from "../projectTools";
import { ALL_TOOL_NAMES } from "../tools/toolDefinitions";
import { EMPTY_PARAMETERS_JSON } from "../toolSchema";
import { normalizeShellRules } from "../shellPolicy";
import {
  DEFAULT_TOOL_POLICY,
  migrateLegacyToolPolicy,
  setToolRule,
  applyToolEditorSave,
  validateToolEditorPayload,
  cloneDefaultToolPolicy,
  type ToolPolicyState,
  type ToolRule,
  type ToolEditorPayload,
} from "../toolPolicy";

const STORAGE_KEY = "sidebar.toolPolicy.v2";
const LEGACY_KEY = "sidebar.toolPolicy.v1";

const BUILTIN_SET = new Set(ALL_TOOL_NAMES);

function isUnmodifiedFactoryState(state: ToolPolicyState): boolean {
  return (
    state.removedBuiltinTools.length === 0 &&
    state.customTools.length === 0 &&
    Object.keys(state.builtinOverrides).length === 0
  );
}

/** Untouched factory policy from before allow-by-default. */
function isLegacyFactoryAskAll(state: ToolPolicyState): boolean {
  if (!isUnmodifiedFactoryState(state)) return false;
  if (state.defaultRule !== "ask") return false;
  return ALL_TOOL_NAMES.every((n) => state.toolRules[n] === "ask");
}

/** Untouched factory policy with every tool set to allow. */
function isLegacyFactoryAllowAll(state: ToolPolicyState): boolean {
  if (!isUnmodifiedFactoryState(state)) return false;
  if (state.defaultRule !== "allow") return false;
  return ALL_TOOL_NAMES.every((n) => state.toolRules[n] === "allow");
}

/** Pre-v0.1.8 factory set: allow-all except these ask tools. */
const LEGACY_FACTORY_ASK_TOOLS = new Set([
  "str_replace",
  "move_file",
  "delete_file",
  "run_shell",
  "run_tests",
  "run_script",
  "web_fetch",
  "switch_mode",
]);

/** Untouched factory policy from when a handful of tools defaulted to ask. */
function isLegacyFactoryMixedAsk(state: ToolPolicyState): boolean {
  if (!isUnmodifiedFactoryState(state)) return false;
  if (state.defaultRule !== "allow") return false;
  return ALL_TOOL_NAMES.every((n) =>
    LEGACY_FACTORY_ASK_TOOLS.has(n)
      ? state.toolRules[n] === "ask"
      : state.toolRules[n] === "allow"
  );
}

function normalizeCustomTools(
  tools: ToolPolicyState["customTools"] | undefined
): ToolPolicyState["customTools"] {
  return (tools ?? []).map((t) => ({
    ...t,
    parametersJson: t.parametersJson?.trim() ? t.parametersJson : EMPTY_PARAMETERS_JSON,
  }));
}

function loadState(): ToolPolicyState {
  if (typeof localStorage === "undefined") {
    return cloneDefaultToolPolicy();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ToolPolicyState;
      if (
        isLegacyFactoryAskAll(parsed) ||
        isLegacyFactoryAllowAll(parsed) ||
        isLegacyFactoryMixedAsk(parsed)
      ) {
        return cloneDefaultToolPolicy();
      }
      return {
        ...DEFAULT_TOOL_POLICY,
        ...parsed,
        toolRules: { ...DEFAULT_TOOL_POLICY.toolRules, ...parsed.toolRules },
        shellRules: normalizeShellRules(parsed.shellRules),
        builtinOverrides: { ...(parsed.builtinOverrides ?? {}) },
        customTools: normalizeCustomTools(parsed.customTools),
      };
    }
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as { mode?: "allow_all" | "ask_each" };
      return migrateLegacyToolPolicy(legacy);
    }
  } catch {
    /* ignore */
  }
  return cloneDefaultToolPolicy();
}

function persist(state: ToolPolicyState): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function createToolPolicyStore() {
  const initial = loadState();
  const { subscribe, set, update } = writable<ToolPolicyState>(initial);

  return {
    subscribe,
    get: () => get({ subscribe }),

    setDefaultRule: (defaultRule: ToolRule) => {
      update((s) => {
        const next = { ...s, defaultRule };
        persist(next);
        return next;
      });
    },

    setShellRules: (shellRules: ToolPolicyState["shellRules"]) => {
      update((s) => {
        const next = { ...s, shellRules: normalizeShellRules(shellRules) };
        persist(next);
        return next;
      });
    },

    setToolRule: (toolName: string, rule: ToolRule) => {
      update((s) => {
        const next = setToolRule(s, toolName, rule);
        persist(next);
        return next;
      });
    },

    removeTool: (toolName: string, builtin: boolean) => {
      update((s) => {
        if (builtin) {
          const removed = s.removedBuiltinTools.includes(toolName)
            ? s.removedBuiltinTools
            : [...s.removedBuiltinTools, toolName];
          const builtinOverrides = { ...s.builtinOverrides };
          delete builtinOverrides[toolName];
          const next = { ...s, removedBuiltinTools: removed, builtinOverrides };
          persist(next);
          return next;
        }
        const next = {
          ...s,
          customTools: s.customTools.filter((t) => t.name !== toolName),
        };
        persist(next);
        return next;
      });
    },

    saveToolEditor: (
      payload: ToolEditorPayload,
      isNew: boolean
    ): { ok: true } | { ok: false; error: string } => {
      const state = get({ subscribe });
      const validated = validateToolEditorPayload(payload, isNew, state);
      if (!validated.ok) return validated;

      update((s) => {
        const next = applyToolEditorSave(s, payload, isNew);
        persist(next);
        return next;
      });
      return { ok: true };
    },

    restoreBuiltinTool: (toolName: string) => {
      update((s) => {
        const next = {
          ...s,
          removedBuiltinTools: s.removedBuiltinTools.filter((n) => n !== toolName),
        };
        persist(next);
        return next;
      });
    },

    reset: () => {
      const next = cloneDefaultToolPolicy();
      set(next);
      persist(next);
    },
  };
}

export const toolPolicy = createToolPolicyStore();

const projectToolsLayer = writable<ProjectToolsFile | null>(null);

/** Non-blocking notices after loading `.sidebar/tools.json`. */
export const projectToolPolicyNotices = writable<string[]>([]);

export const effectiveToolPolicy = derived(
  [toolPolicy, projectToolsLayer],
  ([$global, $project]) => mergeProjectToolsLayer($global, $project)
);

export async function reloadProjectTools(workspacePath: string): Promise<void> {
  const data = await loadProjectToolsFile(workspacePath);
  if (!data) {
    projectToolsLayer.set(null);
    projectToolPolicyNotices.set([]);
    return;
  }
  const global = get(toolPolicy);
  const { ignoredPolicyWidening, ignoredCustomToolShadows } = mergeProjectToolsLayerDetailed(
    global,
    data
  );
  const notices: string[] = [];
  if (ignoredPolicyWidening.length) {
    notices.push(
      `Project tried to loosen tool permissions for: ${ignoredPolicyWidening.join(", ")} (ignored).`
    );
  }
  if (ignoredCustomToolShadows.length) {
    notices.push(
      `Project custom tools shadow built-in names (ignored): ${ignoredCustomToolShadows.join(", ")}.`
    );
  }
  projectToolPolicyNotices.set(notices);
  projectToolsLayer.set(data);
}

/** Skip project tool overrides (restricted workspace trust). */
export function clearProjectToolsLayer(): void {
  projectToolsLayer.set(null);
  projectToolPolicyNotices.set([]);
}

// Kept for tests or legacy callers
export { BUILTIN_SET };
