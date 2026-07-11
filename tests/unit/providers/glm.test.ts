import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  streamChat,
  GLM_API_BASE,
  GLM_CHAT_COMPLETIONS_PATH,
  GLM_MODELS,
} from "../../../src/lib/providers/glm";
import type { StreamEvent } from "../../../src/lib/providers/openaiCompat";

async function collect<T>(gen: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of gen) out.push(x);
  return out;
}

function createMockResponse(body: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  return {
    ok: true,
    status: 200,
    body: stream,
    text: async () => body,
  } as Response;
}

describe("glm provider", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("exports models and API base", () => {
    expect(GLM_API_BASE).toBe("https://api.z.ai/api/paas/v4");
    expect(GLM_CHAT_COMPLETIONS_PATH).toBe("/chat/completions");
    expect(GLM_MODELS.map((m) => m.id)).toContain("glm-4-flash");
  });

  it("sends Bearer auth to GLM chat completions", async () => {
    const sse = 'data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n';
    vi.mocked(global.fetch).mockResolvedValue(createMockResponse(sse));

    const events = await collect(
      streamChat("glm-test-key", "glm-4-flash", [{ role: "user", content: "Hello" }])
    );

    expect(global.fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${GLM_API_BASE}${GLM_CHAT_COMPLETIONS_PATH}`);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer glm-test-key");
    expect(events.some((e: StreamEvent) => e.type === "delta")).toBe(true);
  });
});
