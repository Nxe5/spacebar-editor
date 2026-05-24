import { describe, expect, it } from "vitest";
import {
  clampAgentLimits,
  DEFAULT_AGENT_LIMITS,
  AGENT_LIMIT_BOUNDS,
} from "../../src/lib/agentLimits";

describe("clampAgentLimits", () => {
  it("returns defaults for empty input", () => {
    expect(clampAgentLimits(undefined)).toEqual(DEFAULT_AGENT_LIMITS);
  });

  it("clamps values to bounds", () => {
    expect(
      clampAgentLimits({
        maxAgentSteps: 999,
        maxToolCallsPerRun: 0,
        maxToolsPerTurn: 100,
      })
    ).toEqual({
      maxAgentSteps: AGENT_LIMIT_BOUNDS.maxAgentSteps.max,
      maxToolCallsPerRun: AGENT_LIMIT_BOUNDS.maxToolCallsPerRun.min,
      maxToolsPerTurn: AGENT_LIMIT_BOUNDS.maxToolsPerTurn.max,
    });
  });

  it("allows zero for maxToolsPerTurn (unlimited)", () => {
    expect(clampAgentLimits({ maxToolsPerTurn: 0 }).maxToolsPerTurn).toBe(0);
  });
});
