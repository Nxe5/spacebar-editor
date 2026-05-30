/** Provider-only nudge after tool rounds — not persisted in chat history. */
export const SYNTHESIS_NUDGE =
  "Based on the tool results above, reply to the user now in plain language. Summarize what you found, explain any changes or errors, and answer their question directly. Do not call any tools.";

export const TOOL_SUMMARY_INSTRUCTION = `

When you use tools:
- After gathering information, always write a final message explaining your findings and answering the user.
- Do not stop after tool calls alone — the user needs your interpretation of the results.
- Keep summaries concise but complete: what you checked, what you found, and what it means.`;

export function shouldRunSynthesis(deliveredSummary: boolean, toolsExecuted: number): boolean {
  return !deliveredSummary && toolsExecuted > 0;
}

/** File mutations that are clear from the tool row + file chip (activity feed UI). */
export const SELF_EXPLANATORY_MUTATION_TOOLS = new Set([
  "write_file",
  "create_file",
  "delete_file",
  "move_file",
]);

/** True when the model already wrote a closing reply (not just a pre-tool plan). */
export function modelDeliveredSubstantiveReply(content: string): boolean {
  const t = content.trim();
  if (t.length < 48) return false;
  if (/^I (will|should|'ll|need to|am going to)\b/im.test(t) && !/\b(wrote|created|updated|deleted|moved|saved|done)\b/i.test(t)) {
    return false;
  }
  return true;
}
