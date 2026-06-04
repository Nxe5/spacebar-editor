/** Pattern-based policy for `run_shell` commands (Spec 40 §6). */

import type { ToolRule } from "./toolPolicy";

export type ShellRules = {
  allowPatterns: string[];
  denyPatterns: string[];
};

export const DEFAULT_SHELL_RULES: ShellRules = {
  allowPatterns: [],
  denyPatterns: [],
};

function normalizePatterns(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is string => typeof p === "string")
    .map((p) => p.trim())
    .filter(Boolean);
}

export function normalizeShellRules(raw: Partial<ShellRules> | undefined): ShellRules {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SHELL_RULES };
  return {
    allowPatterns: normalizePatterns(raw.allowPatterns),
    denyPatterns: normalizePatterns(raw.denyPatterns),
  };
}

function compilePattern(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

export function shellCommandMatchesPatterns(command: string, patterns: string[]): boolean {
  const cmd = command.trim();
  if (!cmd) return false;
  for (const pattern of patterns) {
    const re = compilePattern(pattern);
    if (re?.test(cmd)) return true;
  }
  return false;
}

/**
 * Pattern override for run_shell: deny → allow → null (fall through to per-tool rule).
 */
export function resolveShellPatternRule(
  shellRules: ShellRules | undefined,
  command: string
): ToolRule | null {
  const rules = shellRules ?? DEFAULT_SHELL_RULES;
  if (shellCommandMatchesPatterns(command, rules.denyPatterns)) return "deny";
  if (shellCommandMatchesPatterns(command, rules.allowPatterns)) return "allow";
  return null;
}
