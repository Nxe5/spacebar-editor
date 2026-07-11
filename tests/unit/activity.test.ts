import { describe, expect, it } from "vitest";
import {
  formatAgentTurnCollapsedSummary,
  formatThoughtPreview,
  formatToolActivityLine,
  groupAgentTurns,
  groupAgentTurnsForDisplay,
  isRedundantToolTurnResponse,
  parseToolInput,
  toolActivityLabel,
  upsertLiveTool,
  createLiveTurn,
} from "../../src/lib/agent/activity";

describe("activity", () => {
  it("maps tool names to Cursor-style labels", () => {
    expect(toolActivityLabel("read_file")).toBe("Read");
    expect(toolActivityLabel("grep")).toBe("Grepped");
    expect(toolActivityLabel("write_file")).toBe("Write");
    expect(toolActivityLabel("parse_error")).toBe("Parse error");
  });

  it("formats activity lines", () => {
    expect(formatToolActivityLine("read_file", { path: "src/main.ts" })).toBe(
      "Read  main.ts"
    );
    expect(
      formatToolActivityLine(
        "read_file",
        { path: "/Users/gamb1t/Desktop/Nxe5/deep-seeker/test.md" },
        "/Users/gamb1t/Desktop/Nxe5/deep-seeker"
      )
    ).toBe("Read  test.md");
    expect(
      formatToolActivityLine(
        "list_dir",
        { path: "." },
        "/Users/gamb1t/Desktop/Nxe5/deep-seeker"
      )
    ).toBe("Listed  /Users/gamb1t/Desktop/Nxe5/deep-seeker");
  });

  it("formats thought preview for collapsed rows", () => {
    expect(formatThoughtPreview("  line one\nline two  ")).toBe("line one line two");
    expect(formatThoughtPreview("x".repeat(80)).endsWith("…")).toBe(true);
  });

  it("includes thinking on grouped agent turns", () => {
    const blocks = groupAgentTurns([
      { id: "u1", role: "user", content: "hi" },
      {
        id: "a1",
        role: "assistant",
        content: "Done.",
        thinking: "Let me reason about this…",
        activityLabel: "Deliberating",
      },
    ]);
    expect(blocks[1]).toMatchObject({
      kind: "agent-turn",
      thinking: "Let me reason about this…",
      statusLabel: "Deliberating",
    });
  });

  it("groups assistant tool rounds into one block", () => {
    const blocks = groupAgentTurns([
      { id: "u1", role: "user", content: "hi" },
      {
        id: "a1",
        role: "assistant",
        content: "I'll read the file.",
        rawToolCalls: [{ id: "t1", name: "read_file", arguments: '{"path":"a.ts"}' }],
      },
      {
        id: "r1",
        role: "tool",
        content: "file body",
        toolName: "read_file",
        toolCallId: "t1",
        toolInput: { path: "a.ts" },
        toolSuccess: true,
      },
      { id: "a2", role: "assistant", content: "The file contains …" },
    ]);

    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toMatchObject({
      kind: "agent-turn",
      planText: "I'll read the file.",
      response: "The file contains …",
    });
    if (blocks[1].kind === "agent-turn") {
      expect(blocks[1].tools).toHaveLength(1);
      expect(blocks[1].tools[0].name).toBe("read_file");
    }
  });

  it("upserts live tool status", () => {
    let turn = createLiveTurn();
    turn = upsertLiveTool(turn, {
      id: "x",
      name: "grep",
      input: { pattern: "foo" },
      status: "pending",
    });
    turn = upsertLiveTool(turn, { id: "x", status: "running" });
    expect(turn.tools[0].status).toBe("running");
  });

  it("parses tool input json", () => {
    expect(parseToolInput('{"path":"x"}')).toEqual({ path: "x" });
  });

  it("hides response bubble after successful self-explanatory file tools", () => {
    const turn = {
      kind: "agent-turn" as const,
      id: "a1",
      statusLabel: "Pondering",
      thinking: "",
      planText: "",
      tools: [
        {
          id: "t1",
          name: "write_file",
          input: { path: "joke.txt" },
          status: "done" as const,
          success: true,
          paths: ["joke.txt"],
        },
      ],
      response: "I wrote joke.txt with a short poem.",
      endIndex: 4,
    };
    expect(isRedundantToolTurnResponse(turn)).toBe(true);
  });

  it("keeps response bubble when tools need interpretation", () => {
    const turn = {
      kind: "agent-turn" as const,
      id: "a1",
      statusLabel: "Pondering",
      thinking: "",
      planText: "",
      tools: [
        {
          id: "t1",
          name: "read_file",
          input: { path: "a.ts" },
          status: "done" as const,
          success: true,
        },
      ],
      response: "The file exports a helper.",
      endIndex: 4,
    };
    expect(isRedundantToolTurnResponse(turn)).toBe(false);
  });

  it("hides the in-progress agent block while live streaming", () => {
    const messages = [
      { id: "u1", role: "user" as const, content: "write readme" },
      {
        id: "a1",
        role: "assistant" as const,
        content: "",
        rawToolCalls: [{ id: "t1", name: "get_file_tree", arguments: "{}" }],
      },
      {
        id: "r1",
        role: "tool" as const,
        content: "tree",
        toolName: "get_file_tree",
        toolCallId: "t1",
        toolSuccess: true,
      },
    ];
    const blocks = groupAgentTurnsForDisplay(messages, true, true);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("user");
  });

  it("keeps completed agent blocks when not streaming", () => {
    const messages = [
      { id: "u1", role: "user" as const, content: "write readme" },
      {
        id: "a1",
        role: "assistant" as const,
        content: "",
        rawToolCalls: [{ id: "t1", name: "write_file", arguments: '{"path":"README.md"}' }],
      },
      {
        id: "r1",
        role: "tool" as const,
        content: "ok",
        toolName: "write_file",
        toolCallId: "t1",
        toolSuccess: true,
      },
    ];
    expect(groupAgentTurnsForDisplay(messages, false, false)).toHaveLength(2);
  });

  it("formats collapsed agent turn summary", () => {
    const turn = groupAgentTurns([
      { id: "u1", role: "user", content: "hi" },
      {
        id: "a1",
        role: "assistant",
        content: "Here is a longer reply for the user to read.",
        activityLabel: "Deliberating",
      },
    ])[1]!;
    expect(turn.kind).toBe("agent-turn");
    if (turn.kind !== "agent-turn") return;
    expect(formatAgentTurnCollapsedSummary(turn)).toContain("Here is a longer");
  });
});
