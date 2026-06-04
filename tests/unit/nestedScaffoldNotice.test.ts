import { describe, expect, it } from "vitest";
import {
  topLevelDirsFromShellCommand,
  topLevelDirFromWritePath,
} from "../../src/lib/agent/nestedScaffoldNotice";

describe("nestedScaffoldNotice", () => {
  it("extracts mkdir top-level dirs", () => {
    expect(
      topLevelDirsFromShellCommand("mkdir -p tester && cd tester", "/home/proj")
    ).toContain("tester");
  });

  it("extracts write path top-level dir", () => {
    expect(
      topLevelDirFromWritePath("/home/proj", "/home/proj/tester/app/main.ts")
    ).toBe("tester");
  });
});
