import type { StoredToolCall } from "../stores/chat";
import { recoverToolCallsFromText } from "./textToolCalls";

export type ToolCallProbeResult = {
  nativeCount: number;
  recoveredCount: number;
  totalCallable: number;
  nativeNames: string[];
  recoveredNames: string[];
  contentPreview: string;
};

/** Classify one model turn the same way ChatPane does before executing tools. */
export function probeToolCallsFromTurn(
  content: string,
  apiToolCalls: StoredToolCall[],
  allowedTools: Set<string>
): ToolCallProbeResult {
  const recovered = recoverToolCallsFromText(content, allowedTools);
  const nativeNames = apiToolCalls.map((t) => t.name);
  const recoveredNames = recovered.calls.map((t) => t.name);
  return {
    nativeCount: apiToolCalls.length,
    recoveredCount: recovered.calls.length,
    totalCallable: apiToolCalls.length + recovered.calls.length,
    nativeNames,
    recoveredNames,
    contentPreview: content.trim().slice(0, 400),
  };
}

export function formatToolProbeFailure(model: string, probe: ToolCallProbeResult): string {
  const lines = [
    `Model "${model}" produced no API tool_calls and no recoverable text-fallback calls.`,
    `Response preview: ${probe.contentPreview || "(empty)"}`,
    "Tips: set per-model Tool call format to Text fallback for weak local models; use {\"name\": \"tool_name\", ...} in ```json fences.",
  ];
  return lines.join("\n");
}
