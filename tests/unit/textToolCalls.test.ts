import { describe, expect, it } from "vitest";
import {
  normalizeToolName,
  recoverToolCallsFromText,
  textLooksLikeFakeToolUse,
} from "../../src/lib/agent/textToolCalls";

const ALLOWED = new Set(["get_git_status", "run_shell", "write_file", "create_file"]);

describe("textToolCalls", () => {
  it("recovers get_git_status from markdown json", () => {
    const text = `First, let's check status:

\`\`\`json
{"name": "get_git_status", "arguments": {}}
\`\`\`
`;
    const { calls, cleanedText } = recoverToolCallsFromText(text, ALLOWED);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("get_git_status");
    expect(cleanedText).not.toContain("get_git_status");
  });

  it("maps git status alias", () => {
    expect(normalizeToolName("git status")).toBe("get_git_status");
  });

  it("ignores hallucinated result blocks", () => {
    const text = `\`\`\`json
{"name": "porto_file", "arguments": {}, "result": {"untracked_files": ["joke.txt"]}}
\`\`\``;
    const { calls } = recoverToolCallsFromText(text, ALLOWED);
    expect(calls).toHaveLength(0);
    expect(textLooksLikeFakeToolUse(text)).toBe(true);
  });

  it("recovers run_shell from json block", () => {
    const text = `\`\`\`json
{"name": "run_shell", "arguments": {"command": "git add joke.txt"}}
\`\`\``;
    const { calls } = recoverToolCallsFromText(text, ALLOWED);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("run_shell");
    expect(JSON.parse(calls[0].arguments)).toEqual({ command: "git add joke.txt" });
  });

  it("recovers tool_name field alias", () => {
    const text = `\`\`\`json
{"tool_name": "run_shell", "arguments": {"command": "echo hi"}}
\`\`\``;
    const { calls } = recoverToolCallsFromText(text, ALLOWED);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("run_shell");
  });

  it("detects fake tool_use with tool_name in prose", () => {
    const text = `{"tool_name": "run_shell", "arguments": {}}`;
    expect(textLooksLikeFakeToolUse(text)).toBe(true);
  });

  it("recovers multi-line bare JSON with tool_name and nested arguments", () => {
    const text = `I will execute the commands now.

{
  "tool_name": "run_shell",
  "arguments": {
    "command": "echo hello > hellojoke.txt"
  }
}
`;
    const { calls } = recoverToolCallsFromText(text, ALLOWED);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("run_shell");
    expect(JSON.parse(calls[0].arguments)).toEqual({
      command: "echo hello > hellojoke.txt",
    });
  });
});
