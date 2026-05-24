import { describe, expect, it } from "vitest";
import { middleClickScroll } from "../../src/lib/editor/middleClickScroll";

describe("middleClickScroll", () => {
  it("returns a CodeMirror extension", () => {
    const ext = middleClickScroll();
    expect(ext).toBeTruthy();
    expect(typeof ext).toBe("object");
  });
});
