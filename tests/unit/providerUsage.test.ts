import { describe, expect, it, beforeEach } from "vitest";
import { providerUsage } from "../../src/lib/stores/providerUsage";

describe("providerUsage", () => {
  beforeEach(() => {
    providerUsage.resetForTests();
  });

  it("accumulates tokens per provider", () => {
    providerUsage.record("anthropic", 100, 50);
    providerUsage.record("anthropic", 200, 25);
    const totals = providerUsage.getMonthly("anthropic");
    expect(totals.inputTokens).toBe(300);
    expect(totals.outputTokens).toBe(75);
  });

  it("ignores zero usage", () => {
    providerUsage.record("anthropic", 0, 0);
    expect(providerUsage.getMonthly("anthropic").inputTokens).toBe(0);
  });
});
