import type { LLMSuite } from "../types";

/** Gemma-specific tool calling probes — text fallback format, aliases, sequential calls. */
export const suite: LLMSuite = {
  id: "16-gemma-tool-calling",
  title: "Gemma: Tool Calling",
  tests: [
    {
      id: "gemma-tool-01",
      suite: "16-gemma-tool-calling",
      mode: "agent",
      category: "tool-calling",
      smoke: true,
      description: "read_file with exact tool name",
      messages: [{ role: "user", content: "Use read_file to read README.md and tell me the first heading." }],
      expectedBehavior: "Calls read_file (not readFile), returns heading text",
      expectedTools: ["read_file"],
      tags: ["gemma", "tool-calling", "gemma-smoke"],
    },
    {
      id: "gemma-tool-02",
      suite: "16-gemma-tool-calling",
      mode: "agent",
      category: "tool-calling",
      smoke: true,
      description: "grep for TODO comments",
      messages: [
        {
          role: "user",
          content: "Use grep to find lines containing TODO in the workspace. Report file names only.",
        },
      ],
      expectedBehavior: "Uses grep tool (not grep_file_content), lists sample.ts",
      expectedTools: ["grep"],
      tags: ["gemma", "tool-calling", "gemma-smoke"],
    },
    {
      id: "gemma-tool-03",
      suite: "16-gemma-tool-calling",
      mode: "agent",
      category: "tool-calling",
      description: "list_dir top-level files",
      messages: [
        {
          role: "user",
          content:
            'Call list_dir with path "." and list the entries. Use a JSON tool call in ```json format.',
        },
      ],
      expectedBehavior: "Valid JSON block tool call, correct listing",
      expectedTools: ["list_dir"],
      tags: ["gemma", "tool-calling"],
    },
    {
      id: "gemma-tool-04",
      suite: "16-gemma-tool-calling",
      mode: "agent",
      category: "tool-calling",
      description: "read nonexistent file — must call tool not hallucinate",
      messages: [
        {
          role: "user",
          content: "Read the file does-not-exist.txt and tell me its contents.",
        },
      ],
      expectedBehavior: "Calls read_file, reports error from tool result — does not invent content",
      expectedTools: ["read_file"],
      tags: ["gemma", "tool-calling"],
    },
    {
      id: "gemma-tool-05",
      suite: "16-gemma-tool-calling",
      mode: "agent",
      category: "tool-calling",
      description: "sequential read then summarize (one tool at a time)",
      messages: [
        {
          role: "user",
          content:
            "First read sample.json with read_file. After you get the result, tell me the value of the name field.",
        },
      ],
      expectedBehavior: "Single read_file call per turn, correct name field",
      expectedTools: ["read_file"],
      tags: ["gemma", "tool-calling"],
    },
    {
      id: "gemma-tool-06",
      suite: "16-gemma-tool-calling",
      mode: "agent",
      category: "tool-calling",
      description: "get_file_tree then describe structure",
      messages: [
        {
          role: "user",
          content: "Use get_file_tree to show the workspace layout, then briefly describe the src/ folder.",
        },
      ],
      expectedBehavior: "Calls get_file_tree, mentions src/auth.ts or similar",
      expectedTools: ["get_file_tree"],
      tags: ["gemma", "tool-calling"],
    },
  ],
};
