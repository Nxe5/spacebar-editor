import { describe, it, expect } from "vitest";
import {
  interpolateSkill,
  usesExpensiveVariable,
  emptyVariableContext,
  type VariableContext,
} from "../../src/lib/skills/skillVariables";
import { buildActiveSkillBlocks } from "../../src/lib/skills/activeSkills";
import type { SkillsState, SkillEntry } from "../../src/lib/stores/skills";

// ---------------------------------------------------------------------------
// interpolateSkill (spec 30 §10)
// ---------------------------------------------------------------------------

function ctx(overrides: Partial<VariableContext> = {}): VariableContext {
  return {
    workspacePath: "/home/dev/my-project",
    activeFilePath: "src/main.ts",
    activeFileContents: "console.log('hi')",
    openFilePaths: ["src/main.ts", "src/util.ts"],
    gitBranch: "feature/x",
    fileTree: "src/\n  main.ts",
    today: "2026-06-03",
    projectType: "Node.js / TypeScript",
    ...overrides,
  };
}

describe("interpolateSkill", () => {
  it("substitutes workspace_name from basename", () => {
    expect(interpolateSkill("Project: {{workspace_name}}", ctx())).toBe("Project: my-project");
  });

  it("substitutes workspace_path, active_file, git_branch, today", () => {
    const out = interpolateSkill(
      "{{workspace_path}} | {{active_file}} | {{git_branch}} | {{today}}",
      ctx()
    );
    expect(out).toBe("/home/dev/my-project | src/main.ts | feature/x | 2026-06-03");
  });

  it("joins open_files with comma-space", () => {
    expect(interpolateSkill("{{open_files}}", ctx())).toBe("src/main.ts, src/util.ts");
  });

  it("substitutes active_file_contents and file_tree", () => {
    expect(interpolateSkill("{{active_file_contents}}", ctx())).toBe("console.log('hi')");
    expect(interpolateSkill("{{file_tree}}", ctx())).toBe("src/\n  main.ts");
  });

  it("leaves UNKNOWN variables literal (spec §10.3)", () => {
    expect(interpolateSkill("a {{not_a_var}} b", ctx())).toBe("a {{not_a_var}} b");
  });

  it("substitutes empty string for known-but-null values", () => {
    expect(interpolateSkill("[{{active_file}}]", ctx({ activeFilePath: null }))).toBe("[]");
    expect(interpolateSkill("[{{git_branch}}]", ctx({ gitBranch: null }))).toBe("[]");
  });

  it("tolerates whitespace inside braces", () => {
    expect(interpolateSkill("{{ workspace_name }}", ctx())).toBe("my-project");
  });

  it("substitutes multiple occurrences", () => {
    expect(interpolateSkill("{{today}}/{{today}}", ctx())).toBe("2026-06-03/2026-06-03");
  });

  it("returns content unchanged when no variables", () => {
    expect(interpolateSkill("plain text only", ctx())).toBe("plain text only");
  });
});

describe("usesExpensiveVariable", () => {
  it("detects active_file_contents", () => {
    expect(usesExpensiveVariable("use {{active_file_contents}} here")).toBe(true);
    expect(usesExpensiveVariable("{{ active_file_contents }}")).toBe(true);
  });
  it("returns false otherwise", () => {
    expect(usesExpensiveVariable("{{active_file}} only")).toBe(false);
  });
});

describe("emptyVariableContext", () => {
  it("has all-null/empty fields and an ISO date", () => {
    const c = emptyVariableContext();
    expect(c.workspacePath).toBeNull();
    expect(c.openFilePaths).toEqual([]);
    expect(c.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// buildActiveSkillBlocks (spec 30 §5)
// ---------------------------------------------------------------------------

function skill(over: Partial<SkillEntry> = {}): SkillEntry {
  return {
    id: "s1",
    title: "Skill One",
    description: "",
    enabled: true,
    modes: ["plan", "agent"],
    version: "1.0.0",
    ...over,
  };
}

function state(entries: SkillEntry[], contents: Record<string, string>): SkillsState {
  return { entries, contents, initialized: true };
}

describe("buildActiveSkillBlocks", () => {
  it("includes enabled skills whose modes include the active mode", () => {
    const s = state(
      [skill({ id: "a", title: "A", modes: ["agent"] })],
      { a: "Skill A content" }
    );
    const blocks = buildActiveSkillBlocks(s, "agent", emptyVariableContext());
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({ id: "a", label: "A", text: "Skill A content" });
  });

  it("excludes skills whose modes do not include the active mode", () => {
    const s = state([skill({ id: "a", modes: ["plan"] })], { a: "x" });
    expect(buildActiveSkillBlocks(s, "agent", emptyVariableContext())).toHaveLength(0);
  });

  it("excludes disabled skills", () => {
    const s = state([skill({ id: "a", enabled: false, modes: ["agent"] })], { a: "x" });
    expect(buildActiveSkillBlocks(s, "agent", emptyVariableContext())).toHaveLength(0);
  });

  it("drops skills whose interpolated content is empty/whitespace", () => {
    const s = state([skill({ id: "a", modes: ["agent"] })], { a: "   \n  " });
    expect(buildActiveSkillBlocks(s, "agent", emptyVariableContext())).toHaveLength(0);
  });

  it("interpolates variables in skill content", () => {
    const s = state([skill({ id: "a", title: "A", modes: ["agent"] })], {
      a: "Branch is {{git_branch}}",
    });
    const blocks = buildActiveSkillBlocks(s, "agent", { ...emptyVariableContext(), gitBranch: "main" });
    expect(blocks[0].text).toBe("Branch is main");
  });

  it("returns multiple blocks in entry order", () => {
    const s = state(
      [
        skill({ id: "a", title: "A", modes: ["agent"] }),
        skill({ id: "b", title: "B", modes: ["agent"] }),
      ],
      { a: "first", b: "second" }
    );
    const blocks = buildActiveSkillBlocks(s, "agent", emptyVariableContext());
    expect(blocks.map((b) => b.id)).toEqual(["a", "b"]);
  });

  it("returns empty array for empty state", () => {
    expect(buildActiveSkillBlocks(state([], {}), "agent", emptyVariableContext())).toEqual([]);
  });
});
