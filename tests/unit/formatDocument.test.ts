import { describe, expect, it } from "vitest";
import {
  formatWithPrettier,
  isPrettierSupportedPath,
  prettierParserForPath,
} from "../../src/lib/editor/formatDocument";

describe("formatDocument", () => {
  it("detects supported extensions", () => {
    expect(isPrettierSupportedPath("src/foo.ts")).toBe(true);
    expect(isPrettierSupportedPath("README.md")).toBe(true);
    expect(isPrettierSupportedPath("main.rs")).toBe(false);
  });

  it("maps paths to parsers", () => {
    expect(prettierParserForPath("a.tsx")).toBe("typescript");
    expect(prettierParserForPath("a.json")).toBe("json");
    expect(prettierParserForPath("a.css")).toBe("css");
  });

  it("formats JSON", async () => {
    const out = await formatWithPrettier('{"a":1}', "test.json");
    expect(out).toContain('"a"');
    expect(out).toMatch(/\n/);
  });

  it("formats TypeScript", async () => {
    const out = await formatWithPrettier("const x=1", "test.ts");
    expect(out).toContain("const x");
  });
});
