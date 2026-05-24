import { describe, expect, it } from "vitest";
import {
  buildGitStatusByRelPath,
  fileGitBadge,
  fileGitTone,
  folderTreeTone,
} from "../../src/lib/explorer/treeGitDecorations";
import type { GitPathStatus } from "../../src/lib/gitTypes";

describe("treeGitDecorations", () => {
  const rows: GitPathStatus[] = [
    { path: "src/a.ts", index: "M", worktree: " " },
    { path: "new.txt", index: "??", worktree: "??" },
  ];
  const gitByRel = buildGitStatusByRelPath(rows);
  const ws = "/proj";

  it("maps git badges", () => {
    expect(fileGitBadge(gitByRel.get("src/a.ts"))).toBe("M");
    expect(fileGitTone(gitByRel.get("src/a.ts"))).toBe("modified");
    expect(fileGitBadge(gitByRel.get("new.txt"))).toBe("U");
    expect(fileGitTone(gitByRel.get("new.txt"))).toBe("untracked");
  });

  it("decorates folders by git and open files", () => {
    const open = [`${ws}/src/a.ts`];
    expect(folderTreeTone(`${ws}/src`, gitByRel, ws, open, new Map()).tone).toBe("open");
    expect(folderTreeTone(`${ws}`, gitByRel, ws, [], new Map()).tone).toBe("untracked");
    const errors = new Map([["src/a.ts", 2]]);
    expect(folderTreeTone(`${ws}/src`, gitByRel, ws, [], errors)).toEqual({
      tone: "error",
      errorCount: 2,
    });
  });
});
