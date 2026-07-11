import { describe, expect, it } from "vitest";
import {
  chunkIntoRows,
  mergeCloudModelCatalog,
  modelsVisibleInPicker,
} from "../../src/lib/modelPicker";
import { cloudProviderMenuReady } from "../../src/lib/chatModelMenu";

describe("modelPicker", () => {
  it("chunks items into grid rows", () => {
    expect(chunkIntoRows([1, 2, 3, 4, 5], 3)).toEqual([[1, 2, 3], [4, 5]]);
  });

  it("filters models hidden from the chat picker", () => {
    const models = [
      { id: "a", name: "A", provider: "anthropic" as const, contextWindow: 1, showInPicker: true },
      { id: "b", name: "B", provider: "anthropic" as const, contextWindow: 1, showInPicker: false },
    ];
    expect(modelsVisibleInPicker(models).map((m) => m.id)).toEqual(["a"]);
  });

  it("preserves picker toggles when merging catalogs", () => {
    const prev = [
      {
        id: "claude-3-5-haiku-20241022",
        name: "Haiku",
        provider: "anthropic" as const,
        contextWindow: 200_000,
        showInPicker: false,
      },
    ];
    const fetched = [
      {
        id: "claude-3-5-haiku-20241022",
        name: "Claude 3.5 Haiku",
        provider: "anthropic" as const,
        contextWindow: 200_000,
      },
    ];
    const merged = mergeCloudModelCatalog(prev, fetched);
    expect(merged[0]?.showInPicker).toBe(false);
    expect(merged[0]?.name).toBe("Claude 3.5 Haiku");
  });

  it("cloudProviderMenuReady requires key, fetch, and visible models", () => {
    const models = [
      { id: "deepseek-chat", name: "Chat", provider: "deepseek" as const, contextWindow: 65_536 },
    ];
    expect(cloudProviderMenuReady("sk-" + "x".repeat(24), models, true)).toBe(true);
    expect(cloudProviderMenuReady("", models, true)).toBe(false);
    expect(cloudProviderMenuReady("sk-" + "x".repeat(24), models, false)).toBe(false);
    expect(
      cloudProviderMenuReady("sk-" + "x".repeat(24), [{ ...models[0], showInPicker: false }], true)
    ).toBe(false);
  });
});
