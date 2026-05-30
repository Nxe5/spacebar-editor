import { describe, expect, it } from "vitest";
import {
  buildCompactionModelOptions,
  encodeCompactionModelRef,
  parseCompactionModelRef,
  resolveCompactionTarget,
} from "../../src/lib/compactionModel";
import type { ModelConfig } from "../../src/lib/stores/settings";

const ollamaModels: ModelConfig[] = [
  { id: "phi4", name: "Phi-4", provider: "ollama", contextWindow: 8192 },
];
const anthropicModels: ModelConfig[] = [
  { id: "claude-sonnet", name: "Claude Sonnet", provider: "anthropic", contextWindow: 128000 },
];

describe("compactionModel", () => {
  it("encodes and parses provider:model refs", () => {
    const ref = encodeCompactionModelRef("ollama", "phi4:latest");
    expect(ref).toBe("ollama:phi4:latest");
    expect(parseCompactionModelRef(ref)).toEqual({ backend: "ollama", modelId: "phi4:latest" });
    expect(parseCompactionModelRef("bad")).toBeNull();
  });

  it("lists models from all providers for settings picker", () => {
    const opts = buildCompactionModelOptions({
      ollamaModels,
      llamacppModels: [{ id: "qwen", name: "Qwen", provider: "llamacpp", contextWindow: 4096 }],
      anthropicModels,
      deepseekModels: [],
    });
    expect(opts.map((o) => o.value)).toContain("ollama:phi4");
    expect(opts.map((o) => o.value)).toContain("anthropic:claude-sonnet");
  });

  it("defaults compaction target to active chat model", () => {
    const target = resolveCompactionTarget({
      chatBackend: "ollama",
      selectedModel: "phi4",
      agentCompaction: { useActiveChatModel: true },
      modelRoles: { compaction: null },
      ollamaModels,
      llamacppModels: [],
      anthropicModels: [],
      deepseekModels: [],
      apiKeys: { anthropic: "", deepseek: "" },
    });
    expect(target.usesActiveChatModel).toBe(true);
    expect(target.backend).toBe("ollama");
    expect(target.modelId).toBe("phi4");
  });

  it("resolves override compaction model", () => {
    const target = resolveCompactionTarget({
      chatBackend: "ollama",
      selectedModel: "phi4",
      agentCompaction: { useActiveChatModel: false },
      modelRoles: { compaction: "anthropic:claude-sonnet" },
      ollamaModels,
      llamacppModels: [],
      anthropicModels,
      deepseekModels: [],
      apiKeys: { anthropic: "key", deepseek: "" },
    });
    expect(target.usesActiveChatModel).toBe(false);
    expect(target.backend).toBe("anthropic");
    expect(target.modelId).toBe("claude-sonnet");
  });
});
