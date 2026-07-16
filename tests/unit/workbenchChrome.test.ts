import { describe, expect, it } from "vitest";
import { normalizeWorkbenchChrome } from "../../src/lib/workbench/workbenchChrome";

describe("normalizeWorkbenchChrome", () => {
  it("defaults panel and control colors", () => {
    const colors = normalizeWorkbenchChrome(undefined);
    expect(colors.panelBg).toBe("#141414");
    expect(colors.controlBg).toBe("#262626");
    expect(colors.controlActiveBg).toBe("#343434");
  });

  it("normalizes short hex", () => {
    const colors = normalizeWorkbenchChrome({ panelBg: "#abc" });
    expect(colors.panelBg).toBe("#aabbcc");
  });
});
