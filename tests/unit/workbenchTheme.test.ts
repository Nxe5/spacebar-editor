import { describe, expect, it } from "vitest";
import {
  isLightWorkbenchTheme,
  normalizeWorkbenchTheme,
  WORKBENCH_THEME_OPTIONS,
} from "../../src/lib/workbench-theme";

describe("normalizeWorkbenchTheme", () => {
  it("defaults to spacebar", () => {
    expect(normalizeWorkbenchTheme(undefined)).toBe("spacebar");
    expect(normalizeWorkbenchTheme("unknown")).toBe("spacebar");
  });

  it("exposes exactly seven starter presets", () => {
    expect(WORKBENCH_THEME_OPTIONS).toHaveLength(7);
    expect(WORKBENCH_THEME_OPTIONS.map((t) => t.id)).toEqual([
      "spacebar",
      "dark-bubblegum",
      "cursor-dark",
      "light-paper",
      "light-cloud",
      "pink-studio",
      "blue-nova",
    ]);
  });

  it("migrates removed presets to the closest current theme", () => {
    expect(normalizeWorkbenchTheme("vscode-dark")).toBe("spacebar");
    expect(normalizeWorkbenchTheme("nxe5")).toBe("spacebar");
    expect(normalizeWorkbenchTheme("dracula")).toBe("pink-studio");
    expect(normalizeWorkbenchTheme("tokyo-night")).toBe("blue-nova");
  });

  it("identifies light themes", () => {
    expect(isLightWorkbenchTheme("light-paper")).toBe(true);
    expect(isLightWorkbenchTheme("light-cloud")).toBe(true);
    expect(isLightWorkbenchTheme("spacebar")).toBe(false);
  });
});
