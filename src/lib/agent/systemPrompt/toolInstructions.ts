import type { PromptVerbosity } from "../../modelSettings";
import { ALL_TOOL_NAMES } from "../../tools/toolDefinitions";

const ALLOWED_TOOLS_LIST = ALL_TOOL_NAMES.join(", ");

const FORBIDDEN_TOOL_NAMES =
  "Never use shell command names or invented names as the tool \"name\" (e.g. ls, cat, mkdir, curl, python — use list_dir, read_file, create_file, run_shell instead).";

const PARALLEL_ENABLED =
  "You may call multiple tools in a single response when the calls are independent. Independent means the output of one does not affect the input of another.";

const PARALLEL_DISABLED =
  "Call one tool at a time. Wait for each result before proceeding.";

const STANDARD_BODY = `Tool use (critical):
- Invoke tools through the API tool_call mechanism only — never write JSON tool calls in your reply text unless using text fallback mode.
- Use ONLY registered tool names: ${ALLOWED_TOOLS_LIST}.
- ${FORBIDDEN_TOOL_NAMES}
- Never invent or simulate tool results (no fake "result" / "output" blocks).
- Wait for real tool results before claiming work is done.`;

const DETAILED_EXAMPLE = `Example valid tool call (text fallback format):
\`\`\`json
{"name": "read_file", "arguments": {"path": "src/main.ts"}}
\`\`\`
To list a directory use list_dir (not ls). To read a file use read_file (not cat).
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
      `- Allowed tool names ONLY: ${ALLOWED_TOOLS_LIST}.`,
      `- ${FORBIDDEN_TOOL_NAMES}`,
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
  parts.push(
    "LSP tools (lsp_find_references, lsp_go_to_definition, lsp_document_symbols, lsp_workspace_symbols, lsp_get_diagnostics) work when a language server is enabled in Settings → LSP. Prefer them over grep for symbol references and definitions. If a tool returns \"server not available\", fall back to grep."
  );
  parts.push(options.parallelToolCalls ? PARALLEL_ENABLED : PARALLEL_DISABLED);
  return parts.join("\n");
}

export const TOOL_SUMMARY_INSTRUCTION = `After completing tool use, summarize what you did and the outcome in plain language for the user.`;
