import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";
import { chat } from "../../src/lib/stores/chat";
import { workbench } from "../../src/lib/stores/workbench";
import { files } from "../../src/lib/stores/files";
import {
  buildProjectStateSnapshot,
  parseProjectState,
  resetProjectStateTrackingForTests,
  switchProjectWorkspace,
} from "../../src/lib/projectState";

const mockListDir = vi.fn();
const mockReadProjectState = vi.fn();
const mockWriteProjectState = vi.fn();
const mockReadFile = vi.fn();

vi.mock("../../src/lib/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/ipc")>();
  return {
    ...actual,
    isTauriAvailable: () => true,
    listDir: (...args: unknown[]) => mockListDir(...args),
    readProjectState: (...args: unknown[]) => mockReadProjectState(...args),
    writeProjectState: (...args: unknown[]) => mockWriteProjectState(...args),
    readFile: (...args: unknown[]) => mockReadFile(...args),
    getLanguageFromPath: () => "plaintext",
  };
});

vi.mock("../../src/lib/stores/toolPolicy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/stores/toolPolicy")>();
  return {
    ...actual,
    reloadProjectTools: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../../src/lib/stores/systemPrompts", () => ({
  systemPrompts: { load: vi.fn().mockResolvedValue(undefined), clear: vi.fn() },
}));

vi.mock("../../src/lib/stores/skills", () => ({
  skills: { load: vi.fn().mockResolvedValue(undefined), clear: vi.fn() },
}));

vi.mock("../../src/lib/workspaceTrust", async () => {
  const { writable } = await import("svelte/store");
  return { workspaceRestricted: writable(false) };
});

vi.mock("svelte-sonner", () => ({
  toast: { message: vi.fn() },
}));

describe("projectState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetProjectStateTrackingForTests();
    workbench.reset();
    files.resetForTests();
    chat.replaceProjectState({
      sessions: [
        {
          id: "s1",
          title: "Proj A chat",
          messages: [{ id: "m1", role: "user", content: "hi", timestamp: 1 }],
          updatedAt: 1,
        },
      ],
      history: [],
      activeSessionId: "s1",
    });
    mockListDir.mockResolvedValue([{ name: "readme.md", path: "/proj-a/readme.md", is_dir: false }]);
    mockReadFile.mockResolvedValue("# readme");
  });

  it("parseProjectState rejects invalid JSON", () => {
    expect(parseProjectState("not json")).toBeNull();
    expect(parseProjectState('{"version":99}')).toBeNull();
  });

  it("snapshot only includes editor tabs under workspace", () => {
    files.setWorkspacePath("/proj-a");
    workbench.openEditorFile({
      path: "/proj-a/src/a.ts",
      name: "a.ts",
      content: "x",
      isDirty: false,
      language: "typescript",
    });
    workbench.addTerminalTab("pty-1");
    workbench.openEditorFile({
      path: "/other/b.ts",
      name: "b.ts",
      content: "y",
      isDirty: false,
      language: "typescript",
    });

    const snap = buildProjectStateSnapshot("/proj-a");
    expect(snap.workbench.tabs).toHaveLength(1);
    expect(snap.workbench.tabs[0].path).toBe("/proj-a/src/a.ts");
    expect(snap.chat.sessions[0].title).toBe("Proj A chat");
  });

  it("switchProjectWorkspace saves old project and loads new chat state", async () => {
    mockReadProjectState.mockImplementation(async (ws: string) => {
      if (ws === "/proj-a") {
        return JSON.stringify({
          version: 1,
          chat: {
            sessions: [
              {
                id: "s1",
                title: "Proj A chat",
                messages: [{ id: "m1", role: "user", content: "hi", timestamp: 1 }],
                updatedAt: 1,
              },
            ],
            history: [],
            activeSessionId: "s1",
          },
          workbench: { tabs: [], activeTabId: null },
        });
      }
      if (ws === "/proj-b") {
        return JSON.stringify({
          version: 1,
          chat: {
            sessions: [
              {
                id: "b1",
                title: "Proj B chat",
                messages: [],
                updatedAt: 2,
              },
            ],
            history: [],
            activeSessionId: "b1",
          },
          workbench: { tabs: [], activeTabId: null },
        });
      }
      return null;
    });

    await switchProjectWorkspace("/proj-a");
    expect(get(files).workspacePath).toBe("/proj-a");
    expect(get(chat).sessions[0].title).toBe("Proj A chat");

    chat.addMessage({ role: "user", content: "only in A" });
    await switchProjectWorkspace("/proj-b");

    expect(mockWriteProjectState).toHaveBeenCalled();
    const written = mockWriteProjectState.mock.calls[0][1] as string;
    expect(written).toContain("only in A");

    expect(get(chat).sessions[0].title).toBe("Proj B chat");
    expect(get(files).workspacePath).toBe("/proj-b");
  });

  it("clears stale open files/tabs on the first real open (from preview)", async () => {
    // Simulate the welcome preview leaving a buffer + tab open with no active
    // workspace tracked yet (activeWorkspace stays null until switch).
    workbench.openEditorFile({
      path: "/dev/preview/scratch.ts",
      name: "scratch.ts",
      content: "stale",
      isDirty: false,
      language: "typescript",
    });
    expect(get(files).openFiles).toHaveLength(1);
    expect(get(workbench).tabs).toHaveLength(1);

    mockReadProjectState.mockResolvedValue(null); // new project, no saved state

    await switchProjectWorkspace("/proj-a");

    expect(get(files).workspacePath).toBe("/proj-a");
    expect(get(files).openFiles).toHaveLength(0);
    expect(get(workbench).tabs).toHaveLength(0);
    expect(get(workbench).activeTabId).toBeNull();
  });
});
