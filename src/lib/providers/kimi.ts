import {
  streamChat as streamOpenAI,
  type Message,
  type StreamEvent,
  type Tool,
} from "./openaiCompat";

/** Moonshot Kimi OpenAI-compatible API (see https://platform.moonshot.ai/docs). */
export const KIMI_API_BASE = "https://api.moonshot.ai";

export const KIMI_MODELS = [
  { id: "kimi-k2.5", name: "Kimi K2.5", contextWindow: 262_144 },
  { id: "kimi-k2-turbo-preview", name: "Kimi K2 Turbo", contextWindow: 262_144 },
] as const;

export async function* streamChat(
  apiKey: string,
  model: string,
  messages: Message[],
  tools?: Tool[],
  signal?: AbortSignal
): AsyncGenerator<StreamEvent> {
  yield* streamOpenAI(
    KIMI_API_BASE,
    model,
    messages,
    tools,
    signal,
    undefined,
    apiKey,
    false,
    "/v1/chat/completions",
    { toolChoice: "auto", parallelToolCalls: true }
  );
}
