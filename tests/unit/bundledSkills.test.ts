import { describe, it, expect } from "vitest";
import { buildActiveSkillBlocks } from "../../src/lib/skills/activeSkills";
import { BUNDLED_SKILLS } from "../../src/lib/skills/bundled";

describe("buildActiveSkillBlocks bundled skills", () => {
  const ctx = {
    workspace_name: "demo",
    git_branch: "main",
    active_file: "",
    active_file_contents: "",
    open_files: "",
    today: "2026-07-13",
  };

  it("includes bundled skills when no project skill overrides the id", () => {
    const blocks = buildActiveSkillBlocks(
      { entries: [], contents: {}, initialized: true },
      "agent",
      ctx
    );
    const ids = blocks.map((b) => b.id);
    for (const skill of BUNDLED_SKILLS.filter((s) => s.modes.includes("agent"))) {
      expect(ids).toContain(skill.id);
    }
  });

  it("prefers project skills over bundled skills with the same id", () => {
    const blocks = buildActiveSkillBlocks(
      {
        entries: [
          {
            id: "typescript",
            title: "Project TS",
            description: "",
            enabled: true,
            modes: ["agent"],
            version: "1.0.0",
          },
        ],
        contents: { typescript: "# Custom project TypeScript rules" },
        initialized: true,
      },
      "agent",
      ctx
    );
    const ts = blocks.find((b) => b.id === "typescript");
    expect(ts?.text).toContain("Custom project TypeScript rules");
    expect(ts?.text).not.toContain("Prefer strict typing");
  });
});
