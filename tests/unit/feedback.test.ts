import { describe, expect, it } from "vitest";
import { buildFeedbackMailto, FEEDBACK_CONTACT_EMAIL } from "../../src/lib/feedback";

describe("feedback", () => {
  it("builds mailto with subject and body", () => {
    const url = buildFeedbackMailto({
      kind: "bug",
      body: "The chat footer jumps.",
      appVersion: "0.1.0",
    });
    expect(url.startsWith(`mailto:${FEEDBACK_CONTACT_EMAIL}?`)).toBe(true);
    const query = url.split("?")[1] ?? "";
    const params = new URLSearchParams(query);
    expect(params.get("subject")).toBe("[Spacebar Editor] Bug report");
    expect(params.get("body")).toContain("The chat footer jumps.");
    expect(params.get("body")).toContain("0.1.0");
  });
});
