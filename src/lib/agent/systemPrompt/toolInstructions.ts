import type { PromptVerbosity } from "../../modelSettings";

const PARALLEL_ENABLED =
  "You may call multiple tools in a single response when the calls are independent. Independent means the output of one does not affect the input of another.";

const PARALLEL_DISABLED =
  "Call one tool at a time. Wait for each result before proceeding.";

const STANDARD_BODY = `Tool use (critical):
- Invoke tools through the API tool_call mechanism only — never write JSON tool calls in your reply text unless using text fallback mode.
- Never invent or simulate tool results (no fake "result" / "output" blocks).
- Wait for real tool results before claiming work is done.`;

const DETAILED_EXAMPLE = `Example valid tool call (text fallback format):
\`\`\`json
{"name": "read_file", "arguments": {"path": "src/main.ts"}}
\`\`\`
Call one tool, read its result, then decide the next step.`;

export function buildToolUseInstruction(options: {
  verbosity: PromptVerbosity;
  parallelToolCalls: boolean;
  textFallback: boolean;
}): string {
  const parts: string[] = [];
  if (options.textFallback) {
    parts.push(
      "Tool use (text fallback mode):",
      "- Emit tool calls as a single JSON object in a fenced ```json block, or as a bare JSON object on its own line.",
      '- Format: {"name": "tool_name", "arguments": { ... }} (use "name", not "tool_name")',
      "- Do not invent tool results."
    );
  } else {
    parts.push(STANDARD_BODY);
  }
  if (options.verbosity === "detailed") {
    parts.push(DETAILED_EXAMPLE);
  }
  parts.push(
    "For multi-line files, prefer write_file or create_file with real line breaks in content — not run_shell echo with \\n escapes (bash echo prints those literally)."
  );
  parts.push(options.parallelToolCalls ? PARALLEL_ENABLED : PARALLEL_DISABLED);
  return parts.join("\n");
}

export const TOOL_SUMMARY_INSTRUCTION = `After completing tool use, summarize what you did and the outcome in plain language for the user.`;
