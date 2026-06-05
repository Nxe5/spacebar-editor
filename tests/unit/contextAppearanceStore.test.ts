import { describe, expect, it, beforeEach } from "vitest";
import { contextAppearance } from "../../src/lib/stores/contextAppearance";

function mockLocalStorage() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  return storage;
}

describe("contextAppearance store", () => {
  beforeEach(() => {
    mockLocalStorage().clear();
  });

  it("init does not throw without saved overrides", () => {
    expect(() => contextAppearance.init()).not.toThrow();
    expect(contextAppearance.get().baseModePrompt).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("init loads saved overrides", () => {
    localStorage.setItem(
      "sidebar.contextAppearance.v1",
      JSON.stringify({ baseModePrompt: "#112233" })
    );
    contextAppearance.init();
    expect(contextAppearance.get().baseModePrompt).toBe("#112233");
  });
});
