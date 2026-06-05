import type { Message, Tool, StreamEvent } from "./openaiCompat";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | { type: "tool_result"; tool_use_id: string; content: string }>;
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface AnthropicContentBlock {
  type: "text" | "tool_use" | "thinking";
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  thinking?: string;
}

interface AnthropicStreamEvent {
  type: string;
  index?: number;
  content_block?: AnthropicContentBlock;
  delta?: {
    type: string;
    text?: string;
    partial_json?: string;
    thinking?: string;
  };
  message?: {
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

function convertMessagesToAnthropic(messages: Message[]): AnthropicMessage[] {
  const result: AnthropicMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "system") continue;

    if (msg.role === "tool") {
      const lastMsg = result[result.length - 1];
      if (lastMsg && lastMsg.role === "user") {
        if (typeof lastMsg.content === "string") {
          lastMsg.content = [{ type: "text", text: lastMsg.content }];
        }
        (lastMsg.content as Array<{ type: string; tool_use_id?: string; content?: string; text?: string }>).push({
          type: "tool_result",
          tool_use_id: msg.tool_call_id ?? "",
          content: msg.content ?? "",
        });
      } else {
        result.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: msg.tool_call_id ?? "",
              content: msg.content ?? "",
            },
          ],
        });
      }
      continue;
    }

    if (msg.role === "assistant") {
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        const blocks: Array<
          | { type: "text"; text: string }
          | { type: "tool_use"; id: string; name: string; input: unknown }
        > = [];
        if (msg.content) {
          blocks.push({ type: "text", text: msg.content });
        }
        for (const tc of msg.tool_calls) {
          let input: unknown = {};
          try {
            input = JSON.parse(tc.function.arguments || "{}");
          } catch {
            input = {};
          }
          blocks.push({
            type: "tool_use",
            id: tc.id,
            name: tc.function.name,
            input,
          });
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result.push({ role: "assistant", content: blocks as any });
      } else {
        result.push({ role: "assistant", content: msg.content ?? "" });
      }
      continue;
    }

    if (msg.role === "user") {
      result.push({
        role: "user",
        content: msg.content ?? "",
      });
    }
  }

  return result;
}

function convertToolsToAnthropic(tools: Tool[]): AnthropicTool[] {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: {
      type: "object",
      properties: t.function.parameters.properties,
      required: t.function.parameters.required,
    },
  }));
}

export async function* streamChat(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: Message[],
  tools?: Tool[],
  extendedThinking?: boolean,
  signal?: AbortSignal
): AsyncGenerator<StreamEvent> {
  const anthropicMessages = convertMessagesToAnthropic(messages);

  const body: Record<string, unknown> = {
    model,
    max_tokens: 8192,
    stream: true,
    messages: anthropicMessages,
  };

  if (systemPrompt) {
    body.system = systemPrompt;
  }

  if (tools && tools.length > 0) {
    body.tools = convertToolsToAnthropic(tools);
  }

  if (extendedThinking) {
    body.thinking = {
      type: "enabled",
      budget_tokens: 4096,
    };
  }

  let response: Response;
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    const error = e as Error;
    if (error.name === "AbortError") {
      return;
    }
    yield { type: "error", message: `Network error: ${error.message}` };
    return;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error");
    yield { type: "error", message: `Anthropic API error ${response.status}: ${text}` };
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    yield { type: "error", message: "No response body" };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  const toolCallsInProgress: Map<number, { id: string; name: string; arguments: string }> =
    new Map();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const jsonStr = trimmed.slice(6);
        let event: AnthropicStreamEvent;
        try {
          event = JSON.parse(jsonStr);
        } catch {
          continue;
        }

        if (event.type === "content_block_start" && event.content_block) {
          const block = event.content_block;
          if (block.type === "tool_use" && block.id && block.name) {
            toolCallsInProgress.set(event.index ?? 0, {
              id: block.id,
              name: block.name,
              arguments: "",
            });
          }
        }

        if (event.type === "content_block_delta" && event.delta) {
          if (event.delta.type === "text_delta" && event.delta.text) {
            yield { type: "delta", content: event.delta.text };
          }

          if (event.delta.type === "thinking_delta" && event.delta.thinking) {
            yield { type: "thinking_delta", content: event.delta.thinking };
          }

          if (event.delta.type === "input_json_delta" && event.delta.partial_json) {
            const idx = event.index ?? 0;
            const tc = toolCallsInProgress.get(idx);
            if (tc) {
              tc.arguments += event.delta.partial_json;
            }
          }
        }

        if (event.type === "content_block_stop") {
          const idx = event.index ?? 0;
          const tc = toolCallsInProgress.get(idx);
          if (tc) {
            yield {
              type: "tool_call",
              id: tc.id,
              name: tc.name,
              arguments: tc.arguments,
            };
            toolCallsInProgress.delete(idx);
          }
        }

        if (event.type === "message_delta" && event.usage) {
          yield {
            type: "done",
            usage: {
              prompt_tokens: event.usage.input_tokens,
              completion_tokens: event.usage.output_tokens,
            },
          };
        }

        if (event.type === "message_stop") {
          yield { type: "done" };
        }

        if (event.type === "error") {
          yield { type: "error", message: "Stream error from Anthropic" };
        }
      }
    }
  } catch (e) {
    const error = e as Error;
    if (error.name === "AbortError") {
      return;
    }
    yield { type: "error", message: `Stream error: ${error.message}` };
  } finally {
    reader.releaseLock();
  }
}

export const ANTHROPIC_MODELS = [
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", contextWindow: 200000 },
  { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", contextWindow: 200000 },
  { id: "claude-3-opus-20240229", name: "Claude 3 Opus", contextWindow: 200000 },
  { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", contextWindow: 200000 },
];
