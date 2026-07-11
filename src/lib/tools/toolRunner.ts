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
import { capShellToolOutput } from "./shellOutputSpill";
import { runLspAgentTool } from "../lsp/lspAgentBridge";
import { normalizeToolArguments } from "../agent/textToolCalls";
import type { ChatMode } from "../stores/mode";

export interface ToolExecutionContext {
  webFetchAllowedHosts?: string[];
  /** Effective max_lines cap for read_file (from agent settings). */
  readFileMaxLines?: number;
  /**
   * Called when `web_fetch` exhausts its automatic retry budget. Intended for
   * the caller (ChatPane) to surface a toast; toolRunner itself has no Svelte
   * dependency so it delegates notification.
   */
  onNetworkRetryExhausted?: (message: string) => void;
  /** When true, mutation tools are blocked (workspace opened read-only). */
  readOnly?: boolean;
  lspToolTimeout?: number;
  lspWorkspaceSymbolTimeout?: number;
  /** Apply a Plan/Agent mode switch after user approval. */
  onSwitchMode?: (mode: Extract<ChatMode, "plan" | "agent">) => void;
}

/** Tools that write or mutate state — blocked in read-only mode. */
const WRITE_TOOLS = new Set([
  "write_file",
  "create_file",
  "delete_file",
  "rename_file",
  "move_file",
  "run_shell",
  "run_script",
  "run_tests",
  "git_stage",
  "git_commit",
  "git_discard",
]);

/** True for transient network-layer failures that are worth one automatic retry. */
export function isRetryableError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    msg.includes("connection refused") ||
    msg.includes("econnrefused") ||
    msg.includes("etimedout") ||
    msg.includes("timed out") ||
    msg.includes("network error") ||
    msg.includes("failed to fetch") ||
    msg.includes("dns") ||
    msg.includes("name resolution") ||
    msg.includes("no such host") ||
    msg.includes("socket")
  );
}

const RETRY_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const result = await readFileRanged(workspacePath, resolved, startLine, maxLines);
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
  const audit = (await writeFile(workspacePath, resolved, String(args.content))).trim();
  const prefix = audit ? `${audit}\n` : "";
  return ok(`${prefix}Successfully wrote to ${path}`);
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
  if (await pathExists(workspacePath, resolved)) {
    return fail(`File already exists: ${path}. Use write_file to overwrite.`);
  }
  const audit = (await writeFile(workspacePath, resolved, String(args.content))).trim();
  const prefix = audit ? `${audit}\n` : "";
  return ok(`${prefix}Successfully created ${path}`);
}

async function runDeleteFile(
  args: Record<string, unknown>,
  workspacePath: string
): Promise<ToolResult> {
  const path = requireString(args, "path");
  if (typeof path !== "string") return path;
  const resolved = resolveWorkspacePath(workspacePath, path);
  await deleteEntry(workspacePath, resolved);
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
  await renameEntry(workspacePath, resolvedFrom, resolvedTo);
  return ok(`Successfully moved ${from} → ${to}`);
}

async function runListDir(
  args: Record<string, unknown>,
  workspacePath: string
): Promise<ToolResult> {
  const path = requireString(args, "path");
  if (typeof path !== "string") return path;
  const resolved = resolveWorkspacePath(workspacePath, path, { allowWorkspaceRoot: true });
  const entries = await listDir(workspacePath, resolved);
  const output = entries
    .map((e) => `${e.is_dir ? "[dir]" : "[file]"} ${e.name}`)
    .join("\n");
  return ok(output || "(empty directory)");
}

async function runGrep(
  args: Record<string, unknown>,
  workspacePath: string
): Promise<ToolResult> {
  const normalized = normalizeToolArguments("grep", args);
  const pattern = requireString(normalized, "pattern");
  if (typeof pattern !== "string") return pattern;
  const fileGlob = typeof normalized.file_glob === "string" ? normalized.file_glob : undefined;
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
  const tree = await listDirTree(workspacePath, resolved, maxDepth);
  return ok(formatFileTree(tree) || "(empty)");
}

async function detectTestCommand(workspacePath: string): Promise<string> {
  if (await pathExists(workspacePath, joinPath(workspacePath, "Cargo.toml"))) return "cargo test";
  if (await pathExists(workspacePath, joinPath(workspacePath, "package.json"))) {
    if (await pathExists(workspacePath, joinPath(workspacePath, "pnpm-lock.yaml"))) return "pnpm test";
    if (await pathExists(workspacePath, joinPath(workspacePath, "bun.lockb"))) return "bun test";
    if (await pathExists(workspacePath, joinPath(workspacePath, "yarn.lock"))) return "yarn test";
    return "npm test";
  }
  if (
    (await pathExists(workspacePath, joinPath(workspacePath, "pyproject.toml"))) ||
    (await pathExists(workspacePath, joinPath(workspacePath, "pytest.ini")))
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
  if (!(await pathExists(workspacePath, resolved))) {
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

  let lastError: unknown;
  for (let attempt = 0; attempt <= 1; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS);
    try {
      const body = await invokeWebFetch(url, hosts);
      return ok(body);
    } catch (e) {
      if (!isRetryableError(e)) {
        return fail(toolErrorMessage(e));
      }
      lastError = e;
    }
  }

  const msg = `Error: network_error — ${toolErrorMessage(lastError)} (retried once)`;
  context?.onNetworkRetryExhausted?.("Network error — fetch failed after retry");
  return fail(msg);
}

async function runSwitchMode(
  args: Record<string, unknown>,
  _workspacePath: string,
  context?: ToolExecutionContext
): Promise<ToolResult> {
  if (!context?.onSwitchMode) {
    return fail("Mode switching is not available in this context.");
  }
  const target = args.target_mode;
  if (target !== "plan" && target !== "agent") {
    return fail('target_mode must be "plan" or "agent".');
  }
  context.onSwitchMode(target);
  const label = target === "plan" ? "Plan (read-only)" : "Agent (full tools)";
  return ok(`Switched to ${label} mode. Tool availability updated for subsequent steps.`);
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

  const capped = await capShellToolOutput(workspacePath, output, {
    command,
    exitCode: result.exit_code,
  });

  return {
    success: result.exit_code === 0,
    output: capped,
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
    const raw = await readFile(workspacePath, resolved);
    const fixed = unescapeLiteralEscapes(raw);
    if (fixed !== raw) await writeFile(workspacePath, resolved, fixed);
  } catch {
    /* ignore missing paths or read errors */
  }
}

async function runLspTool(
  name: string,
  args: Record<string, unknown>,
  workspacePath: string,
  context?: ToolExecutionContext
): Promise<ToolResult> {
  const result = await runLspAgentTool(
    name as Parameters<typeof runLspAgentTool>[0],
    args,
    workspacePath,
    {
      lspToolTimeout: context?.lspToolTimeout ?? 5000,
      lspWorkspaceSymbolTimeout: context?.lspWorkspaceSymbolTimeout ?? 8000,
    }
  );
  return { success: result.success, output: result.output };
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
  switch_mode: runSwitchMode,
  run_shell: runShellCommand,
  lsp_find_references: (a, w, c) => runLspTool("lsp_find_references", a, w, c),
  lsp_go_to_definition: (a, w, c) => runLspTool("lsp_go_to_definition", a, w, c),
  lsp_document_symbols: (a, w, c) => runLspTool("lsp_document_symbols", a, w, c),
  lsp_workspace_symbols: (a, w, c) => runLspTool("lsp_workspace_symbols", a, w, c),
  lsp_get_diagnostics: (a, w, c) => runLspTool("lsp_get_diagnostics", a, w, c),
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

  if (context?.readOnly && WRITE_TOOLS.has(name)) {
    return fail("Error: read_only_mode — This workspace is open read-only in this window.");
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
