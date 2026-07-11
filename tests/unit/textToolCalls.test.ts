import { describe, expect, it } from "vitest";
import {
  normalizeToolName,
  normalizeToolArguments,
  recoverToolCallsFromText,
  textLooksLikeFakeToolUse,
  findMalformedToolCallFragments,
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

  it("maps write_file file alias to path", () => {
    expect(normalizeToolArguments("write_file", { file: "src/App.tsx", content: "x" })).toEqual({
      file: "src/App.tsx",
      content: "x",
      path: "src/App.tsx",
    });
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

  // --- Token-delimited (Gemma-style) tool calls --------------------------

  it("recovers a Gemma-style delimited tool call with quote tokens", () => {
    const text = `Percolating\n\n<|tool_call>call:run_shell{command:<|"|>ls -F<|"|>}<tool_call|>`;
    const { calls, cleanedText } = recoverToolCallsFromText(text, ALLOWED);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("run_shell");
    expect(JSON.parse(calls[0].arguments)).toEqual({ command: "ls -F" });
    expect(cleanedText).not.toContain("tool_call");
    expect(cleanedText).not.toContain('<|"|>');
  });

  it("handles multiple args in a delimited call", () => {
    const text = `<|tool_call>call:write_file{path:<|"|>a.txt<|"|>, content:<|"|>hi there<|"|>}<tool_call|>`;
    const { calls } = recoverToolCallsFromText(text, ALLOWED);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("write_file");
    expect(JSON.parse(calls[0].arguments)).toEqual({ path: "a.txt", content: "hi there" });
  });

  it("handles symmetric delimiters and numeric/bool args", () => {
    const text = `<|tool_call|>call:run_shell{command:<|"|>pwd<|"|>}<|tool_call|>`;
    const { calls } = recoverToolCallsFromText(text, ALLOWED);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].arguments)).toEqual({ command: "pwd" });
  });

  it("recovers a bare call:name{...} expression when the tool is allowed", () => {
    const text = `Sure. call:get_git_status{}`;
    const { calls } = recoverToolCallsFromText(text, ALLOWED);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("get_git_status");
  });

  it("ignores delimited calls for disallowed tools", () => {
    const text = `<|tool_call>call:rm_rf_everything{path:<|"|>/<|"|>}<tool_call|>`;
    const { calls } = recoverToolCallsFromText(text, ALLOWED);
    expect(calls).toHaveLength(0);
  });

  it("does not false-positive on prose containing 'call:'", () => {
    const text = `Give me a call: later about the meeting.`;
    const { calls } = recoverToolCallsFromText(text, ALLOWED);
    expect(calls).toHaveLength(0);
  });

  it("maps ls alias to list_dir", () => {
    expect(normalizeToolName("ls")).toBe("list_dir");
  });

  it("recovers ls alias from json block as list_dir with default path", () => {
    const ALLOWED_LIST = new Set(["list_dir", "read_file"]);
    const text = `\`\`\`json
{"name": "ls", "arguments": {}}
\`\`\``;
    const { calls } = recoverToolCallsFromText(text, ALLOWED_LIST);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("list_dir");
    expect(JSON.parse(calls[0].arguments)).toEqual({ path: "." });
  });

  it("recovers agent-files-style ls hallucination as list_dir", () => {
    const ALLOWED = new Set(["read_file", "list_dir", "grep"]);
    const text = `Okay, I will read the \`sample.ts\` file.

\`\`\`json
{"name": "ls", "arguments": {}}
\`\`\``;
    const { calls } = recoverToolCallsFromText(text, ALLOWED);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("list_dir");
  });

  it("recovers grep_file_content alias from JSON inside delimited tool_call", () => {
    const ALLOWED_GREP = new Set(["grep", "run_shell"]);
    const text = `<|tool_call>call1{"name":"grep_file_content","arguments":{"search_string": "executeTool","directory": "."}}<tool_call|>`;
    const { calls } = recoverToolCallsFromText(text, ALLOWED_GREP);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("grep");
    expect(JSON.parse(calls[0].arguments)).toEqual({ search_string: "executeTool", directory: ".", pattern: "executeTool" });
  });

  it("textLooksLikeFakeToolUse detects the delimited token", () => {
    expect(textLooksLikeFakeToolUse("<|tool_call>call:run_shell{}<tool_call|>")).toBe(true);
  });

  // --- Python/code blocks must not be mistaken for tool calls --------------

  const PYTHON_ADDON = `Here's the addon:

\`\`\`python
import bpy

bl_info = {
    "name": "Quick Glass Material",
    "author": "Coding Agent",
    "version": (1, 0),
}
\`\`\`
`;

  it("does not flag a ```python block with a \"name\": key as a malformed tool call", () => {
    expect(findMalformedToolCallFragments(PYTHON_ADDON)).toEqual([]);
  });

  it("does not treat a ```python code block as fake tool use", () => {
    expect(textLooksLikeFakeToolUse(PYTHON_ADDON)).toBe(false);
  });

  it("does not recover a tool call from a ```python block", () => {
    const { calls, cleanedText } = recoverToolCallsFromText(PYTHON_ADDON, ALLOWED);
    expect(calls).toHaveLength(0);
    // The code block stays in the cleaned text — it's content, not a tool call.
    expect(cleanedText).toContain("bl_info");
  });

  it("still flags a truncated JSON tool call in a json fence", () => {
    const text = `\`\`\`json
{"name": "run_shell", "arguments": {"command": "ls"
\`\`\``;
    const errors = findMalformedToolCallFragments(text);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("run_shell");
  });
});
