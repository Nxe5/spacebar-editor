import { describe, it, expect } from "vitest";
import {
  resolveToolRule,
  toolNeedsUserApproval,
  toolIsDenied,
  setToolRule,
  getToolsForPolicy,
  listManagedTools,
  migrateLegacyToolPolicy,
  applyToolEditorSave,
  validateToolEditorPayload,
  getEditorPayloadForTool,
  DEFAULT_TOOL_POLICY,
  strictestToolRule,
} from "../../src/lib/toolPolicy";
import { EMPTY_PARAMETERS_JSON } from "../../src/lib/toolSchema";

describe("toolPolicy", () => {
  it("strictestToolRule picks the more restrictive rule", () => {
    expect(strictestToolRule("allow", "ask")).toBe("ask");
    expect(strictestToolRule("ask", "allow")).toBe("ask");
    expect(strictestToolRule("deny", "allow")).toBe("deny");
  });

  it("resolveToolRule uses per-tool override", () => {
    const state = {
      ...DEFAULT_TOOL_POLICY,
      toolRules: { ...DEFAULT_TOOL_POLICY.toolRules, grep: "deny" },
    };
    expect(resolveToolRule(state, "grep")).toBe("deny");
    expect(resolveToolRule(state, "run_shell")).toBe("ask");
  });

  it("custom tool rule takes precedence", () => {
    const state = {
      ...DEFAULT_TOOL_POLICY,
      customTools: [
        {
          name: "my_tool",
          description: "test",
          rule: "deny" as const,
          parametersJson: EMPTY_PARAMETERS_JSON,
        },
      ],
    };
    expect(resolveToolRule(state, "my_tool")).toBe("deny");
    expect(toolIsDenied(state, "my_tool")).toBe(true);
  });

  it("toolNeedsUserApproval only for ask", () => {
    expect(toolNeedsUserApproval(DEFAULT_TOOL_POLICY, "read_file")).toBe(false);
    expect(toolNeedsUserApproval(DEFAULT_TOOL_POLICY, "run_shell")).toBe(true);
    expect(toolNeedsUserApproval(DEFAULT_TOOL_POLICY, "delete_file")).toBe(true);
    expect(toolNeedsUserApproval(DEFAULT_TOOL_POLICY, "move_file")).toBe(true);
  });

  it("DEFAULT_TOOL_POLICY allows most tools, asks for destructive", () => {
    expect(DEFAULT_TOOL_POLICY.defaultRule).toBe("allow");
    expect(DEFAULT_TOOL_POLICY.toolRules.read_file).toBe("allow");
    expect(DEFAULT_TOOL_POLICY.toolRules.write_file).toBe("allow");
    expect(DEFAULT_TOOL_POLICY.toolRules.run_shell).toBe("ask");
    expect(DEFAULT_TOOL_POLICY.toolRules.delete_file).toBe("ask");
    expect(DEFAULT_TOOL_POLICY.toolRules.move_file).toBe("ask");
  });

  it("getToolsForPolicy excludes denied and removed", () => {
    let state = setToolRule(DEFAULT_TOOL_POLICY, "run_shell", "deny");
    state = { ...state, removedBuiltinTools: ["grep"] };
    const tools = getToolsForPolicy(state, ["read_file", "grep", "run_shell"]);
    expect(tools.map((t) => t.function.name)).toEqual(["read_file"]);
  });

  it("migrateLegacyToolPolicy maps allow_all and ask_each", () => {
    const allowAll = migrateLegacyToolPolicy({ mode: "allow_all" });
    expect(allowAll.defaultRule).toBe("allow");
    expect(allowAll.toolRules.run_shell).toBe("ask");
    expect(migrateLegacyToolPolicy({ mode: "ask_each" }).defaultRule).toBe("ask");
  });

  it("listManagedTools skips removed builtins", () => {
    const state = { ...DEFAULT_TOOL_POLICY, removedBuiltinTools: ["grep"] };
    const names = listManagedTools(state).map((t) => t.name);
    expect(names).not.toContain("grep");
    expect(names).toContain("read_file");
  });

  it("builtin override changes description sent to model", () => {
    const base = setToolRule(DEFAULT_TOOL_POLICY, "read_file", "allow");
    const editor = getEditorPayloadForTool(base, "read_file", true)!;
    const state = applyToolEditorSave(
      base,
      {
        ...editor,
        description: "Custom read description",
        rule: "allow",
      },
      false
    );

    const tools = getToolsForPolicy(state, ["read_file"]);
    expect(tools[0].function.description).toBe("Custom read description");
    expect(listManagedTools(state).find((t) => t.name === "read_file")?.hasOverride).toBe(true);
  });

  it("validateToolEditorPayload rejects invalid parameters JSON", () => {
    const result = validateToolEditorPayload(
      {
        name: "new_tool",
        builtin: false,
        description: "Does something",
        rule: "ask",
        parametersJson: "{ not json",
      },
      true,
      DEFAULT_TOOL_POLICY
    );
    expect(result.ok).toBe(false);
  });

  it("applyToolEditorSave adds custom tool with parameters", () => {
    const payload = {
      name: "fetch_url",
      builtin: false,
      description: "Fetch a URL",
      rule: "ask" as const,
      parametersJson: JSON.stringify({
        type: "object",
        properties: { url: { type: "string", description: "URL" } },
        required: ["url"],
      }),
    };
    expect(validateToolEditorPayload(payload, true, DEFAULT_TOOL_POLICY).ok).toBe(true);
    const state = applyToolEditorSave(DEFAULT_TOOL_POLICY, payload, true);
    const tools = getToolsForPolicy(state, ["fetch_url"]);
    expect(tools[0].function.parameters?.required).toEqual(["url"]);
  });
});
