import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { get } from "svelte/store";
import { AGENT_TERMINAL_AUTO_CLOSE_MS, bottomTerminals } from "../../src/lib/stores/bottomTerminals";
import { ptyCreate } from "../../src/lib/ipc";

vi.mock("../../src/lib/ipc", () => ({
  isTauriAvailable: () => true,
  ptyCreate: vi.fn(async () => "pty-uuid-1"),
  ptyClose: vi.fn(async () => undefined),
}));

describe("bottomTerminals", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    bottomTerminals.resetForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates user tabs with incrementing titles", async () => {
    vi.mocked((await import("../../src/lib/ipc")).ptyCreate)
      .mockResolvedValueOnce("pty-a")
      .mockResolvedValueOnce("pty-b");

    await bottomTerminals.createTab({ source: "user" });
    await bottomTerminals.createTab({ source: "user" });

    const state = get({ subscribe: bottomTerminals.subscribe });
    expect(state.tabs.map((t) => t.title)).toEqual(["Terminal", "Terminal 2"]);
  });

  it("creates read-only agent output tabs without a PTY", () => {
    const tab = bottomTerminals.createOutputTab({
      source: "agent",
      title: "pnpm install && pnpm dev",
      output: "$ pnpm install\n[exit 0]\n",
    });

    const state = get({ subscribe: bottomTerminals.subscribe });
    expect(tab?.source).toBe("agent");
    expect(tab?.sessionId).toBe("");
    expect(tab?.output).toContain("[exit 0]");
    expect(state.tabs).toHaveLength(1);
    expect(vi.mocked(ptyCreate)).not.toHaveBeenCalled();
  });

  it("truncates long agent command titles via caller", () => {
    const long = "npx create-vite@latest my-public-adjuster-website --template react";
    const truncated = long.length <= 28 ? long : `${long.slice(0, 25)}…`;
    bottomTerminals.createOutputTab({
      source: "agent",
      title: truncated,
      output: "$ cmd\n",
    });

    const state = get({ subscribe: bottomTerminals.subscribe });
    expect(state.tabs[0]?.title.endsWith("…")).toBe(true);
    expect((state.tabs[0]?.title.length ?? 0)).toBeLessThanOrEqual(28);
  });

  it("auto-closes agent output tabs after the default delay", () => {
    bottomTerminals.createOutputTab({
      output: "$ node -v\nv20\n[exit 0]\n",
    });

    expect(get({ subscribe: bottomTerminals.subscribe }).tabs).toHaveLength(1);

    vi.advanceTimersByTime(AGENT_TERMINAL_AUTO_CLOSE_MS);
    expect(get({ subscribe: bottomTerminals.subscribe }).tabs).toHaveLength(0);
  });

  it("replaces prior agent tabs when a new output tab is created", () => {
    bottomTerminals.createOutputTab({ title: "first", output: "$ a\n" });
    bottomTerminals.createOutputTab({ title: "second", output: "$ b\n" });

    const state = get({ subscribe: bottomTerminals.subscribe });
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.title).toBe("second");
  });
});
