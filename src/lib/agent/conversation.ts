import type { Message as ProviderMessage, ToolCall as OpenAIToolCall } from "../providers/openaiCompat";
import type { Message as ChatMessage, StoredToolCall } from "../stores/chat";

const MISSING_TOOL_RESULT =
  "[Tool result missing from session history — treating as no output.]";

function pushMissingToolResults(
  out: ProviderMessage[],
  toolCalls: StoredToolCall[],
  responded: Set<string>
): void {
  for (const tc of toolCalls) {
    if (!tc.id || responded.has(tc.id)) continue;
    out.push({
      role: "tool",
      content: MISSING_TOOL_RESULT,
      tool_call_id: tc.id,
    });
  }
}

/**
 * Ensure every assistant `tool_calls` message is followed by one tool message per id.
 * DeepSeek/OpenAI reject threads with orphaned or incomplete tool-call sequences.
 */
export function repairProviderMessages(messages: ProviderMessage[]): ProviderMessage[] {
  const out: ProviderMessage[] = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i]!;

    if (msg.role === "tool") {
      i++;
      continue;
    }

    out.push(msg);

    if (msg.role === "assistant" && msg.tool_calls?.length) {
      const required = msg.tool_calls.filter((tc) => tc.id);
      const requiredIds = new Set(required.map((tc) => tc.id));
      const found = new Map<string, ProviderMessage>();
      let j = i + 1;

      while (j < messages.length && messages[j]?.role === "tool") {
        const toolMsg = messages[j]!;
        const id = toolMsg.tool_call_id?.trim();
        if (id && requiredIds.has(id) && !found.has(id)) {
          found.set(id, toolMsg);
        }
        j++;
      }

      for (const tc of required) {
        const existing = found.get(tc.id);
        out.push(
          existing ?? {
            role: "tool",
            content: MISSING_TOOL_RESULT,
            tool_call_id: tc.id,
          }
        );
      }

      i = j;
      continue;
    }

    i++;
  }

  return out;
}

export function buildProviderMessages(
  systemPrompt: string,
  history: ChatMessage[]
): ProviderMessage[] {
  const out: ProviderMessage[] = [{ role: "system", content: systemPrompt }];
  let pendingToolCalls: StoredToolCall[] | null = null;
  let respondedIds = new Set<string>();

  const flushPending = () => {
    if (!pendingToolCalls?.length) return;
    pushMissingToolResults(out, pendingToolCalls, respondedIds);
    pendingToolCalls = null;
    respondedIds = new Set();
  };

  for (const msg of history) {
    if (msg.role === "user") {
      flushPending();
      out.push({ role: "user", content: msg.content });
      continue;
    }

    if (msg.role === "assistant") {
      flushPending();
      if (msg.rawToolCalls && msg.rawToolCalls.length > 0) {
        const tool_calls: OpenAIToolCall[] = msg.rawToolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        }));
        out.push({
          role: "assistant",
          content: msg.content || null,
          tool_calls,
          ...(msg.thinking?.trim() ? { reasoning_content: msg.thinking } : {}),
        });
        pendingToolCalls = msg.rawToolCalls;
        respondedIds = new Set();
      } else {
        out.push({
          role: "assistant",
          content: msg.content,
          ...(msg.thinking?.trim() ? { reasoning_content: msg.thinking } : {}),
        });
      }
      continue;
    }

    if (msg.role === "tool") {
      const id = msg.toolCallId?.trim();
      if (pendingToolCalls?.length && id && pendingToolCalls.some((tc) => tc.id === id)) {
        out.push({
          role: "tool",
          content: msg.content,
          tool_call_id: id,
        });
        respondedIds.add(id);
      }
    }
  }

  flushPending();
  return repairProviderMessages(out);
}

export function appendAssistantToolCalls(
  messages: ProviderMessage[],
  content: string,
  toolCalls: StoredToolCall[],
  thinking?: string
): ProviderMessage[] {
  const tool_calls: OpenAIToolCall[] = toolCalls.map((tc) => ({
    id: tc.id,
    type: "function" as const,
    function: { name: tc.name, arguments: tc.arguments },
  }));
  return [
    ...messages,
    {
      role: "assistant",
      content: content || null,
      tool_calls,
      ...(thinking?.trim() ? { reasoning_content: thinking } : {}),
    },
  ];
}

export function appendToolResults(
  messages: ProviderMessage[],
  results: Array<{ id: string; content: string }>,
  toolCalls?: StoredToolCall[]
): ProviderMessage[] {
  const withResults = [
    ...messages,
    ...results.map((r) => ({
      role: "tool" as const,
      content: r.content,
      tool_call_id: r.id,
    })),
  ];

  if (!toolCalls?.length) {
    return repairProviderMessages(withResults);
  }

  const resultIds = new Set(results.map((r) => r.id));
  const patched = [...withResults];
  for (const tc of toolCalls) {
    if (tc.id && !resultIds.has(tc.id)) {
      patched.push({
        role: "tool",
        content: MISSING_TOOL_RESULT,
        tool_call_id: tc.id,
      });
    }
  }
  return repairProviderMessages(patched);
}
