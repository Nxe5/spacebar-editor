import {
  readFile,
  readFileRanged,
  writeFile,
  listDir,
  grepWorkspace,
  runShell as invokeRunShell,
  deleteEntry,
  renameEntry,
  pathExists,
  gitStatus,
  gitLog,
  gitDiff,
  findFiles,
  listDirTree,
  webFetch as invokeWebFetch,
  isTauriAvailable,
} from "../ipc";
import type { FileEntry } from "../stores/files";
import { formatGitLog, formatGitStatus } from "./gitFormat";
import { unescapeLiteralEscapes } from "../textEscapes";
import { joinPath, resolvePath, resolveWorkspacePath } from "./pathUtils";

export interface ToolExecutionContext {
  webFetchAllowedHosts?: string[];
  /** Effective max_lines cap for read_file (from agent settings). */
  readFileMaxLines?: number;
}

export interface ToolResult {
  success: boolean;
  output: string;
}

function fail(message: string): ToolResult {
  return { success: false, output: message };
}

function ok(output: string): ToolResult {
  return { success: true, output };
}

function toolErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message || e.name || "Error";
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function requireWorkspacePath(workspacePath: string): ToolResult | null {
  const root = workspacePath?.trim();
  if (!root || root === "/") {
    return fail(
      "No workspace folder is open. Use the folder icon at the bottom of the right sidebar to open a project directory."
    );
  }
  return null;
}

function requireString(args: Record<string, unknown>, key: string): string | ToolResult {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) {
    return fail(`Missing required parameter: ${key}`);
  }
  return value;
}

async function runReadFile(
  args: Record<string, unknown>,
  workspacePath: string,
  ctx?: ToolExecutionContext
): Promise<ToolResult> {
  const path = requireString(args, "path");
  if (typeof path !== "string") return path;
  const resolved = resolveWorkspacePath(workspacePath, path);
  const startLine =
    typeof args.start_line === "number" ? Math.max(1, Math.floor(args.start_line)) : 1;
  const maxLines =
    typeof args.max_lines === "number" && args.max_lines > 0
      ? Math.floor(args.max_lines)
      : ctx?.readFileMaxLines ?? 500;
  const result = await readFileRanged(resolved, startLine, maxLines);
  let output = result.content;
  if (result.truncated) {
    output += `\n\n[File truncated: showing lines ${result.start_line}–${result.end_line} of ${result.total_lines}. Call read_file again with start_line: ${result.end_line + 1} to continue.]`;
  }
  if (result.hard_capped) {
    output += "\n\n[… hard cap reached]";
  }
  return ok(output);
}

async function runWriteFile(
  args: Record<string, unknown>,
  workspacePath: string
): Promise<ToolResult> {
  const path = requireString(args, "path");
  if (typeof path !== "string") return path;
  if (args.content === undefined) {
    return fail("Missing required parameter: content");
  }
  const resolved = resolveWorkspacePath(workspacePath, path);
  await writeFile(resolved, String(args.content));
  return ok(`Successfully wrote to ${path}`);
}

async function runCreateFile(
  args: Record<string, unknown>,
  workspacePath: string
): Promise<ToolResult> {
  const path = requireString(args, "path");
  if (typeof path !== "string") return path;
  if (args.content === undefined) {
    return fail("Missing required parameter: content");
  }
  const resolved = resolveWorkspacePath(workspacePath, path);
  if (await pathExists(resolved)) {
    return fail(`File already exists: ${path}. Use write_file to overwrite.`);
  }
  await writeFile(resolved, String(args.content));
  return ok(`Successfully created ${path}`);
}

async function runDeleteFile(
  args: Record<string, unknown>,
  workspacePath: string
): Promise<ToolResult> {
  const path = requireString(args, "path");
  if (typeof path !== "string") return path;
  const resolved = resolveWorkspacePath(workspacePath, path);
  await deleteEntry(resolved);
  return ok(`Successfully deleted ${path}`);
}

async function runMoveFile(
  args: Record<string, unknown>,
  workspacePath: string
): Promise<ToolResult> {
  const from = requireString(args, "from");
  if (typeof from !== "string") return from;
  const to = requireString(args, "to");
  if (typeof to !== "string") return to;
  const resolvedFrom = resolveWorkspacePath(workspacePath, from);
  const resolvedTo = resolveWorkspacePath(workspacePath, to);
  await renameEntry(resolvedFrom, resolvedTo);
  return ok(`Successfully moved ${from} → ${to}`);
}

async function runListDir(
  args: Record<string, unknown>,
  workspacePath: string
): Promise<ToolResult> {
  const path = requireString(args, "path");
  if (typeof path !== "string") return path;
  const resolved = resolveWorkspacePath(workspacePath, path, { allowWorkspaceRoot: true });
  const entries = await listDir(resolved);
  const output = entries
    .map((e) => `${e.is_dir ? "[dir]" : "[file]"} ${e.name}`)
    .join("\n");
  return ok(output || "(empty directory)");
}

async function runGrep(
  args: Record<string, unknown>,
  workspacePath: string
): Promise<ToolResult> {
  const pattern = requireString(args, "pattern");
  if (typeof pattern !== "string") return pattern;
  const fileGlob = typeof args.file_glob === "string" ? args.file_glob : undefined;
  const matches = await grepWorkspace(workspacePath, pattern, fileGlob);

  if (matches.length === 0) {
    return ok("No matches found.");
  }

  const output = matches
    .slice(0, 100)
    .map((m) => `${m.path}:${m.line_number}: ${m.line_content}`)
    .join("\n");
  const truncated =
    matches.length > 100 ? `\n... and ${matches.length - 100} more matches` : "";
  return ok(output + truncated);
}

async function runGitStatus(workspacePath: string): Promise<ToolResult> {
  const entries = await gitStatus(workspacePath);
  return ok(formatGitStatus(entries));
}

async function runGitLog(
  args: Record<string, unknown>,
  workspacePath: string
): Promise<ToolResult> {
  const limit = typeof args.limit === "number" ? args.limit : 32;
  const entries = await gitLog(workspacePath, limit);
  return ok(formatGitLog(entries));
}

async function runGitDiff(
  args: Record<string, unknown>,
  workspacePath: string
): Promise<ToolResult> {
  const path = typeof args.path === "string" ? args.path : undefined;
  const diff = await gitDiff(workspacePath, path);
  return ok(diff.trim() || "(no diff)");
}

async function runFindFile(
  args: Record<string, unknown>,
  workspacePath: string
): Promise<ToolResult> {
  const glob = requireString(args, "glob");
  if (typeof glob !== "string") return glob;
  const maxResults = typeof args.max_results === "number" ? args.max_results : 100;
  const paths = await findFiles(workspacePath, glob, maxResults);
  if (paths.length === 0) return ok("No files matched.");
  return ok(paths.join("\n"));
}

function formatFileTree(entries: FileEntry[], indent = ""): string {
  return entries
    .map((e) => {
      const prefix = e.is_dir ? "[dir]" : "[file]";
      const line = `${indent}${prefix} ${e.name}`;
      const children =
        e.children && e.children.length > 0
          ? `\n${formatFileTree(e.children, `${indent}  `)}`
          : "";
      return line + children;
    })
    .join("\n");
}

async function runGetFileTree(
  args: Record<string, unknown>,
  workspacePath: string
): Promise<ToolResult> {
  const path = requireString(args, "path");
  if (typeof path !== "string") return path;
  const maxDepth = typeof args.max_depth === "number" ? args.max_depth : 3;
  const resolved = resolveWorkspacePath(workspacePath, path, { allowWorkspaceRoot: true });
  const tree = await listDirTree(resolved, maxDepth);
  return ok(formatFileTree(tree) || "(empty)");
}

async function detectTestCommand(workspacePath: string): Promise<string> {
  if (await pathExists(joinPath(workspacePath, "Cargo.toml"))) return "cargo test";
  if (await pathExists(joinPath(workspacePath, "package.json"))) {
    if (await pathExists(joinPath(workspacePath, "pnpm-lock.yaml"))) return "pnpm test";
    if (await pathExists(joinPath(workspacePath, "bun.lockb"))) return "bun test";
    if (await pathExists(joinPath(workspacePath, "yarn.lock"))) return "yarn test";
    return "npm test";
  }
  if (
    (await pathExists(joinPath(workspacePath, "pyproject.toml"))) ||
    (await pathExists(joinPath(workspacePath, "pytest.ini")))
  ) {
    return "pytest";
  }
  return "pnpm test";
}

async function runTests(
  args: Record<string, unknown>,
  workspacePath: string
): Promise<ToolResult> {
  const command =
    typeof args.command === "string" && args.command.trim()
      ? args.command.trim()
      : await detectTestCommand(workspacePath);
  return runShellCommand({ command }, workspacePath);
}

async function runScript(
  args: Record<string, unknown>,
  workspacePath: string
): Promise<ToolResult> {
  const script = requireString(args, "script");
  if (typeof script !== "string") return script;
  const resolved = resolveWorkspacePath(workspacePath, script);
  if (!(await pathExists(resolved))) {
    return fail(`Script not found: ${script}`);
  }
  const extra = typeof args.args === "string" ? args.args.trim() : "";
  let command: string;
  if (resolved.endsWith(".py")) {
    command = `python3 "${resolved}"${extra ? ` ${extra}` : ""}`;
  } else if (resolved.endsWith(".js") || resolved.endsWith(".mjs") || resolved.endsWith(".cjs")) {
    command = `node "${resolved}"${extra ? ` ${extra}` : ""}`;
  } else if (resolved.endsWith(".sh")) {
    command = `bash "${resolved}"${extra ? ` ${extra}` : ""}`;
  } else {
    command = `"${resolved}"${extra ? ` ${extra}` : ""}`;
  }
  return runShellCommand({ command }, workspacePath);
}

async function runWebFetch(
  args: Record<string, unknown>,
  _workspacePath: string,
  context?: ToolExecutionContext
): Promise<ToolResult> {
  const url = requireString(args, "url");
  if (typeof url !== "string") return url;
  const hosts = context?.webFetchAllowedHosts ?? [];
  if (hosts.length === 0) {
    return fail("No web fetch hosts configured. Add allowed hosts in Settings → Tools.");
  }
  try {
    const body = await invokeWebFetch(url, hosts);
    return ok(body);
  } catch (e) {
    return fail((e as Error).message);
  }
}

async function runShellCommand(
  args: Record<string, unknown>,
  workspacePath: string
): Promise<ToolResult> {
  const command = requireString(args, "command");
  if (typeof command !== "string") return command;
  const timeoutMs = typeof args.timeout_ms === "number" ? args.timeout_ms : undefined;
  const result = await invokeRunShell(workspacePath, command, timeoutMs);

  if (result.timed_out) {
    return fail(`Command timed out.\n${result.stderr}`);
  }

  const stdout = result.stdout ? unescapeLiteralEscapes(result.stdout) : "";
  const output = [
    stdout ? `stdout:\n${stdout}` : "",
    result.stderr ? `stderr:\n${result.stderr}` : "",
    `exit code: ${result.exit_code ?? "unknown"}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  if (result.exit_code === 0) {
    await maybeRepairEchoRedirectFile(workspacePath, command);
  }

  return {
    success: result.exit_code === 0,
    output,
  };
}

const ECHO_REDIRECT = /\b(?:echo|printf\s+%b)\s+[\s\S]*?>\s*['"]?([^\s'";|&]+)['"]?\s*$/i;
const REPAIRABLE_EXT = /\.(txt|md|markdown)$/i;

/** Fix files written via `echo '...\n...' > file.md` where bash printed literal `\n`. */
async function maybeRepairEchoRedirectFile(
  workspacePath: string,
  command: string
): Promise<void> {
  const match = command.match(ECHO_REDIRECT);
  if (!match?.[1]) return;
  const rel = match[1].trim();
  if (!REPAIRABLE_EXT.test(rel)) return;
  try {
    const resolved = resolveWorkspacePath(workspacePath, rel);
    const raw = await readFile(resolved);
    const fixed = unescapeLiteralEscapes(raw);
    if (fixed !== raw) await writeFile(resolved, fixed);
  } catch {
    /* ignore missing paths or read errors */
  }
}

type ToolHandler = (
  args: Record<string, unknown>,
  workspacePath: string,
  context?: ToolExecutionContext
) => Promise<ToolResult>;

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  read_file: runReadFile,
  write_file: runWriteFile,
  create_file: runCreateFile,
  delete_file: runDeleteFile,
  move_file: runMoveFile,
  list_dir: runListDir,
  grep: runGrep,
  find_file: runFindFile,
  get_file_tree: runGetFileTree,
  get_git_status: (_args, workspacePath) => runGitStatus(workspacePath),
  get_git_log: runGitLog,
  get_git_diff: runGitDiff,
  run_tests: runTests,
  run_script: runScript,
  web_fetch: runWebFetch,
  run_shell: runShellCommand,
};

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  workspacePath: string,
  context?: ToolExecutionContext
): Promise<ToolResult> {
  if (!isTauriAvailable()) {
    return fail("Tool execution requires the Tauri desktop environment.");
  }

  const wsCheck = requireWorkspacePath(workspacePath);
  if (wsCheck) return wsCheck;

  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    return fail(`Unknown tool: ${name}`);
  }

  try {
    return await handler(args, workspacePath, context);
  } catch (e) {
    return fail(`Tool execution failed: ${toolErrorMessage(e)}`);
  }
}

// Re-export for tests that import path helpers from toolRunner historically
export { resolvePath } from "./pathUtils";
