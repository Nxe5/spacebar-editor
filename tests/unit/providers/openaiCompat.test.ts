import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  streamChat,
  fetchModels,
  DEFAULT_ENDPOINTS,
  type Message,
  type StreamEvent,
} from "../../../src/lib/providers/openaiCompat";

async function collect<T>(gen: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of gen) out.push(x);
  return out;
}

function createMockResponse(
  body: string,
  options: { ok?: boolean; status?: number } = {}
): Response {
  const { ok = true, status = 200 } = options;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });

  return {
    ok,
    status,
    body: stream,
    text: async () => body,
  } as Response;
}

function sseChunk(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

describe("openaiCompat", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("DEFAULT_ENDPOINTS", () => {
    it("has correct defaults for Ollama", () => {
      expect(DEFAULT_ENDPOINTS.ollama).toBe("http://localhost:11434");
    });

    it("has correct defaults for LM Studio", () => {
      expect(DEFAULT_ENDPOINTS.lmstudio).toBe("http://localhost:1234");
    });

    it("has correct defaults for llama.cpp", () => {
      expect(DEFAULT_ENDPOINTS.llamacpp).toBe("http://localhost:8080");
    });
  });

  describe("streamChat", () => {
    it("constructs correct URL with trailing slash normalization", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        createMockResponse("data: [DONE]\n\n")
      );
      global.fetch = mockFetch;

      await collect(streamChat("http://localhost:11434/", "model", []));

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:11434/v1/chat/completions",
        expect.any(Object)
      );
    });

    it("sends correct request body with messages", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        createMockResponse("data: [DONE]\n\n")
      );
      global.fetch = mockFetch;

      const messages: Message[] = [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hello" },
      ];

      await collect(streamChat("http://localhost:11434", "gpt-4", messages));

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.model).toBe("gpt-4");
      expect(body.messages).toEqual(messages);
      expect(body.stream).toBe(true);
      expect(body.stream_options).toEqual({ include_usage: true });
    });

    it("includes tools in request when provided", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        createMockResponse("data: [DONE]\n\n")
      );
      global.fetch = mockFetch;

      const tools = [
        {
          type: "function" as const,
          function: {
            name: "test_tool",
            description: "A test tool",
            parameters: { type: "object" as const, properties: {} },
          },
        },
      ];

      await collect(streamChat("http://localhost:11434", "model", [], tools));

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.tools).toEqual(tools);
    });

    it("does not include tools when array is empty", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        createMockResponse("data: [DONE]\n\n")
      );
      global.fetch = mockFetch;

      await collect(streamChat("http://localhost:11434", "model", [], []));

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.tools).toBeUndefined();
    });

    it("yields thinking_delta for reasoning_content", async () => {
      const body =
        sseChunk({
          id: "1",
          object: "chat.completion.chunk",
          created: 123,
          model: "test",
          choices: [{ index: 0, delta: { reasoning_content: "Hmm…" } }],
        }) +
        "data: [DONE]\n\n";

      global.fetch = vi.fn().mockResolvedValue(createMockResponse(body));

      const events = await collect(
        streamChat("http://localhost:11434", "model", [], undefined, undefined, { think: true }, undefined, true)
      );

      const thinking = events.filter(
        (e): e is Extract<StreamEvent, { type: "thinking_delta" }> => e.type === "thinking_delta"
      );
      expect(thinking).toHaveLength(1);
      expect(thinking[0].content).toBe("Hmm…");

      const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(JSON.parse(options.body as string).think).toBe(true);
    });

    it("yields delta events for content", async () => {
      const body =
        sseChunk({
          id: "1",
          object: "chat.completion.chunk",
          created: 123,
          model: "test",
          choices: [{ index: 0, delta: { content: "Hello" } }],
        }) +
        sseChunk({
          id: "1",
          object: "chat.completion.chunk",
          created: 123,
          model: "test",
          choices: [{ index: 0, delta: { content: " world" } }],
        }) +
        "data: [DONE]\n\n";

      global.fetch = vi.fn().mockResolvedValue(createMockResponse(body));

      const events = await collect(streamChat("http://localhost:11434", "model", []));

      const deltas = events.filter((e): e is Extract<StreamEvent, { type: "delta" }> => e.type === "delta");
      expect(deltas).toHaveLength(2);
      expect(deltas[0].content).toBe("Hello");
      expect(deltas[1].content).toBe(" world");
    });

    it("handles tool calls with streaming arguments", async () => {
      const body =
        sseChunk({
          id: "1",
          object: "chat.completion.chunk",
          created: 123,
          model: "test",
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  { index: 0, id: "call_123", type: "function", function: { name: "read_file" } },
                ],
              },
            },
          ],
        }) +
        sseChunk({
          id: "1",
          object: "chat.completion.chunk",
          created: 123,
          model: "test",
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [{ index: 0, function: { arguments: '{"path":' } }],
              },
            },
          ],
        }) +
        sseChunk({
          id: "1",
          object: "chat.completion.chunk",
          created: 123,
          model: "test",
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [{ index: 0, function: { arguments: '"test.txt"}' } }],
              },
              finish_reason: "tool_calls",
            },
          ],
        }) +
        "data: [DONE]\n\n";

      global.fetch = vi.fn().mockResolvedValue(createMockResponse(body));

      const events = await collect(streamChat("http://localhost:11434", "model", []));

      const toolCalls = events.filter(
        (e): e is Extract<StreamEvent, { type: "tool_call" }> => e.type === "tool_call"
      );
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0].id).toBe("call_123");
      expect(toolCalls[0].name).toBe("read_file");
      expect(toolCalls[0].arguments).toBe('{"path":"test.txt"}');
    });

    it("yields usage from a final usage-only chunk", async () => {
      const body =
        sseChunk({
          id: "1",
          object: "chat.completion.chunk",
          created: 123,
          model: "test",
          choices: [{ index: 0, delta: { content: "Hi" } }],
        }) +
        sseChunk({
          id: "1",
          object: "chat.completion.chunk",
          created: 123,
          model: "test",
          choices: [],
          usage: { prompt_tokens: 42, completion_tokens: 7, total_tokens: 49 },
        }) +
        "data: [DONE]\n\n";

      global.fetch = vi.fn().mockResolvedValue(createMockResponse(body));

      const events = await collect(streamChat("http://localhost:11434", "model", []));

      const doneWithUsage = events.find(
        (e): e is Extract<StreamEvent, { type: "done" }> => e.type === "done" && Boolean(e.usage)
      );
      expect(doneWithUsage?.usage).toEqual({
        prompt_tokens: 42,
        completion_tokens: 7,
      });
    });

    it("yields usage when provided in chunk", async () => {
      const body = sseChunk({
        id: "1",
        object: "chat.completion.chunk",
        created: 123,
        model: "test",
        choices: [{ index: 0, delta: { content: "Hi" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }) + "data: [DONE]\n\n";

      global.fetch = vi.fn().mockResolvedValue(createMockResponse(body));

      const events = await collect(streamChat("http://localhost:11434", "model", []));

      const doneEvents = events.filter(
        (e): e is Extract<StreamEvent, { type: "done" }> => e.type === "done"
      );
      const doneWithUsage = doneEvents.find((e) => e.usage);
      expect(doneWithUsage?.usage).toEqual({
        prompt_tokens: 10,
        completion_tokens: 5,
      });
    });

    it("yields error for network failures", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

      const events = await collect(streamChat("http://localhost:11434", "model", []));

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("error");
      expect((events[0] as { message: string }).message).toContain("Network error");
    });

    it("yields error for non-OK response", async () => {
      global.fetch = vi.fn().mockResolvedValue(
        createMockResponse("Server error", { ok: false, status: 500 })
      );

      const events = await collect(streamChat("http://localhost:11434", "model", []));

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("error");
      expect((events[0] as { message: string }).message).toContain("API error 500");
    });

    it("handles AbortSignal gracefully", async () => {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      global.fetch = vi.fn().mockRejectedValue(abortError);

      const controller = new AbortController();
      const events = await collect(
        streamChat("http://localhost:11434", "model", [], undefined, controller.signal)
      );

      expect(events).toHaveLength(0);
    });

    it("includes inference options when provided", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        createMockResponse("data: [DONE]\n\n")
      );
      global.fetch = mockFetch;

      await collect(
        streamChat("http://localhost:11434", "model", [], undefined, undefined, {
          num_ctx: 4096,
          num_thread: 6,
        }, undefined, true)
      );

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.options).toEqual({ num_ctx: 4096, num_thread: 6 });
    });

    it("yields done event at end of stream", async () => {
      const body =
        sseChunk({
          id: "1",
          object: "chat.completion.chunk",
          created: 123,
          model: "test",
          choices: [{ index: 0, delta: { content: "Hi" } }],
        }) +
        "data: [DONE]\n\n";

      global.fetch = vi.fn().mockResolvedValue(createMockResponse(body));

      const events = await collect(streamChat("http://localhost:11434", "model", []));

      const lastEvent = events[events.length - 1];
      expect(lastEvent.type).toBe("done");
    });

    it("skips malformed JSON lines gracefully", async () => {
      const body =
        "data: {invalid json}\n\n" +
        sseChunk({
          id: "1",
          object: "chat.completion.chunk",
          created: 123,
          model: "test",
          choices: [{ index: 0, delta: { content: "Valid" } }],
        }) +
        "data: [DONE]\n\n";

      global.fetch = vi.fn().mockResolvedValue(createMockResponse(body));

      const events = await collect(streamChat("http://localhost:11434", "model", []));

      const deltas = events.filter((e) => e.type === "delta");
      expect(deltas).toHaveLength(1);
      expect((deltas[0] as { content: string }).content).toBe("Valid");
    });
  });

  describe("fetchModels", () => {
    it("returns array of models on success", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: "model1" }, { id: "model2" }],
        }),
      });

      const models = await fetchModels("http://localhost:11434");

      expect(models).toEqual([
        { id: "model1", name: "model1" },
        { id: "model2", name: "model2" },
      ]);
    });

    it("returns empty array on error", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false });

      const models = await fetchModels("http://localhost:11434");

      expect(models).toEqual([]);
    });

    it("returns empty array on network failure", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const models = await fetchModels("http://localhost:11434");

      expect(models).toEqual([]);
    });

    it("constructs correct URL", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: false });
      global.fetch = mockFetch;

      await fetchModels("http://localhost:11434/");

      expect(mockFetch).toHaveBeenCalledWith("http://localhost:11434/v1/models");
    });
  });
});
