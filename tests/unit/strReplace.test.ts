import { describe, it, expect } from "vitest";
import { applyStrReplace } from "../../src/lib/tools/strReplace";

describe("applyStrReplace", () => {
  it("replaces a unique occurrence", () => {
    const result = applyStrReplace("alpha beta gamma", "beta", "BETA");
    expect(result).toEqual({ ok: true, content: "alpha BETA gamma", replacements: 1 });
  });

  it("fails when old_str is missing", () => {
    const result = applyStrReplace("hello", "missing", "x");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("not found");
  });

  it("fails when old_str is ambiguous", () => {
    const result = applyStrReplace("foo foo", "foo", "bar");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("2 times");
  });

  it("replaces all occurrences when replace_all is true", () => {
    const result = applyStrReplace("foo foo", "foo", "bar", true);
    expect(result).toEqual({ ok: true, content: "bar bar", replacements: 2 });
  });

  it("rejects empty old_str", () => {
    const result = applyStrReplace("hello", "", "x");
    expect(result.ok).toBe(false);
  });
});
