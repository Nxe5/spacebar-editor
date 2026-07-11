import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  streamChat,
  KIMI_API_BASE,
  KIMI_MODELS,
} from "../../../src/lib/providers/kimi";
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

describe("kimi provider", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("exports models and API base", () => {
    expect(KIMI_API_BASE).toBe("https://api.moonshot.ai");
    expect(KIMI_MODELS.map((m) => m.id)).toContain("kimi-k2.5");
  });

  it("sends Bearer auth to Kimi chat completions", async () => {
    const sse = 'data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n';
    vi.mocked(global.fetch).mockResolvedValue(createMockResponse(sse));

    const events = await collect(
      streamChat("sk-kimi-key", "kimi-k2.5", [{ role: "user", content: "Hello" }])
    );

    expect(global.fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${KIMI_API_BASE}/v1/chat/completions`);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-kimi-key");
    expect(events.some((e: StreamEvent) => e.type === "delta")).toBe(true);
  });

  it("requests tool_choice auto when tools are provided", async () => {
    const sse = 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n';
    vi.mocked(global.fetch).mockResolvedValue(createMockResponse(sse));

    await collect(
      streamChat(
        "sk-kimi-key",
        "kimi-k2.5",
        [{ role: "user", content: "Hello" }],
        [
          {
            type: "function",
            function: {
              name: "read_file",
              description: "Read a file",
              parameters: { type: "object", properties: { path: { type: "string" } } },
            },
          },
        ]
      )
    );

    const [, init] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.tool_choice).toBe("auto");
    expect(body.tools).toHaveLength(1);
  });
});
