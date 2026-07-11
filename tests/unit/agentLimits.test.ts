import { describe, expect, it } from "vitest";
import {
  clampAgentLimits,
  CLOUD_AGENT_LIMITS,
  LOCAL_AGENT_LIMITS,
  UNLIMITED_AGENT_LIMITS,
  defaultAgentLimitsForBackend,
  AGENT_LIMIT_BOUNDS,
  isReadOnlyTool,
  READ_ONLY_TOOL_NAMES,
  isToolRunCapReached,
  isUnlimitedCap,
  normalizeAgentLimits,
  perTurnToolCap,
  shouldContinueAgentStep,
} from "../../src/lib/agentLimits";
import { READ_ONLY_TOOLS } from "../../src/lib/tools/toolDefinitions";

describe("clampAgentLimits", () => {
  it("returns local defaults for empty input via normalize", () => {
    expect(normalizeAgentLimits(undefined, "ollama")).toEqual(LOCAL_AGENT_LIMITS);
    expect(normalizeAgentLimits(undefined, "anthropic").maxAgentSteps).toBe(24);
  });

  it("clamps values to bounds", () => {
    const result = clampAgentLimits({
      maxAgentSteps: 999,
      maxToolCallsPerRun: 999,
      maxToolsPerTurn: 100,
      maxConcurrentTools: 999,
    });
    expect(result.maxAgentSteps).toBe(AGENT_LIMIT_BOUNDS.maxAgentSteps.max);
    expect(result.maxToolCallsPerRun).toBe(AGENT_LIMIT_BOUNDS.maxToolCallsPerRun.max);
    expect(result.maxToolsPerTurn).toBe(AGENT_LIMIT_BOUNDS.maxToolsPerTurn.max);
    expect(result.maxConcurrentTools).toBe(AGENT_LIMIT_BOUNDS.maxConcurrentTools.max);
  });

  it("allows zero for unlimited caps", () => {
    expect(clampAgentLimits({ maxAgentSteps: 0 }).maxAgentSteps).toBe(0);
    expect(clampAgentLimits({ maxToolCallsPerRun: 0 }).maxToolCallsPerRun).toBe(0);
    expect(clampAgentLimits({ maxToolsPerTurn: 0 }).maxToolsPerTurn).toBe(0);
  });
});

describe("normalizeAgentLimits", () => {
  it("migrates legacy 12/48 defaults to unlimited", () => {
    expect(
      normalizeAgentLimits({ maxAgentSteps: 12, maxToolCallsPerRun: 48, maxToolsPerTurn: 0 })
    ).toEqual(UNLIMITED_AGENT_LIMITS);
  });

  it("preserves explicit unlimited caps for upgraded users", () => {
    expect(
      normalizeAgentLimits({
        maxAgentSteps: 0,
        maxToolCallsPerRun: 0,
        maxToolsPerTurn: 0,
        parallelExecution: false,
        maxConcurrentTools: 4,
      })
    ).toEqual({ ...UNLIMITED_AGENT_LIMITS, parallelExecution: false });
  });

  it("enables parallel execution by default for new installs", () => {
    expect(LOCAL_AGENT_LIMITS.parallelExecution).toBe(true);
    expect(CLOUD_AGENT_LIMITS.parallelExecution).toBe(true);
    expect(defaultAgentLimitsForBackend("ollama").parallelExecution).toBe(true);
    expect(defaultAgentLimitsForBackend("anthropic").parallelExecution).toBe(true);
    expect(normalizeAgentLimits(undefined, "ollama").parallelExecution).toBe(true);
  });

  it("defaultAgentLimitsForBackend", () => {
    expect(defaultAgentLimitsForBackend("ollama").maxAgentSteps).toBe(40);
    expect(defaultAgentLimitsForBackend("anthropic").maxAgentSteps).toBe(24);
  });

  it("keeps explicit non-default caps", () => {
    const result = normalizeAgentLimits({ maxAgentSteps: 5, maxToolCallsPerRun: 10, maxToolsPerTurn: 2 });
    expect(result.maxAgentSteps).toBe(5);
    expect(result.maxToolCallsPerRun).toBe(10);
    expect(result.maxToolsPerTurn).toBe(2);
  });
});

describe("isReadOnlyTool", () => {
  it("matches READ_ONLY_TOOLS from toolDefinitions", () => {
    expect([...READ_ONLY_TOOL_NAMES].sort()).toEqual([...READ_ONLY_TOOLS].sort());
  });

  it("classifies read-only tools for parallel execution", () => {
    for (const name of READ_ONLY_TOOLS) {
      expect(isReadOnlyTool(name)).toBe(true);
    }
  });

  it("does not treat write tools as read-only", () => {
    expect(isReadOnlyTool("write_file")).toBe(false);
    expect(isReadOnlyTool("run_shell")).toBe(false);
    expect(isReadOnlyTool("list_directory")).toBe(false);
    expect(isReadOnlyTool("git_status")).toBe(false);
  });
});

describe("limit helpers", () => {
  const unlimited = UNLIMITED_AGENT_LIMITS;
  const capped = { maxAgentSteps: 3, maxToolCallsPerRun: 2, maxToolsPerTurn: 1 };

  it("isUnlimitedCap", () => {
    expect(isUnlimitedCap(0)).toBe(true);
    expect(isUnlimitedCap(1)).toBe(false);
  });

  it("shouldContinueAgentStep", () => {
    expect(shouldContinueAgentStep(0, unlimited)).toBe(true);
    expect(shouldContinueAgentStep(999, unlimited)).toBe(true);
    expect(shouldContinueAgentStep(0, capped)).toBe(true);
    expect(shouldContinueAgentStep(2, capped)).toBe(true);
    expect(shouldContinueAgentStep(3, capped)).toBe(false);
  });

  it("isToolRunCapReached", () => {
    expect(isToolRunCapReached(0, unlimited)).toBe(false);
    expect(isToolRunCapReached(100, unlimited)).toBe(false);
    expect(isToolRunCapReached(1, capped)).toBe(false);
    expect(isToolRunCapReached(2, capped)).toBe(true);
  });

  it("perTurnToolCap", () => {
    expect(perTurnToolCap(unlimited, 5)).toBe(5);
    expect(perTurnToolCap(capped, 5)).toBe(1);
  });
});
