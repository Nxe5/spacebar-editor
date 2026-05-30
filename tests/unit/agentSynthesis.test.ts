import { describe, expect, it } from "vitest";
import {
  modelDeliveredSubstantiveReply,
  shouldRunSynthesis,
} from "../../src/lib/agent/synthesis";

describe("shouldRunSynthesis", () => {
  it("runs when tools executed but no summary delivered", () => {
    expect(shouldRunSynthesis(false, 2)).toBe(true);
  });

  it("skips when summary already delivered", () => {
    expect(shouldRunSynthesis(true, 3)).toBe(false);
  });

  it("skips when no tools ran", () => {
    expect(shouldRunSynthesis(false, 0)).toBe(false);
  });

  it("runs after write_file when no substantive model reply", () => {
    expect(shouldRunSynthesis(false, 1)).toBe(true);
  });
});

describe("modelDeliveredSubstantiveReply", () => {
  it("rejects short or plan-only text", () => {
    expect(modelDeliveredSubstantiveReply("I will use write_file now.")).toBe(false);
    expect(modelDeliveredSubstantiveReply("ok")).toBe(false);
  });

  it("accepts a real closing summary", () => {
    expect(
      modelDeliveredSubstantiveReply(
        "I created llm_excellence.txt in the project root with a long overview of LLM capabilities."
      )
    ).toBe(true);
  });
});
