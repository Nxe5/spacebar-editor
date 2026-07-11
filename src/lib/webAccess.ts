import type { Tool } from "./providers/openaiCompat";

/** Agent tools that reach the network. Gated by per-session web access toggle. */
export const NETWORK_AGENT_TOOLS = ["web_fetch"] as const;

export type NetworkAgentTool = (typeof NETWORK_AGENT_TOOLS)[number];

export function isNetworkAgentTool(name: string): boolean {
  return (NETWORK_AGENT_TOOLS as readonly string[]).includes(name);
}

/** Remove network tools when web access is disabled for the session. */
export function filterToolsByWebAccess(tools: Tool[], webAccessEnabled: boolean): Tool[] {
  if (webAccessEnabled) return tools;
  return tools.filter((t) => !isNetworkAgentTool(t.function.name));
}
