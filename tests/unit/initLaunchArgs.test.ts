import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";

const mockApplyWorkspace = vi.fn();
const mockReadFile = vi.fn();
const mockOpenEditor = vi.fn();
const mockGetLaunchArgs = vi.fn();

vi.mock("../../src/lib/workspace", () => ({
  applyWorkspaceFolder: (...args: unknown[]) => mockApplyWorkspace(...args),
}));

vi.mock("../../src/lib/ipc", () => ({
  isTauriAvailable: () => true,
  getLaunchArgs: (...args: unknown[]) => mockGetLaunchArgs(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  getLanguageFromPath: () => "typescript",
}));

vi.mock("../../src/lib/stores/workbench", () => ({
  workbench: {
    openEditorFile: (...args: unknown[]) => mockOpenEditor(...args),
  },
}));

import { layoutOverride } from "../../src/lib/stores/layoutOverride";
import {
  handleLaunchArgs,
  parentDirectory,
  initLaunchArgs,
  resetLaunchInitForTests,
} from "../../src/lib/launch/initLaunchArgs";
import { MICRO_EDITOR_LAYOUT } from "../../src/lib/launch/microEditorLayout";

describe("parentDirectory", () => {
  it("returns parent of a nested file path", () => {
    expect(parentDirectory("/home/user/project/src/main.ts")).toBe("/home/user/project/src");
  });

  it("returns root for a top-level file", () => {
    expect(parentDirectory("/file.txt")).toBe("/");
  });
});

describe("handleLaunchArgs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    layoutOverride.set(null);
    mockApplyWorkspace.mockResolvedValue(true);
    mockReadFile.mockResolvedValue("console.log(1);\n");
  });

  it("opens a file in micro-editor layout", async () => {
    const ok = await handleLaunchArgs({
      path: "/home/user/project/foo.ts",
      is_file: true,
    });

    expect(ok).toBe(true);
    expect(mockApplyWorkspace).toHaveBeenCalledWith("/home/user/project");
    expect(mockOpenEditor).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/home/user/project/foo.ts", content: "console.log(1);\n" })
    );
    expect(get(layoutOverride)).toEqual(MICRO_EDITOR_LAYOUT);
  });

  it("opens a directory as a normal workspace", async () => {
    const ok = await handleLaunchArgs({
      path: "/home/user/project",
      is_file: false,
    });

    expect(ok).toBe(true);
    expect(mockApplyWorkspace).toHaveBeenCalledWith("/home/user/project");
    expect(mockOpenEditor).not.toHaveBeenCalled();
    expect(get(layoutOverride)).toBeNull();
  });

  it("returns false when no path is provided", async () => {
    expect(await handleLaunchArgs({ path: null, is_file: false })).toBe(false);
  });
});

describe("initLaunchArgs", () => {
  beforeEach(() => {
    resetLaunchInitForTests();
    layoutOverride.set(null);
    vi.clearAllMocks();
    mockApplyWorkspace.mockResolvedValue(true);
    mockReadFile.mockResolvedValue("x");
    mockGetLaunchArgs.mockResolvedValue({ path: null, is_file: false });
  });

  it("calls getLaunchArgs only once per app session", async () => {
    await initLaunchArgs();
    await initLaunchArgs();
    expect(mockGetLaunchArgs).toHaveBeenCalledTimes(1);
  });
});
