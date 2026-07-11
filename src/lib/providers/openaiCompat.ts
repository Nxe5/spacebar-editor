export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  /** Kimi K2 / DeepSeek reasoner: required on follow-up turns when tools were used. */
  reasoning_content?: string | null;
}

export interface ToolParameter {
  type: string;
  description?: string;
  enum?: string[];
}

export interface Tool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, ToolParameter>;
      required?: string[];
    };
  };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export type StreamEvent =
  | { type: "delta"; content: string }
  | { type: "thinking_delta"; content: string }
  | { type: "tool_call"; id: string; name: string; arguments: string }
  | { type: "tool_call_delta"; id: string; arguments: string }
  | { type: "done"; usage?: { prompt_tokens: number; completion_tokens: number } }
  | { type: "error"; message: string };

interface OpenAIChoice {
  index: number;
  delta?: {
    role?: string;
    content?: string | null;
    reasoning_content?: string | null;
    reasoning?: string | null;
    tool_calls?: Array<{
      index: number;
      id?: string;
      type?: string;
      function?: {
        name?: string;
        arguments?: string;
      };
    }>;
  };
  finish_reason?: string | null;
}

interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export const DEFAULT_ENDPOINTS = {
  ollama: "http://localhost:11434",
  lmstudio: "http://localhost:1234",
  llamacpp: "http://localhost:8080",
};

export type InferenceOptions = {
  num_ctx?: number;
  num_thread?: number;
  /** Ollama: request separated reasoning trace (`think` on /api/chat, `reasoning_content` on OpenAI API). */
  think?: boolean;
};

export type ChatCompletionOptions = {
  toolChoice?: "auto" | "none" | "required";
  parallelToolCalls?: boolean;
  /** Request a final SSE chunk with token usage (OpenAI / Moonshot / DeepSeek). */
  includeUsage?: boolean;
};

export async function* streamChat(
  baseUrl: string,
  model: string,
  messages: Message[],
  tools?: Tool[],
  signal?: AbortSignal,
  inferenceOptions?: InferenceOptions,
  apiKey?: string,
  /** Set true only for Ollama — enables Ollama-specific body extensions (think, options). */
  isOllama = false,
  /** Override chat completions path (default OpenAI `/v1/chat/completions`; GLM uses `/chat/completions`). */
  chatCompletionsPath = "/v1/chat/completions",
  chatOptions?: ChatCompletionOptions
): AsyncGenerator<StreamEvent> {
  const url = `${baseUrl.replace(/\/$/, "")}${chatCompletionsPath}`;

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    stream_options: { include_usage: chatOptions?.includeUsage !== false },
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = chatOptions?.toolChoice ?? "auto";
    if (chatOptions?.parallelToolCalls !== undefined) {
      body.parallel_tool_calls = chatOptions.parallelToolCalls;
    }
  }

  if (isOllama && inferenceOptions?.think) {
    body.think = true;
  }

  if (isOllama && (inferenceOptions?.num_ctx || inferenceOptions?.num_thread)) {
    body.options = {
      ...(inferenceOptions.num_ctx ? { num_ctx: inferenceOptions.num_ctx } : {}),
      ...(inferenceOptions.num_thread ? { num_thread: inferenceOptions.num_thread } : {}),
    };
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = apiKey?.trim();
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
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
    yield { type: "error", message: `API error ${response.status}: ${text}` };
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
        if (!trimmed || trimmed === "data: [DONE]") continue;
        if (!trimmed.startsWith("data: ")) continue;

        const jsonStr = trimmed.slice(6);
        let chunk: OpenAIStreamChunk;
        try {
          chunk = JSON.parse(jsonStr);
        } catch {
          continue;
        }

        for (const choice of chunk.choices ?? []) {
          const delta = choice.delta;
          if (!delta) continue;

          if (delta.content) {
            yield { type: "delta", content: delta.content };
          }

          const reasoning = delta.reasoning_content ?? delta.reasoning;
          if (reasoning) {
            yield { type: "thinking_delta", content: reasoning };
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;

              if (tc.id && tc.function?.name) {
                toolCallsInProgress.set(idx, {
                  id: tc.id,
                  name: tc.function.name,
                  arguments: tc.function.arguments ?? "",
                });
              } else if (tc.function?.arguments) {
                const existing = toolCallsInProgress.get(idx);
                if (existing) {
                  existing.arguments += tc.function.arguments;
                  yield {
                    type: "tool_call_delta",
                    id: existing.id,
                    arguments: tc.function.arguments,
                  };
                }
              }
            }
          }

          if (choice.finish_reason === "tool_calls") {
            for (const tc of toolCallsInProgress.values()) {
              yield {
                type: "tool_call",
                id: tc.id,
                name: tc.name,
                arguments: tc.arguments,
              };
            }
            toolCallsInProgress.clear();
          }
        }

        if (chunk.usage) {
          yield {
            type: "done",
            usage: {
              prompt_tokens: chunk.usage.prompt_tokens,
              completion_tokens: chunk.usage.completion_tokens,
            },
          };
        }
      }
    }
  } catch (e) {
    const error = e as Error;
    if (error.name === "AbortError") {
      return;
    }
    yield { type: "error", message: `Stream error: ${error.message}` };
    return;
  } finally {
    reader.releaseLock();
  }

  if (toolCallsInProgress.size > 0) {
    for (const tc of toolCallsInProgress.values()) {
      yield {
        type: "tool_call",
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
      };
    }
  }

  yield { type: "done" };
}

export async function fetchModels(
  baseUrl: string
): Promise<Array<{ id: string; name: string }>> {
  const url = `${baseUrl.replace(/\/$/, "")}/v1/models`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as { data: Array<{ id: string }> };
    return data.data.map((m) => ({
      id: m.id,
      name: m.id,
    }));
  } catch {
    return [];
  }
}
