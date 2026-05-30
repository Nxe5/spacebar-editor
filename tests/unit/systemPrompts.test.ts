import { describe, expect, it } from "vitest";
import {
  combinePromptContents,
  defaultPromptContentForEntry,
  defaultPromptsConfig,
  isBuiltinPromptEntry,
  normalizePromptsConfig,
  promptModesSummary,
  slugifyPromptName,
  togglePromptMode,
  uniquePromptFilename,
} from "../../src/lib/systemPrompts/config";
import type { SystemPromptEntry } from "../../src/lib/systemPrompts/types";

describe("systemPrompts config", () => {
  it("combines only enabled prompts for the active mode", () => {
    const entries: SystemPromptEntry[] = [
      {
        id: "chat",
        filename: "chat.md",
        label: "Chat",
        enabled: true,
        modes: ["chat"],
      },
      {
        id: "agent",
        filename: "agent.md",
        label: "Agent",
        enabled: true,
        modes: ["agent"],
      },
      {
        id: "global",
        filename: "global.md",
        label: "Global",
        enabled: false,
        modes: [],
      },
    ];
    const contents = {
      "chat.md": "Be concise.",
      "agent.md": "Use tools.",
      "global.md": "Always test.",
    };
    expect(combinePromptContents(entries, contents, "chat")).toContain("Be concise.");
    expect(combinePromptContents(entries, contents, "chat")).not.toContain("Use tools.");
    expect(combinePromptContents(entries, contents, "agent")).toContain("Use tools.");
  });

  it("includes prompts with no mode restriction in every mode", () => {
    const entries: SystemPromptEntry[] = [
      {
        id: "style",
        filename: "style.md",
        label: "Style",
        enabled: true,
        modes: [],
      },
    ];
    const contents = { "style.md": "Use TypeScript." };
    expect(combinePromptContents(entries, contents, "plan")).toContain("Use TypeScript.");
  });

  it("normalizes config and slugifies new prompt names", () => {
    const cfg = normalizePromptsConfig({
      prompts: [{ id: "x", filename: "bad.txt", enabled: true }],
    });
    expect(cfg.prompts).toHaveLength(3);
    expect(slugifyPromptName("My Rules!")).toBe("my-rules");
    const entries = defaultPromptsConfig().prompts;
    expect(uniquePromptFilename(entries, "agent")).toBe("agent-2.md");
  });

  it("identifies built-in mode prompts and default reset content", () => {
    const agent = defaultPromptsConfig().prompts.find((p) => p.id === "agent")!;
    expect(isBuiltinPromptEntry(agent)).toBe(true);
    expect(defaultPromptContentForEntry(agent)).toContain("agent mode");
    expect(defaultPromptContentForEntry({ ...agent, id: "custom", label: "Custom" })).toContain(
      "Custom"
    );
  });

  it("toggles mode membership for prompt entries", () => {
    const entry: SystemPromptEntry = {
      id: "agent",
      filename: "agent.md",
      label: "Agent",
      enabled: true,
      modes: ["agent"],
    };
    expect(togglePromptMode(entry, "chat", true)).toEqual(["chat", "agent"]);
    const withChat: SystemPromptEntry = { ...entry, modes: ["chat", "agent"] };
    expect(togglePromptMode(withChat, "agent", false)).toEqual(["chat"]);
    expect(promptModesSummary({ ...entry, modes: [] })).toBe("All modes");
  });
});
