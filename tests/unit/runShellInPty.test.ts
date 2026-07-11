import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRunShell = vi.fn();
const mockCreateOutputTab = vi.fn();
const mockRequestBottomPanelOpen = vi.fn();

vi.mock("../../src/lib/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/ipc")>();
  return {
    ...actual,
    runShell: (...args: unknown[]) => mockRunShell(...args),
    isTauriAvailable: () => true,
  };
});

vi.mock("../../src/lib/stores/bottomTerminals", () => ({
  bottomTerminals: {
    createOutputTab: (...args: unknown[]) => mockCreateOutputTab(...args),
  },
}));

vi.mock("../../src/lib/stores/bottomPanel", () => ({
  requestBottomPanelOpen: () => mockRequestBottomPanelOpen(),
}));

import { runShellWithTerminalVisibility } from "../../src/lib/terminal/runShellInPty";

describe("runShellWithTerminalVisibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunShell.mockResolvedValue({
      stdout: "v20.0.0\n",
      stderr: "",
      exit_code: 0,
      timed_out: false,
    });
    mockCreateOutputTab.mockReturnValue({
      id: "tab-1",
      sessionId: "",
      title: "node -v",
      source: "agent",
      output: "$ node -v\n",
    });
  });

  it("uses piped run_shell instead of injecting into interactive login shell", async () => {
    const result = await runShellWithTerminalVisibility("/tmp/ws", "node -v", 30_000);

    expect(mockRunShell).toHaveBeenCalledWith("/tmp/ws", "node -v", 30_000);
    expect(result.exit_code).toBe(0);
    expect(result.stdout).toContain("v20.0.0");
  });

  it("mirrors piped output to a read-only agent tab", async () => {
    await runShellWithTerminalVisibility("/tmp/ws", "node -v");

    expect(mockRequestBottomPanelOpen).toHaveBeenCalled();
    expect(mockCreateOutputTab).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "agent",
        title: "node -v",
        output: expect.stringContaining("$ node -v"),
      })
    );
    expect(mockCreateOutputTab).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.stringContaining("[exit 0]"),
      })
    );
  });
});
