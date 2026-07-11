import { unescapeLiteralEscapes } from "../textEscapes";
import { resolveWorkspacePath } from "../tools/pathUtils";
import { normalizeFilePath } from "../fsPath";

export { unescapeLiteralEscapes } from "../textEscapes";

const FILE_TOOLS = new Set([
  "read_file",
  "write_file",
  "create_file",
  "delete_file",
  "move_file",
]);

const FILE_OPEN_TOOLS = new Set(["read_file", "write_file", "create_file", "move_file"]);

export function pathsFromToolInput(
  toolName: string,
  args: Record<string, unknown>,
  workspacePath: string
): string[] {
  const paths: string[] = [];
  const push = (p: unknown) => {
    if (typeof p !== "string" || !p.trim()) return;
    try {
      paths.push(normalizeFilePath(resolveWorkspacePath(workspacePath, p.trim())));
    } catch {
      /* ignore bad paths */
    }
  };

  switch (toolName) {
    case "write_file":
    case "create_file":
    case "delete_file":
    case "read_file":
      push(args.path);
      break;
    case "move_file":
      push(args.from);
      push(args.to);
      break;
    default:
      break;
  }
  return paths;
}

export function openableFilePaths(
  toolName: string,
  args: Record<string, unknown>,
  workspacePath: string,
  success: boolean
): string[] {
  if (!success || !FILE_OPEN_TOOLS.has(toolName)) return [];
  const paths = pathsFromToolInput(toolName, args, workspacePath);
  if (toolName === "move_file") {
    const to = typeof args.to === "string" ? args.to : "";
    if (!to.trim()) return [];
    try {
      return [normalizeFilePath(resolveWorkspacePath(workspacePath, to.trim()))];
    } catch {
      return [];
    }
  }
  return paths.filter((p) => !p.endsWith("/"));
}

export function workspaceRelativePath(workspacePath: string, absPath: string): string {
  const root = normalizeFilePath(workspacePath);
  const file = normalizeFilePath(absPath);
  if (file === root) return file.split("/").pop() ?? file;
  if (file.startsWith(`${root}/`)) return file.slice(root.length + 1);
  return file.split("/").pop() ?? file;
}

/** Short chip label for collapsed shell rows (e.g. `cd`, `git status`) — not full paths. */
export function shellCommandShortLabel(command: string): string {
  const segment = command.split(/\s*(?:&&|;|\|)\s*/)[0]?.trim() ?? "";
  if (!segment) return "shell";
  if (/^cd\b/i.test(segment)) return "cd";
  const tokens = segment.match(/[^\s]+/g) ?? [];
  if (tokens.length === 0) return "shell";
  if (tokens.length <= 2) return segment;
  const [first, second] = tokens;
  if (
    second &&
    !second.startsWith("/") &&
    !second.startsWith(".") &&
    !second.startsWith("~") &&
    !second.includes("/")
  ) {
    return `${first} ${second}`;
  }
  return first ?? "shell";
}

export function formatToolSummary(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case "write_file":
    case "create_file":
    case "read_file":
    case "delete_file":
      return typeof input.path === "string" ? input.path : "";
    case "move_file": {
      const from = typeof input.from === "string" ? input.from : "?";
      const to = typeof input.to === "string" ? input.to : "?";
      return `${from} → ${to}`;
    }
    case "run_shell":
      return typeof input.command === "string" ? shellCommandShortLabel(input.command) : "";
    case "switch_mode": {
      const target = typeof input.target_mode === "string" ? input.target_mode : "";
      return target ? `→ ${target}` : "";
    }
    case "run_script":
      return typeof input.script === "string" ? truncate(input.script, 72) : "";
    case "grep":
      return typeof input.pattern === "string" ? `"${input.pattern}"` : "";
    case "find_file":
      return typeof input.pattern === "string" ? input.pattern : "";
    case "list_dir":
      return typeof input.path === "string" ? input.path || "." : ".";
    case "web_fetch":
      return typeof input.url === "string" ? truncate(input.url, 72) : "";
    case "get_git_diff":
      return typeof input.path === "string" ? input.path : "all changes";
    default:
      return "";
  }
}

/** Short verb for activity chip row (e.g. `write_file` → `write`). */
export function toolCompactLabel(toolName: string): string {
  if (toolName.endsWith("_file")) return toolName.slice(0, -5).replace(/_/g, " ");
  if (toolName.startsWith("get_git_")) return toolName.slice(4).replace(/_/g, " ");
  if (toolName.startsWith("get_")) return toolName.slice(4).replace(/_/g, " ");
  return toolName.replace(/_/g, " ");
}

/** Primary path line for expanded tool detail (`file:`), if any. */
export function toolFileLine(
  toolName: string,
  input: Record<string, unknown>,
  workspacePath: string
): string | null {
  const summary = formatToolSummary(toolName, input);
  if (!summary) return null;
  if (toolName === "move_file" || toolName === "web_fetch") {
    return summary;
  }
  if (!isFileTool(toolName) && toolName !== "list_dir") return null;
  if (!workspacePath) return summary;
  try {
    const resolved = normalizeFilePath(resolveWorkspacePath(workspacePath, summary));
    return workspaceRelativePath(workspacePath, resolved);
  } catch {
    return summary;
  }
}

/** Primary text body for UI preview (stdout or read_file content). */
export function toolOutputDisplayBody(toolName: string, content: string): string {
  const formatted = formatToolOutput(content);
  if (toolName === "read_file") return formatted;
  const stdoutOnly = formatted.match(/^stdout:\n([\s\S]*?)(?:\n\nstderr:|\n\nexit code:|$)/);
  if (stdoutOnly?.[1]?.trim()) return stdoutOnly[1];
  if (!formatted.startsWith("Successfully ") && !formatted.startsWith("Error:")) {
    return formatted;
  }
  return formatted;
}

export function shouldRenderToolOutputAsMarkdown(toolName: string, content: string): boolean {
  if (toolResultIsError(content)) return false;
  const body = toolOutputDisplayBody(toolName, content).trim();
  if (body.startsWith("#") && body.length >= 40) return true;
  if (body.length < 80) return false;
  if (/^[-*]\s/m.test(body) && body.includes("\n\n")) return true;
  if ((body.match(/\n\n/g) ?? []).length >= 2 && /[.!?]/.test(body)) return true;
  return false;
}

export function formatToolOutput(content: string): string {
  if (!content.trim()) return content;
  const stdoutMatch = content.match(/^stdout:\n([\s\S]*?)(?:\n\nstderr:\n([\s\S]*?))?(?:\n\nexit code: (.*))?$/);
  if (stdoutMatch) {
    const parts = [
      `stdout:\n${unescapeLiteralEscapes(stdoutMatch[1] ?? "")}`,
    ];
    if (stdoutMatch[2] != null) parts.push(`stderr:\n${stdoutMatch[2]}`);
    if (stdoutMatch[3] != null) parts.push(`exit code: ${stdoutMatch[3]}`);
    return parts.join("\n\n");
  }
  return unescapeLiteralEscapes(content);
}

export function formatToolInput(toolName: string, input: Record<string, unknown>): string {
  if (toolName === "run_shell" && typeof input.command === "string") {
    return input.command;
  }
  if (toolName === "switch_mode") {
    const target = typeof input.target_mode === "string" ? input.target_mode : "?";
    const why = typeof input.explanation === "string" ? input.explanation : "";
    return why ? `mode: ${target}\n\n${why}` : `mode: ${target}`;
  }
  if (toolName === "run_script" && typeof input.script === "string") {
    return input.script;
  }
  if (
    (toolName === "write_file" || toolName === "create_file") &&
    typeof input.path === "string"
  ) {
    let content = typeof input.content === "string" ? input.content : "";
    if (content.length > 4000) {
      content = `${content.slice(0, 4000)}\n… (${content.length.toLocaleString()} chars total)`;
    }
    return `path: ${input.path}\n\n${content}`;
  }

  const copy = { ...input };
  if (typeof copy.content === "string" && copy.content.length > 4000) {
    copy.content = `${copy.content.slice(0, 4000)}\n… (${copy.content.length.toLocaleString()} chars total)`;
  }
  return JSON.stringify(copy, null, 2);
}

export function isFileTool(toolName: string): boolean {
  return FILE_TOOLS.has(toolName);
}

/** Read-only browse tools — one-line preview only (no expand / file dump). */
const CONDENSED_PREVIEW_TOOLS = new Set(["read_file", "list_dir"]);

export function isCondensedPreviewTool(toolName: string): boolean {
  return CONDENSED_PREVIEW_TOOLS.has(toolName);
}

/** Path string for collapsed Read / Listed activity rows. */
export function toolActivityDetailPath(
  toolName: string,
  input: Record<string, unknown>,
  workspacePath: string
): string {
  const summary = formatToolSummary(toolName, input);
  if (!summary) return "";
  if (toolName === "read_file") {
    try {
      const resolved = workspacePath.trim()
        ? normalizeFilePath(resolveWorkspacePath(workspacePath, summary))
        : normalizeFilePath(summary);
      return resolved.split("/").pop() ?? resolved;
    } catch {
      return summary.split("/").pop() ?? summary;
    }
  }
  if (toolName !== "list_dir") return summary;
  if (!workspacePath.trim()) return summary;
  try {
    let resolved = normalizeFilePath(resolveWorkspacePath(workspacePath, summary));
    resolved = resolved.replace(/\/+\.$/, "").replace(/\/+$/, "");
    return resolved;
  } catch {
    return summary;
  }
}

function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function toolResultIsError(content: string): boolean {
  return content.startsWith("Error:");
}
