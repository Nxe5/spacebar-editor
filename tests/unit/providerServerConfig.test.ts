import { describe, expect, it } from "vitest";
import {
  DEFAULT_LLAMACPP_SERVER_TEMPLATE,
  DEFAULT_OLLAMA_SERVER_TEMPLATE,
  buildLlamacppExecStart,
  buildLlamacppRestartOneLiner,
  buildOllamaOverrideConf,
  buildOllamaRestartOneLiner,
  normalizeOllamaServerTemplate,
} from "../../src/lib/providerServerConfig";
import { inferenceOptionsForSettings } from "../../src/lib/inferenceOptions";

describe("providerServerConfig", () => {
  it("builds ollama override without HSA by default", () => {
    const text = buildOllamaOverrideConf(DEFAULT_OLLAMA_SERVER_TEMPLATE);
    expect(text).toContain("OLLAMA_NEW_ENGINE=0");
    expect(text).not.toContain("OLLAMA_CONTEXT_LENGTH");
    expect(text).not.toContain("HSA_OVERRIDE");
  });

  it("includes HSA override when enabled", () => {
    const text = buildOllamaOverrideConf({
      ...DEFAULT_OLLAMA_SERVER_TEMPLATE,
      useHsaOverride: true,
    });
    expect(text).toContain("HSA_OVERRIDE_GFX_VERSION=9.0.6");
  });

  it("builds llama.cpp exec from real template defaults", () => {
    const line = buildLlamacppExecStart(DEFAULT_LLAMACPP_SERVER_TEMPLATE);
    expect(line).toContain("-m /path/to/model.gguf");
    expect(line).toContain("-c 8192");
    expect(line).toContain("-ngl 99");
  });

  it("builds one-line restart commands", () => {
    expect(buildOllamaRestartOneLiner()).toBe(
      "sudo systemctl daemon-reload && sudo systemctl restart ollama"
    );
    expect(buildLlamacppRestartOneLiner(DEFAULT_LLAMACPP_SERVER_TEMPLATE)).toBe(
      "sudo systemctl daemon-reload && sudo systemctl restart llamacpp"
    );
  });

  it("normalizes partial ollama template", () => {
    expect(normalizeOllamaServerTemplate({ numThreads: 0 }).numThreads).toBe(6);
  });
});

describe("inferenceOptionsForSettings", () => {
  it("returns num_ctx for ollama backend", () => {
    const opts = inferenceOptionsForSettings({
      chatBackend: "ollama",
      selectedModel: "phi3:mini",
      ollamaModels: [{ id: "phi3:mini", name: "phi3:mini", provider: "ollama", contextWindow: 4096 }],
      llamacppModels: [],
      ollamaServerTemplate: { numThreads: 6 },
    });
    expect(opts).toEqual({ num_ctx: 4096, num_thread: 6, think: true });
  });
});
