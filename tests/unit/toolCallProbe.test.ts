import { describe, expect, it } from "vitest";
import { probeToolCallsFromTurn } from "../../src/lib/agent/toolCallProbe";

const ALLOWED = new Set(["get_git_status", "run_shell"]);

describe("probeToolCallsFromTurn", () => {
  it("counts native API tool calls", () => {
    const probe = probeToolCallsFromTurn(
      "",
      [{ id: "1", name: "get_git_status", arguments: "{}" }],
      ALLOWED
    );
    expect(probe.nativeCount).toBe(1);
    expect(probe.recoveredCount).toBe(0);
    expect(probe.totalCallable).toBe(1);
  });

  it("recovers text-fallback fences when API returned none", () => {
    const text = `\`\`\`json
{"name": "run_shell", "arguments": {"command": "echo hi"}}
\`\`\``;
    const probe = probeToolCallsFromTurn(text, [], ALLOWED);
    expect(probe.nativeCount).toBe(0);
    expect(probe.recoveredCount).toBe(1);
    expect(probe.recoveredNames[0]).toBe("run_shell");
  });

  it("recovers tool_name alias used by some local models", () => {
    const text = `\`\`\`json
{"tool_name": "run_shell", "arguments": {"command": "touch hellojoke.txt"}}
\`\`\``;
    const probe = probeToolCallsFromTurn(text, [], ALLOWED);
    expect(probe.totalCallable).toBe(1);
    expect(probe.recoveredNames[0]).toBe("run_shell");
  });
});
