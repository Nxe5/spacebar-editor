import { describe, expect, it } from "vitest";
import type { Message as ProviderMessage } from "../../src/lib/providers/openaiCompat";
import {
  contextBudgetLimit,
  contextUsageLevel,
  effectiveReserveTokens,
  estimateProviderMessagesTokens,
  isAgentContextBudgetExceeded,
  resolveModelContextWindow,
} from "../../src/lib/contextBudget";

describe("contextBudget", () => {
  it("uses smaller reserve for tiny Ollama contexts", () => {
    expect(effectiveReserveTokens(2048)).toBeLessThanOrEqual(512);
    expect(contextBudgetLimit(2048)).toBeGreaterThan(1500);
  });

  it("resolveModelContextWindow respects per-model Ollama num_ctx", () => {
    expect(
      resolveModelContextWindow({
        chatBackend: "ollama",
        selectedModel: "tinyllama",
        ollamaModels: [{ id: "tinyllama", name: "Tiny", provider: "ollama", contextWindow: 4096 }],
        llamacppModels: [],
        anthropicModels: [],
        deepseekModels: [],
        glmModels: [],
        kimiModels: [],
        anthropicContextBudget: null,
      })
    ).toBe(4096);
  });

  it("stops when estimated tokens exceed window minus reserve", () => {
    const window = 2048;
    const messages: ProviderMessage[] = [
      { role: "system", content: "token ".repeat(5000) },
      { role: "user", content: "hi" },
    ];
    expect(estimateProviderMessagesTokens(messages)).toBeGreaterThan(contextBudgetLimit(window));
    expect(isAgentContextBudgetExceeded(messages, window)).toBe(true);
  });

  it("resolveModelContextWindow for DeepSeek uses catalog context", () => {
    expect(
      resolveModelContextWindow({
        chatBackend: "deepseek",
        selectedModel: "deepseek-chat",
        ollamaModels: [],
        llamacppModels: [],
        anthropicModels: [],
        deepseekModels: [
          { id: "deepseek-chat", name: "DeepSeek Chat", provider: "deepseek", contextWindow: 65536 },
        ],
        anthropicContextBudget: null,
      })
    ).toBe(65536);
  });

  it("allows messages under budget", () => {
    const messages: ProviderMessage[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello" },
    ];
    expect(isAgentContextBudgetExceeded(messages, 8192)).toBe(false);
  });

  describe("contextUsageLevel", () => {
    it("returns healthy below 70%", () => {
      expect(contextUsageLevel(6000, 10000)).toBe("healthy");
      expect(contextUsageLevel(0, 10000)).toBe("healthy");
    });

    it("returns warning at 70–90%", () => {
      expect(contextUsageLevel(7000, 10000)).toBe("warning");
      expect(contextUsageLevel(8999, 10000)).toBe("warning");
    });

    it("returns critical at 90%+", () => {
      expect(contextUsageLevel(9000, 10000)).toBe("critical");
      expect(contextUsageLevel(10000, 10000)).toBe("critical");
    });

    it("returns healthy when budgetLimit is 0", () => {
      expect(contextUsageLevel(5000, 0)).toBe("healthy");
    });
  });
});
