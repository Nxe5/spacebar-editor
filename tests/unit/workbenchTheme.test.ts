import { describe, expect, it } from "vitest";
import {
  isLightWorkbenchTheme,
  normalizeWorkbenchTheme,
  WORKBENCH_THEME_OPTIONS,
} from "../../src/lib/workbench-theme";

describe("normalizeWorkbenchTheme", () => {
  it("defaults to dark-bubblegum", () => {
    expect(normalizeWorkbenchTheme(undefined)).toBe("dark-bubblegum");
    expect(normalizeWorkbenchTheme("unknown")).toBe("dark-bubblegum");
  });

  it("exposes exactly nine starter presets", () => {
    expect(WORKBENCH_THEME_OPTIONS).toHaveLength(9);
    expect(WORKBENCH_THEME_OPTIONS.map((t) => t.id)).toEqual([
      "spacebar",
      "dark-bubblegum",
      "dracula",
      "dark-dracula",
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
    expect(normalizeWorkbenchTheme("tokyo-night")).toBe("blue-nova");
  });

  it("resolves the real dracula preset instead of the old legacy alias", () => {
    expect(normalizeWorkbenchTheme("dracula")).toBe("dracula");
    expect(normalizeWorkbenchTheme("dark-dracula")).toBe("dark-dracula");
  });

  it("migrates the pre-rename dracula-experimental id to dark-dracula", () => {
    expect(normalizeWorkbenchTheme("dracula-experimental")).toBe("dark-dracula");
  });

  it("identifies light themes", () => {
    expect(isLightWorkbenchTheme("light-paper")).toBe(true);
    expect(isLightWorkbenchTheme("light-cloud")).toBe(true);
    expect(isLightWorkbenchTheme("spacebar")).toBe(false);
  });
});
