import {
  streamChat as streamOpenAI,
  type Message,
  type StreamEvent,
  type Tool,
} from "./openaiCompat";

/** Z.ai international GLM API base (see https://docs.z.ai). */
export const GLM_API_BASE = "https://api.z.ai/api/paas/v4";

/** GLM uses `/chat/completions` under paas/v4, not `/v1/chat/completions`. */
export const GLM_CHAT_COMPLETIONS_PATH = "/chat/completions";

export const GLM_MODELS = [
  { id: "glm-4-flash", name: "GLM-4 Flash", contextWindow: 128_000 },
  { id: "glm-4-plus", name: "GLM-4 Plus", contextWindow: 128_000 },
  { id: "glm-5.2", name: "GLM-5.2", contextWindow: 200_000 },
] as const;

export async function* streamChat(
  apiKey: string,
  model: string,
  messages: Message[],
  tools?: Tool[],
  signal?: AbortSignal
): AsyncGenerator<StreamEvent> {
  yield* streamOpenAI(
    GLM_API_BASE,
    model,
    messages,
    tools,
    signal,
    undefined,
    apiKey,
    false,
    GLM_CHAT_COMPLETIONS_PATH
  );
}
