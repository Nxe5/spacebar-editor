import { describe, expect, it } from "vitest";
import { diffLineKinds } from "../../src/lib/editor/diffDecorations";

describe("diffLineKinds", () => {
  it("marks unchanged lines as same", () => {
    expect(diffLineKinds("a\nb", "a\nb")).toEqual(["same", "same"]);
  });

  it("marks new lines as add", () => {
    const kinds = diffLineKinds("a", "a\nb");
    expect(kinds[0]).toBe("same");
    expect(kinds[1]).toBe("add");
  });

  it("marks replaced content", () => {
    const kinds = diffLineKinds("old", "new");
    expect(kinds[0]).not.toBe("same");
  });
});
