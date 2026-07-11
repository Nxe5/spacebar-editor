import type { Tool } from "../providers/openaiCompat";
import type { Message as ProviderMessage, StreamEvent, InferenceOptions } from "../providers/openaiCompat";
import { streamChat as streamChatOpenAI } from "../providers/openaiCompat";
import { streamChat as streamChatAnthropic } from "../providers/anthropic";
import { streamChat as streamChatDeepseek, DEEPSEEK_API_BASE } from "../providers/deepseek";
import { streamChat as streamChatGlm, GLM_API_BASE } from "../providers/glm";
import { streamChat as streamChatKimi, KIMI_API_BASE } from "../providers/kimi";
import type { StoredToolCall } from "../stores/chat";

export type StreamTurnResult = {
  content: string;
  thinking: string;
  toolCalls: StoredToolCall[];
  usage?: { prompt_tokens: number; completion_tokens: number };
};

export type StreamChatBackend = "anthropic" | "deepseek" | "glm" | "kimi" | "ollama" | "llamacpp";

export function resolveStreamCredentials(input: {
  backend: StreamChatBackend;
  apiKeys: { anthropic: string; deepseek: string; glm: string; kimi: string };
  ollamaEndpoint: string;
  ollamaApiKey: string;
  llamacppEndpoint: string;
  llamacppApiKey: string;
}): { apiKey: string; baseUrl: string } {
  switch (input.backend) {
    case "anthropic":
      return { apiKey: input.apiKeys.anthropic, baseUrl: "" };
    case "deepseek":
      return { apiKey: input.apiKeys.deepseek, baseUrl: DEEPSEEK_API_BASE };
    case "glm":
      return { apiKey: input.apiKeys.glm, baseUrl: GLM_API_BASE };
    case "kimi":
      return { apiKey: input.apiKeys.kimi, baseUrl: KIMI_API_BASE };
    case "ollama":
      return { apiKey: input.ollamaApiKey, baseUrl: input.ollamaEndpoint };
    case "llamacpp":
      return { apiKey: input.llamacppApiKey, baseUrl: input.llamacppEndpoint };
  }
}

export async function streamOneTurn(options: {
  backend: StreamChatBackend;
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;
  messages: ProviderMessage[];
  tools?: Tool[];
  extendedThinking?: boolean;
  signal?: AbortSignal;
  onDelta?: (content: string) => void;
  onThinking?: (thinking: string) => void;
  onToolCall?: (toolCall: StoredToolCall) => void;
  inferenceOptions?: InferenceOptions;
}): Promise<StreamTurnResult> {
  let fullContent = "";
  let fullThinking = "";
  const toolCalls: StoredToolCall[] = [];
  let usage: StreamTurnResult["usage"];

  const processStream = async (stream: AsyncGenerator<StreamEvent>) => {
    for await (const event of stream) {
      if (event.type === "delta") {
        fullContent += event.content;
        options.onDelta?.(fullContent);
      } else if (event.type === "thinking_delta") {
        fullThinking += event.content;
        options.onThinking?.(fullThinking);
      } else if (event.type === "tool_call") {
        const tc: StoredToolCall = {
          id: event.id,
          name: event.name,
          arguments: event.arguments,
        };
        toolCalls.push(tc);
        options.onToolCall?.(tc);
      } else if (event.type === "done" && event.usage) {
        usage = {
          prompt_tokens: event.usage.prompt_tokens,
          completion_tokens: event.usage.completion_tokens,
        };
      } else if (event.type === "error") {
        throw new Error(event.message);
      }
    }
  };

  if (options.backend === "anthropic") {
    const anthropicMessages = options.messages.filter((m) => m.role !== "system");
    const stream = streamChatAnthropic(
      options.apiKey,
      options.model,
      options.systemPrompt,
      anthropicMessages,
      options.tools,
      options.extendedThinking,
      options.signal
    );
    await processStream(stream);
  } else if (options.backend === "deepseek") {
    const stream = streamChatDeepseek(
      options.apiKey,
      options.model,
      options.messages,
      options.tools,
      options.signal
    );
    await processStream(stream);
  } else if (options.backend === "glm") {
    const stream = streamChatGlm(
      options.apiKey,
      options.model,
      options.messages,
      options.tools,
      options.signal
    );
    await processStream(stream);
  } else if (options.backend === "kimi") {
    const stream = streamChatKimi(
      options.apiKey,
      options.model,
      options.messages,
      options.tools,
      options.signal
    );
    await processStream(stream);
  } else {
    const stream = streamChatOpenAI(
      options.baseUrl,
      options.model,
      options.messages,
      options.tools,
      options.signal,
      options.inferenceOptions,
      options.apiKey || undefined,
      options.backend === "ollama"
    );
    await processStream(stream);
  }

  return { content: fullContent, thinking: fullThinking, toolCalls, usage };
}
