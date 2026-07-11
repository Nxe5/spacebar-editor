import { describe, it, expect } from "vitest";
import {
  TOOL_DEFINITIONS,
  ALL_TOOL_NAMES,
  READ_ONLY_TOOLS,
  WRITE_TOOLS,
  getToolsForNames,
} from "../../src/lib/tools/toolDefinitions";

const CORE_TOOLS = [
  "read_file",
  "write_file",
  "create_file",
  "delete_file",
  "move_file",
  "list_dir",
  "grep",
  "find_file",
  "get_file_tree",
  "get_git_status",
  "get_git_log",
  "get_git_diff",
  "run_shell",
  "run_tests",
  "run_script",
  "web_fetch",
  "lsp_find_references",
  "lsp_go_to_definition",
  "lsp_document_symbols",
  "lsp_workspace_symbols",
  "lsp_get_diagnostics",
  "switch_mode",
];

describe("toolDefinitions", () => {
  describe("TOOL_DEFINITIONS", () => {
    it("defines all core tools", () => {
      const toolNames = Object.keys(TOOL_DEFINITIONS);
      expect(toolNames).toHaveLength(CORE_TOOLS.length);
      for (const name of CORE_TOOLS) {
        expect(toolNames).toContain(name);
      }
    });

    it("each tool has correct OpenAI function schema", () => {
      for (const [name, tool] of Object.entries(TOOL_DEFINITIONS)) {
        expect(tool.type).toBe("function");
        expect(tool.function.name).toBe(name);
        expect(typeof tool.function.description).toBe("string");
        expect(tool.function.description.length).toBeGreaterThan(0);
        expect(tool.function.parameters.type).toBe("object");
        expect(typeof tool.function.parameters.properties).toBe("object");
      }
    });

    it("create_file requires path and content", () => {
      const tool = TOOL_DEFINITIONS.create_file;
      expect(tool.function.parameters.required).toEqual(["path", "content"]);
    });

    it("move_file requires from and to", () => {
      const tool = TOOL_DEFINITIONS.move_file;
      expect(tool.function.parameters.required).toEqual(["from", "to"]);
    });

    it("get_git_diff has optional path only", () => {
      const tool = TOOL_DEFINITIONS.get_git_diff;
      expect(tool.function.parameters.properties).toHaveProperty("path");
      expect(tool.function.parameters.required ?? []).not.toContain("path");
    });
  });

  describe("ALL_TOOL_NAMES", () => {
    it("contains all tool names from TOOL_DEFINITIONS", () => {
      expect(ALL_TOOL_NAMES.sort()).toEqual(Object.keys(TOOL_DEFINITIONS).sort());
    });
  });

  describe("READ_ONLY_TOOLS", () => {
    it("contains read and git read operations", () => {
      expect(READ_ONLY_TOOLS).toContain("read_file");
      expect(READ_ONLY_TOOLS).toContain("list_dir");
      expect(READ_ONLY_TOOLS).toContain("grep");
      expect(READ_ONLY_TOOLS).toContain("get_git_status");
      expect(READ_ONLY_TOOLS).toContain("get_git_log");
      expect(READ_ONLY_TOOLS).toContain("get_git_diff");
    });

    it("does not contain write operations", () => {
      expect(READ_ONLY_TOOLS).not.toContain("write_file");
      expect(READ_ONLY_TOOLS).not.toContain("create_file");
      expect(READ_ONLY_TOOLS).not.toContain("delete_file");
      expect(READ_ONLY_TOOLS).not.toContain("run_shell");
    });
  });

  describe("WRITE_TOOLS", () => {
    it("contains write, file mutation, and shell operations", () => {
      expect(WRITE_TOOLS).toContain("write_file");
      expect(WRITE_TOOLS).toContain("create_file");
      expect(WRITE_TOOLS).toContain("delete_file");
      expect(WRITE_TOOLS).toContain("move_file");
      expect(WRITE_TOOLS).toContain("run_shell");
      expect(WRITE_TOOLS).toContain("run_tests");
      expect(WRITE_TOOLS).toContain("run_script");
    });

    it("does not contain read operations", () => {
      expect(WRITE_TOOLS).not.toContain("read_file");
      expect(WRITE_TOOLS).not.toContain("get_git_status");
    });
  });

  describe("getToolsForNames", () => {
    it("returns empty array for empty input", () => {
      expect(getToolsForNames([])).toEqual([]);
    });

    it("returns tools for valid names", () => {
      const tools = getToolsForNames(["read_file", "write_file"]);
      expect(tools).toHaveLength(2);
      expect(tools[0].function.name).toBe("read_file");
      expect(tools[1].function.name).toBe("write_file");
    });

    it("filters out invalid tool names", () => {
      const tools = getToolsForNames(["read_file", "invalid_tool", "grep"]);
      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.function.name)).toEqual(["read_file", "grep"]);
    });

    it("returns all tools for ALL_TOOL_NAMES", () => {
      const tools = getToolsForNames(ALL_TOOL_NAMES);
      expect(tools).toHaveLength(CORE_TOOLS.length);
    });
  });
});
