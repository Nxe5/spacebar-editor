import { describe, expect, it } from "vitest";
import { resolveReadFileMaxLines, normalizeReadFileCap } from "../../src/lib/readFileCap";
import { StallTracker, argsHash } from "../../src/lib/agent/stallDetection";
import { assembleSystemPrompt, assemblyTotalTokens } from "../../src/lib/agent/systemPrompt/assemble";
import {
  resolveActiveModelSettings,
  normalizeProviderModelDefaults,
} from "../../src/lib/modelSettings";
import type { SettingsState } from "../../src/lib/stores/settings";

describe("readFileCap", () => {
  it("uses fixed line cap in lines mode", () => {
    const cap = normalizeReadFileCap({ mode: "lines", maxLines: 500 });
    expect(resolveReadFileMaxLines(cap, 32_768)).toBe(500);
  });

  it("converts percent of context window to lines with minimum", () => {
    const cap = normalizeReadFileCap({ mode: "percent", maxPercent: 5 });
    // 32768 * 0.05 = 1638 tokens / 20 = 81 lines
    expect(resolveReadFileMaxLines(cap, 32_768)).toBe(81);
    expect(resolveReadFileMaxLines(cap, 4_096)).toBe(50);
  });

  it("honors explicit request max_lines", () => {
    const cap = normalizeReadFileCap({});
    expect(resolveReadFileMaxLines(cap, 32_768, 120)).toBe(120);
  });
});

describe("stallDetection", () => {
  it("nudges on second identical call and aborts on third", () => {
    const tracker = new StallTracker();
    const args = { path: "foo.ts" };
    expect(tracker.record("read_file", args)).toBe("none");
    expect(tracker.record("read_file", args)).toBe("nudge");
    expect(tracker.record("read_file", args)).toBe("abort");
  });

  it("hashes args deterministically", () => {
    expect(argsHash({ b: 1, a: 2 })).toBe(argsHash({ a: 2, b: 1 }));
  });
});

describe("assembleSystemPrompt", () => {
  const baseSettings = {
    chatBackend: "ollama",
    selectedModel: "test",
    includeWorkspaceInChat: false,
    ollamaModels: [
      {
        id: "test",
        name: "Test",
        provider: "ollama" as const,
        contextWindow: 32_768,
        showInPicker: true,
        toolCallFormat: "text_fallback" as const,
        parallelToolCalls: true,
        promptVerbosity: "standard" as const,
      },
    ],
    providerModelDefaults: normalizeProviderModelDefaults(undefined),
  } as unknown as SettingsState;

  it("omits workspace in chat when toggle is off", () => {
    const { sections, prompt } = assembleSystemPrompt({
      mode: "chat",
      workspacePath: "/tmp/ws",
      includeWorkspaceInChat: false,
      userPromptText: "",
      toolsEnabled: false,
      modelSettings: resolveActiveModelSettings(baseSettings),
    });
    expect(sections.some((s) => s.label === "Workspace context")).toBe(false);
    expect(prompt).not.toContain("/tmp/ws");
  });

  it("includes tool instructions for agent mode", () => {
    const { sections } = assembleSystemPrompt({
      mode: "agent",
      workspacePath: null,
      includeWorkspaceInChat: false,
      userPromptText: "Be concise.",
      toolsEnabled: true,
      modelSettings: resolveActiveModelSettings(baseSettings),
    });
    expect(sections.some((s) => s.label.startsWith("Tool instructions"))).toBe(true);
    expect(sections.some((s) => s.label === "System prompts")).toBe(true);
    expect(assemblyTotalTokens(sections)).toBeGreaterThan(0);
  });
});
