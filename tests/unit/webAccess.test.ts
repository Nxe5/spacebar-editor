import { describe, it, expect } from "vitest";
import type { Tool } from "../../src/lib/providers/openaiCompat";
import {
  filterToolsByWebAccess,
  isNetworkAgentTool,
  NETWORK_AGENT_TOOLS,
} from "../../src/lib/webAccess";

const webFetchTool: Tool = {
  type: "function",
  function: {
    name: "web_fetch",
    description: "fetch",
    parameters: { type: "object", properties: {} },
  },
};

const readTool: Tool = {
  type: "function",
  function: {
    name: "read_file",
    description: "read",
    parameters: { type: "object", properties: {} },
  },
};

describe("webAccess", () => {
  it("isNetworkAgentTool identifies web_fetch", () => {
    expect(isNetworkAgentTool("web_fetch")).toBe(true);
    expect(isNetworkAgentTool("read_file")).toBe(false);
    expect(NETWORK_AGENT_TOOLS).toContain("web_fetch");
  });

  it("filterToolsByWebAccess removes network tools when disabled", () => {
    const all = [readTool, webFetchTool];
    expect(filterToolsByWebAccess(all, true)).toEqual(all);
    expect(filterToolsByWebAccess(all, false)).toEqual([readTool]);
  });
});
