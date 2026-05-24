import { describe, expect, it } from "vitest";
import {
  chatFooterProfile,
  formatMonthlyUsageLabel,
  contextBudgetTitle,
} from "../../src/lib/chatFooterProfile";

describe("chatFooterProfile", () => {
  it("ollama allows context budget edits", () => {
    expect(chatFooterProfile("ollama").contextBudgetEditable).toBe(true);
    expect(chatFooterProfile("ollama").showStreamMetrics).toBe(true);
  });

  it("llamacpp is read-only context", () => {
    const p = chatFooterProfile("llamacpp");
    expect(p.contextBudgetEditable).toBe(false);
    expect(p.contextHint).toBe("server");
  });

  it("anthropic shows monthly usage not stream metrics", () => {
    const p = chatFooterProfile("anthropic");
    expect(p.showMonthlyUsage).toBe(true);
    expect(p.showStreamMetrics).toBe(false);
    expect(p.contextBudgetEditable).toBe(false);
  });
});

describe("formatMonthlyUsageLabel", () => {
  it("formats token totals", () => {
    expect(formatMonthlyUsageLabel(12400, 3200)).toBe("12.4k in · 3.2k out this month");
  });
});

describe("contextBudgetTitle", () => {
  it("explains llamacpp server config", () => {
    const title = contextBudgetTitle(chatFooterProfile("llamacpp"), "llamacpp");
    expect(title).toContain("llama.cpp");
  });
});
