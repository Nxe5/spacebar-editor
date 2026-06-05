import { describe, expect, it } from "vitest";
import {
  defaultContextAppearance,
  getContextSectionColor,
  normalizeContextAppearance,
} from "../../src/lib/chat/contextAppearance";

describe("contextAppearance", () => {
  it("defaults to VS Code Dark context bar colors", () => {
    const d = defaultContextAppearance();
    expect(d.baseModePrompt).toBe("#6796e6");
    expect(d.chatHistory).toBe("#569cd6");
  });

  it("normalizes hex colors", () => {
    const a = normalizeContextAppearance({
      baseModePrompt: "#ABC",
      toolSchemas: "#123456",
    });
    expect(a.baseModePrompt).toBe("#aabbcc");
    expect(a.toolSchemas).toBe("#123456");
  });

  it("maps known section ids and tool-instructions prefix", () => {
    const c = defaultContextAppearance();
    expect(getContextSectionColor("base-mode-prompt", c)).toBe(c.baseModePrompt);
    expect(getContextSectionColor("tool-instructions-(standard)", c)).toBe(c.toolInstructions);
  });

  it("hashes unknown section ids to skill accents", () => {
    const c = defaultContextAppearance();
    const color = getContextSectionColor("my-custom-skill", c);
    expect(Object.values(c).filter((v) => v.startsWith("#"))).toContain(color);
  });
});
