import { describe, expect, it } from "vitest";
import { unescapeLiteralEscapes } from "../../src/lib/textEscapes";
import {
  formatToolInput,
  formatToolOutput,
  shouldRenderToolOutputAsMarkdown,
  toolOutputDisplayBody,
} from "../../src/lib/agent/toolDisplay";

describe("unescapeLiteralEscapes", () => {
  it("converts literal \\n sequences when there are no real newlines", () => {
    const raw = "--- Jokes ---\\n\\nTitle: Tech\\nJoke: Why?";
    expect(unescapeLiteralEscapes(raw)).toBe("--- Jokes ---\n\nTitle: Tech\nJoke: Why?");
  });

  it("leaves text alone when real newlines already dominate", () => {
    const text = "line one\nline two";
    expect(unescapeLiteralEscapes(text)).toBe(text);
  });
});

describe("formatToolOutput", () => {
  it("unescapes stdout section in run_shell results", () => {
    const raw = "stdout:\n--- Hi ---\\n\\nTitle: X\n\nstderr:\n\n\nexit code: 0";
    const out = formatToolOutput(raw);
    expect(out).toContain("--- Hi ---\n\nTitle: X");
    expect(out).not.toContain("\\n\\n");
  });
});

describe("formatToolInput", () => {
  it("shows run_shell command as plain text", () => {
    const cmd = 'echo "a\\n\\nb"';
    expect(formatToolInput("run_shell", { command: cmd })).toBe(cmd);
  });
});

describe("tool output markdown preview", () => {
  const guide =
    "# Escape Guide\\n\\n## Overview\\nThis guide covers step-by-step protocols.\\n\\n## Phase 1\\n1. **Silence**";

  it("detects document-like stdout after unescape", () => {
    const stdout = `stdout:\n${guide}\n\nexit code: 0`;
    expect(shouldRenderToolOutputAsMarkdown("run_shell", stdout)).toBe(true);
    expect(toolOutputDisplayBody("run_shell", stdout)).toContain("# Escape Guide\n");
  });

  it("renders read_file bodies as markdown candidates", () => {
    const body = "# Title\n\nParagraph one.\n\nParagraph two with enough text to qualify.";
    expect(shouldRenderToolOutputAsMarkdown("read_file", body)).toBe(true);
  });
});
