import { describe, it, expect } from "vitest";
import {
  anySubfolderExpanded,
  buildWorkspaceTree,
  createWorkspaceRootEntry,
  workspaceFolderName,
} from "../../src/lib/workspace";
import type { FileEntry } from "../../src/lib/stores/files";

describe("workspace tree", () => {
  it("uses folder basename as root label", () => {
    expect(workspaceFolderName("/home/user/my-project")).toBe("my-project");
  });

  it("builds a single expandable root entry", () => {
    const child: FileEntry = {
      name: "readme.md",
      path: "/proj/readme.md",
      is_dir: false,
    };
    const tree = buildWorkspaceTree("/proj", [child]);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("proj");
    expect(tree[0].path).toBe("/proj");
    expect(tree[0].is_dir).toBe(true);
    expect(tree[0].expanded).toBe(true);
    expect(tree[0].children).toEqual([child]);
  });

  it("preserves expanded flag when requested", () => {
    const root = createWorkspaceRootEntry("/proj", [], false);
    expect(root.expanded).toBe(false);
  });

  it("anySubfolderExpanded ignores the workspace root row", () => {
    const tree = buildWorkspaceTree("/proj", [
      {
        name: "src",
        path: "/proj/src",
        is_dir: true,
        expanded: false,
        children: [],
      },
    ]);
    expect(anySubfolderExpanded(tree, "/proj")).toBe(false);

    tree[0].children![0].expanded = true;
    expect(anySubfolderExpanded(tree, "/proj")).toBe(true);

    tree[0].expanded = false;
    expect(anySubfolderExpanded(tree, "/proj")).toBe(true);
  });
});
