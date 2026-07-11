import { describe, it, expect } from "vitest";
import {
  MODE_CONFIG,
  getModeTools,
  getModeBasePrompt,
  type ChatMode,
} from "../../src/lib/stores/mode";
import { ALL_TOOL_NAMES, READ_ONLY_TOOLS } from "../../src/lib/tools/toolDefinitions";

describe("mode store", () => {
  describe("MODE_CONFIG", () => {
    it("defines chat, plan, and agent modes", () => {
      const modes = Object.keys(MODE_CONFIG);
      expect(modes).toContain("chat");
      expect(modes).toContain("plan");
      expect(modes).toContain("agent");
    });

    it("chat mode has no tools", () => {
      expect(MODE_CONFIG.chat.tools).toHaveLength(0);
    });

    it("plan mode has read-only tools plus mode control", () => {
      expect(MODE_CONFIG.plan.tools).toEqual([...READ_ONLY_TOOLS, "switch_mode"]);
      expect(MODE_CONFIG.plan.tools).toContain("read_file");
      expect(MODE_CONFIG.plan.tools).toContain("get_git_status");
      expect(MODE_CONFIG.plan.tools).not.toContain("write_file");
      expect(MODE_CONFIG.plan.tools).not.toContain("delete_file");
      expect(MODE_CONFIG.plan.tools).not.toContain("run_shell");
    });

    it("agent mode has all tools", () => {
      expect(MODE_CONFIG.agent.tools).toEqual(ALL_TOOL_NAMES);
      expect(MODE_CONFIG.agent.tools).toContain("read_file");
      expect(MODE_CONFIG.agent.tools).toContain("write_file");
      expect(MODE_CONFIG.agent.tools).toContain("run_shell");
    });

    it("each mode has label, description, and basePrompt", () => {
      const modes: ChatMode[] = ["chat", "plan", "agent"];
      for (const mode of modes) {
        const config = MODE_CONFIG[mode];
        expect(config.label).toBeTruthy();
        expect(config.description).toBeTruthy();
        expect(config.basePrompt).toBeTruthy();
      }
    });
  });

  describe("getModeTools", () => {
    it("returns empty array for chat mode", () => {
      expect(getModeTools("chat")).toEqual([]);
    });

    it("returns read-only tools plus switch_mode for plan mode", () => {
      const tools = getModeTools("plan");
      expect(tools).toEqual([...READ_ONLY_TOOLS, "switch_mode"]);
    });

    it("returns all tools for agent mode", () => {
      const tools = getModeTools("agent");
      expect(tools).toEqual(ALL_TOOL_NAMES);
    });
  });

  describe("getModeBasePrompt", () => {
    it("returns a non-empty string for each mode", () => {
      const modes: ChatMode[] = ["chat", "plan", "agent"];
      for (const mode of modes) {
        const prompt = getModeBasePrompt(mode);
        expect(typeof prompt).toBe("string");
        expect(prompt.length).toBeGreaterThan(0);
      }
    });

    it("chat prompt mentions helpful assistant", () => {
      const prompt = getModeBasePrompt("chat");
      expect(prompt.toLowerCase()).toContain("helpful");
    });

    it("plan prompt mentions read-only or analysis", () => {
      const prompt = getModeBasePrompt("plan");
      expect(
        prompt.toLowerCase().includes("read") ||
        prompt.toLowerCase().includes("analysis") ||
        prompt.toLowerCase().includes("planning")
      ).toBe(true);
    });

    it("agent prompt mentions implementation or full access", () => {
      const prompt = getModeBasePrompt("agent");
      expect(
        prompt.toLowerCase().includes("implement") ||
        prompt.toLowerCase().includes("full access") ||
        prompt.toLowerCase().includes("agent")
      ).toBe(true);
    });
  });
});
