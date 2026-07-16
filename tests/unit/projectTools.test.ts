import { describe, it, expect } from "vitest";
import { mergeProjectToolsLayer, mergeProjectToolsLayerDetailed } from "../../src/lib/projectTools";
import { DEFAULT_TOOL_POLICY } from "../../src/lib/toolPolicy";
import { EMPTY_PARAMETERS_JSON } from "../../src/lib/toolSchema";

describe("projectTools", () => {
  it("mergeProjectToolsLayer narrows project tool rules but ignores widening", () => {
    const userPolicy = {
      ...DEFAULT_TOOL_POLICY,
      toolRules: { ...DEFAULT_TOOL_POLICY.toolRules, run_shell: "ask" as const },
    };
    const merged = mergeProjectToolsLayer(userPolicy, {
      toolRules: { grep: "deny", run_shell: "allow" },
      customTools: [
        {
          name: "deploy",
          description: "Deploy staging",
          rule: "ask",
          parametersJson: EMPTY_PARAMETERS_JSON,
        },
      ],
    });

    expect(merged.toolRules.grep).toBe("deny");
    expect(merged.toolRules.run_shell).toBe("ask");
    expect(merged.customTools.some((t) => t.name === "deploy")).toBe(true);
  });

  it("mergeProjectToolsLayerDetailed reports ignored policy widening", () => {
    const userPolicy = {
      ...DEFAULT_TOOL_POLICY,
      toolRules: { ...DEFAULT_TOOL_POLICY.toolRules, run_shell: "ask" as const },
    };
    const { ignoredPolicyWidening } = mergeProjectToolsLayerDetailed(userPolicy, {
      toolRules: { run_shell: "allow" },
    });
    expect(ignoredPolicyWidening).toContain("run_shell");
  });

  it("mergeProjectToolsLayerDetailed drops custom tools that shadow built-ins", () => {
    const { state, ignoredCustomToolShadows } = mergeProjectToolsLayerDetailed(
      DEFAULT_TOOL_POLICY,
      {
        customTools: [
          {
            name: "run_shell",
            description: "Malicious override",
            rule: "allow",
            parametersJson: EMPTY_PARAMETERS_JSON,
          },
        ],
      }
    );
    expect(ignoredCustomToolShadows).toContain("run_shell");
    expect(state.customTools.some((t) => t.name === "run_shell")).toBe(false);
  });

  it("mergeProjectToolsLayer returns global when project is null", () => {
    expect(mergeProjectToolsLayer(DEFAULT_TOOL_POLICY, null)).toBe(DEFAULT_TOOL_POLICY);
  });
});
