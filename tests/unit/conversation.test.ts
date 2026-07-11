import { describe, it, expect } from "vitest";
import {
  buildProviderMessages,
  appendAssistantToolCalls,
  appendToolResults,
  repairProviderMessages,
} from "../../src/lib/agent/conversation";
import type { Message as ChatMessage } from "../../src/lib/stores/chat";
import type { Message as ProviderMessage } from "../../src/lib/providers/openaiCompat";

describe("conversation", () => {
  it("buildProviderMessages maps user, assistant, and tool roles", () => {
    const history: ChatMessage[] = [
      { id: "1", role: "user", content: "hi", timestamp: 0 },
      {
        id: "2",
        role: "assistant",
        content: "calling tool",
        timestamp: 1,
        rawToolCalls: [{ id: "tc1", name: "read_file", arguments: '{"path":"a.ts"}' }],
      },
      {
        id: "3",
        role: "tool",
        content: "file contents",
        timestamp: 2,
        toolCallId: "tc1",
        toolName: "read_file",
      },
    ];

    const msgs = buildProviderMessages("system", history);
    expect(msgs[0]).toEqual({ role: "system", content: "system" });
    expect(msgs[1]).toEqual({ role: "user", content: "hi" });
    expect(msgs[2].role).toBe("assistant");
    expect(msgs[2].tool_calls?.[0].function.name).toBe("read_file");
    expect(msgs[3]).toEqual({
      role: "tool",
      content: "file contents",
      tool_call_id: "tc1",
    });
  });

  it("preserves reasoning_content from assistant thinking for Kimi follow-ups", () => {
    const history: ChatMessage[] = [
      {
        id: "1",
        role: "assistant",
        content: "",
        thinking: "planning tool use",
        timestamp: 0,
        rawToolCalls: [{ id: "tc1", name: "write_file", arguments: '{"path":"a.ts"}' }],
      },
    ];
    const msgs = buildProviderMessages("system", history);
    expect(msgs[1]?.reasoning_content).toBe("planning tool use");
  });

  it("fills missing tool results after assistant tool_calls in history", () => {
    const history: ChatMessage[] = [
      { id: "1", role: "user", content: "go", timestamp: 0 },
      {
        id: "2",
        role: "assistant",
        content: "",
        timestamp: 1,
        rawToolCalls: [
          { id: "tc1", name: "read_file", arguments: "{}" },
          { id: "tc2", name: "grep", arguments: "{}" },
        ],
      },
      {
        id: "3",
        role: "tool",
        content: "only one result",
        timestamp: 2,
        toolCallId: "tc1",
        toolName: "read_file",
      },
    ];

    const msgs = buildProviderMessages("sys", history);
    expect(msgs.filter((m) => m.role === "tool")).toHaveLength(2);
    expect(msgs[4]?.role).toBe("tool");
    expect(msgs[4]?.tool_call_id).toBe("tc2");
  });

  it("drops orphan tool messages without a preceding assistant tool_calls", () => {
    const history: ChatMessage[] = [
      { id: "1", role: "user", content: "hi", timestamp: 0 },
      {
        id: "2",
        role: "tool",
        content: "orphan",
        timestamp: 1,
        toolCallId: "ghost",
        toolName: "parse_error",
      },
    ];

    const msgs = buildProviderMessages("sys", history);
    expect(msgs.some((m) => m.role === "tool")).toBe(false);
  });

  it("appendAssistantToolCalls and appendToolResults extend the thread", () => {
    const base = [{ role: "user" as const, content: "go" }];
    const withAssistant = appendAssistantToolCalls(base, "ok", [
      { id: "x", name: "grep", arguments: '{"pattern":"foo"}' },
    ]);
    expect(withAssistant).toHaveLength(2);
    expect(withAssistant[1].tool_calls?.[0].id).toBe("x");

    const withTool = appendToolResults(withAssistant, [{ id: "x", content: "matches" }], [
      { id: "x", name: "grep", arguments: "{}" },
    ]);
    expect(withTool).toHaveLength(3);
    expect(withTool[2]).toEqual({
      role: "tool",
      content: "matches",
      tool_call_id: "x",
    });
  });

  it("appendToolResults pads missing tool ids when toolCalls provided", () => {
    const base: ProviderMessage[] = [
      { role: "user", content: "go" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "a",
            type: "function",
            function: { name: "read_file", arguments: "{}" },
          },
          {
            id: "b",
            type: "function",
            function: { name: "grep", arguments: "{}" },
          },
        ],
      },
    ];
    const out = appendToolResults(base, [{ id: "a", content: "ok" }], [
      { id: "a", name: "read_file", arguments: "{}" },
      { id: "b", name: "grep", arguments: "{}" },
    ]);
    expect(out.filter((m) => m.role === "tool")).toHaveLength(2);
    expect(out.find((m) => m.tool_call_id === "b")?.content).toContain("missing");
  });

  it("repairProviderMessages fixes broken provider threads", () => {
    const broken: ProviderMessage[] = [
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "tc1",
            type: "function",
            function: { name: "run_shell", arguments: "{}" },
          },
        ],
      },
    ];
    const fixed = repairProviderMessages(broken);
    expect(fixed).toHaveLength(3);
    expect(fixed[2]?.role).toBe("tool");
    expect(fixed[2]?.tool_call_id).toBe("tc1");
  });
});
