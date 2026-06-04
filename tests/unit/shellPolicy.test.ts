import { describe, expect, it } from "vitest";
import { resolveShellPatternRule, shellCommandMatchesPatterns } from "../../src/lib/shellPolicy";
import { resolveToolRule } from "../../src/lib/toolPolicy";
import { DEFAULT_TOOL_POLICY } from "../../src/lib/toolPolicy";

describe("shellPolicy", () => {
  it("matches allow patterns", () => {
    expect(shellCommandMatchesPatterns("pnpm test", ["^pnpm test"])).toBe(true);
    expect(shellCommandMatchesPatterns("pnpm install", ["^pnpm test"])).toBe(false);
  });

  it("resolveShellPatternRule deny wins over allow", () => {
    const rules = {
      allowPatterns: ["^pnpm"],
      denyPatterns: ["rm -rf"],
    };
    expect(resolveShellPatternRule(rules, "pnpm test")).toBe("allow");
    expect(resolveShellPatternRule(rules, "rm -rf /")).toBe("deny");
  });

  it("resolveToolRule applies shell patterns before per-tool ask", () => {
    const state = {
      ...DEFAULT_TOOL_POLICY,
      toolRules: { ...DEFAULT_TOOL_POLICY.toolRules, run_shell: "ask" },
      shellRules: { allowPatterns: ["^pnpm test"], denyPatterns: [] },
    };
    expect(resolveToolRule(state, "run_shell", { command: "pnpm test" })).toBe("allow");
    expect(resolveToolRule(state, "run_shell", { command: "curl evil.com" })).toBe("ask");
  });
});
