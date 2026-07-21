import { describe, expect, it } from "vitest";
import {
  defaultChatAppearance,
  normalizeChatAppearance,
} from "../../src/lib/chat/chatAppearance";

describe("chatAppearance", () => {
  it("defaults to spinner-row waiting style", () => {
    expect(defaultChatAppearance().waitingStyle).toBe("spinner-row");
  });

  it("defaults the rainbow border on and the model popup to an opaque color", () => {
    const d = defaultChatAppearance();
    expect(d.rainbowBorder).toBe(true);
    expect(d.modelPopupBg).toBe("#252526");
  });

  it("normalizes the rainbow toggle and model popup background", () => {
    const a = normalizeChatAppearance({ rainbowBorder: false, modelPopupBg: "#abc" });
    expect(a.rainbowBorder).toBe(false);
    expect(a.modelPopupBg).toBe("#aabbcc");
    // Non-boolean rainbow values fall back to the default.
    expect(normalizeChatAppearance({ rainbowBorder: "nope" as unknown as boolean }).rainbowBorder).toBe(true);
  });

  it("normalizes colors and waiting style", () => {
    const a = normalizeChatAppearance({
      waitingStyle: "dots",
      toolDoneColor: "#abc",
      messageBoxBg: "#123456",
    });
    expect(a.waitingStyle).toBe("dots");
    expect(a.toolDoneColor).toBe("#aabbcc");
    expect(a.messageBoxBg).toBe("#123456");
  });
});
