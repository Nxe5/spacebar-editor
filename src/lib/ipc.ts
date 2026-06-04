import type { FileEntry } from "./stores/files";
import type { GitLogEntry, GitPathStatus } from "./gitTypes";

function detectTauri(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  return w.__TAURI__ != null || w.__TAURI_INTERNALS__ != null;
}

const isTauri = detectTauri();

let invoke: typeof import("@tauri-apps/api/core").invoke;
let listen: typeof import("@tauri-apps/api/event").listen;

let apiLoad: Promise<void> | null = null;

function ensureTauriApi(): Promise<void> {
  if (!isTauri) {
    return Promise.reject(
      new Error("Tauri API unavailable. Run with 'pnpm tauri dev' instead of 'pnpm dev'.")
    );
  }
  if (!apiLoad) {
    apiLoad = Promise.all([
      import("@tauri-apps/api/core"),
      import("@tauri-apps/api/event"),
    ]).then(([core, eventMod]) => {
      invoke = core.invoke;
      listen = eventMod.listen;
    });
  }
  return apiLoad;
}

export async function listDir(path: string): Promise<FileEntry[]> {
  await ensureTauriApi();
  return invoke<FileEntry[]>("list_dir", { path });
}

export interface ReadFileResult {
  content: string;
  start_line: number;
  end_line: number;
  total_lines: number;
  truncated: boolean;
  hard_capped: boolean;
}

export async function readFile(path: string): Promise<string> {
  await ensureTauriApi();
  const result = await invoke<ReadFileResult>("read_file", { path });
  return result.content;
}

export async function readFileRanged(
  path: string,
  startLine?: number,
  maxLines?: number
): Promise<ReadFileResult> {
  await ensureTauriApi();
  return invoke<ReadFileResult>("read_file", {
    path,
    startLine: startLine ?? null,
    maxLines: maxLines ?? null,
  });
}

/** Returns an optional audit prefix (e.g. created parent directories) before the write. */
export async function writeFile(path: string, contents: string): Promise<string> {
  await ensureTauriApi();
  return invoke<string>("write_file", { path, contents });
}

export async function getWorkspacePath(): Promise<string> {
  await ensureTauriApi();
  return invoke<string>("get_workspace_path");
}

export async function pickWorkspaceFolder(): Promise<string | null> {
  await ensureTauriApi();
  return invoke<string | null>("pick_workspace_folder");
}

export function isTauriAvailable(): boolean {
  return isTauri;
}

/** Open http(s), mailto, etc. in the system handler (Tauri shell or browser). */
export async function openExternalUrl(url: string): Promise<void> {
  if (isTauri) {
    await ensureTauriApi();
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
    return;
  }
  if (typeof window !== "undefined") {
    window.location.href = url;
  }
}

export async function ptyCreate(cwd?: string | null): Promise<string> {
  await ensureTauriApi();
  return invoke<string>("pty_create", { cwd: cwd ?? null });
}

export async function ptyWrite(id: string, data: string): Promise<void> {
  await ensureTauriApi();
  await invoke<void>("pty_write", { id, data });
}

export async function ptyResize(id: string, cols: number, rows: number): Promise<void> {
  await ensureTauriApi();
  await invoke<void>("pty_resize", { id, cols, rows });
}

export async function ptyClose(id: string): Promise<void> {
  await ensureTauriApi();
  await invoke<void>("pty_close", { id });
}

type UnlistenFn = () => void;

export async function listenPtyData(
  callback: (payload: { id: string; data: string }) => void
): Promise<UnlistenFn> {
  await ensureTauriApi();
  return listen<{ id: string; data: string }>("pty:data", (e) => {
    callback(e.payload);
  });
}

export async function listenPtyExit(
  callback: (payload: { id: string; code: number | null }) => void
): Promise<UnlistenFn> {
  await ensureTauriApi();
  return listen<{ id: string; code: number | null }>("pty:exit", (e) => {
    callback(e.payload);
  });
}

export async function openSettingsWindow(): Promise<void> {
  await ensureTauriApi();
  await invoke<void>("open_settings_window");
}

/** Start (or replace) the recursive FS watcher for the given workspace. */
export async function watchWorkspace(workspacePath: string): Promise<void> {
  await ensureTauriApi();
  await invoke<void>("watch_workspace", { workspacePath });
}

/** Subscribe to debounced `fs:changed` events from the workspace watcher. */
export async function listenFsChanged(callback: () => void): Promise<UnlistenFn> {
  await ensureTauriApi();
  return listen("fs:changed", () => callback());
}

export async function gitCurrentBranch(repoPath: string): Promise<string | null> {
  await ensureTauriApi();
  return invoke<string | null>("git_current_branch", { repoPath });
}

export async function gitStatus(repoPath: string): Promise<GitPathStatus[]> {
  await ensureTauriApi();
  return invoke<GitPathStatus[]>("git_status", { repoPath });
}

export async function gitDiff(repoPath: string, path?: string): Promise<string> {
  await ensureTauriApi();
  return invoke<string>("git_diff", { repoPath, path: path ?? null });
}

export async function pathExists(path: string): Promise<boolean> {
  await ensureTauriApi();
  return invoke<boolean>("path_exists", { path });
}

export async function gitStage(repoPath: string, path: string): Promise<void> {
  await ensureTauriApi();
  return invoke<void>("git_stage", { repoPath, path });
}

export async function gitUnstage(repoPath: string, path: string): Promise<void> {
  await ensureTauriApi();
  return invoke<void>("git_unstage", { repoPath, path });
}

export async function gitCommit(repoPath: string, message: string): Promise<string> {
  await ensureTauriApi();
  return invoke<string>("git_commit", { repoPath, message });
}

export async function gitLog(repoPath: string, limit?: number): Promise<GitLogEntry[]> {
  await ensureTauriApi();
  return invoke<GitLogEntry[]>("git_log", { repoPath, limit: limit ?? 32 });
}

export async function gitFileAtHead(repoPath: string, path: string): Promise<string | null> {
  await ensureTauriApi();
  return invoke<string | null>("git_file_at_head", { repoPath, path });
}

export async function gitDiscard(repoPath: string, path: string): Promise<void> {
  await ensureTauriApi();
  return invoke<void>("git_discard", { repoPath, path });
}

export async function gitCreateCheckpoint(
  repoPath: string,
  refSuffix: string
): Promise<string> {
  await ensureTauriApi();
  return invoke<string>("git_create_checkpoint", { repoPath, refSuffix });
}

export async function gitRestoreCheckpoint(repoPath: string, oid: string): Promise<void> {
  await ensureTauriApi();
  return invoke<void>("git_restore_checkpoint", { repoPath, oid });
}

export async function gitIsRepo(repoPath: string): Promise<boolean> {
  await ensureTauriApi();
  return invoke<boolean>("git_is_repo", { repoPath });
}

export async function renameEntry(from: string, to: string): Promise<void> {
  await ensureTauriApi();
  return invoke<void>("rename_entry", { from, to });
}

export async function deleteEntry(path: string): Promise<void> {
  await ensureTauriApi();
  return invoke<void>("delete_entry", { path });
}

export async function closeAuxiliaryWebviewWindows(): Promise<void> {
  if (!isTauri) return;
  await ensureTauriApi();
  const { getAllWebviewWindows } = await import("@tauri-apps/api/webviewWindow");
  const wins = await getAllWebviewWindows();
  for (const w of wins) {
    if (w.label !== "main") {
      await w.close().catch(() => {});
    }
  }
}

export function getLanguageFromPath(path: string): string {
  const filename = path.split("/").pop() ?? "";
  if (/^dockerfile(\..*)?$/i.test(filename)) return "dockerfile";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    json: "json",
    md: "markdown",
    mdx: "markdown",
    rs: "rust",
    py: "python",
    html: "html",
    htm: "html",
    css: "css",
    scss: "css",
    less: "css",
    svelte: "svelte",
    vue: "vue",
    go: "go",
    java: "java",
    c: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    h: "c",
    hpp: "cpp",
    hxx: "cpp",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    fish: "shell",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    sql: "sql",
    xml: "xml",
    svg: "xml",
    php: "php",
    phtml: "php",
    rb: "ruby",
    rake: "ruby",
    gemspec: "ruby",
    kt: "kotlin",
    kts: "kotlin",
    cs: "csharp",
    scala: "scala",
    sc: "scala",
    dart: "dart",
    lua: "lua",
    ps1: "powershell",
    psm1: "powershell",
    pl: "perl",
    pm: "perl",
    swift: "swift",
    hs: "haskell",
    lhs: "haskell",
    r: "r",
    groovy: "groovy",
    gradle: "groovy",
  };
  return langMap[ext] ?? "plaintext";
}

export interface GrepMatch {
  path: string;
  line_number: number;
  line_content: string;
}

export interface GrepOptions {
  fileGlob?: string;
  /** When true, match case exactly. When false, ignore case. Omit for smart-case (default). */
  caseSensitive?: boolean;
  /** When true, treat pattern as a regex. Default false (fixed string). */
  isRegex?: boolean;
  /** When true, only match whole words. */
  wholeWord?: boolean;
}

export async function grepWorkspace(
  workspacePath: string,
  pattern: string,
  fileGlobOrOptions?: string | GrepOptions
): Promise<GrepMatch[]> {
  await ensureTauriApi();
  const opts: GrepOptions =
    typeof fileGlobOrOptions === "string"
      ? { fileGlob: fileGlobOrOptions }
      : (fileGlobOrOptions ?? {});
  return invoke<GrepMatch[]>("grep_workspace", {
    workspacePath,
    pattern,
    fileGlob: opts.fileGlob ?? null,
    caseSensitive: opts.caseSensitive ?? null,
    isRegex: opts.isRegex ?? null,
    wholeWord: opts.wholeWord ?? null,
  });
}

export interface ShellResult {
  stdout: string;
  stderr: string;
  exit_code: number | null;
  timed_out: boolean;
}

export async function runShell(
  workspacePath: string,
  command: string,
  timeoutMs?: number
): Promise<ShellResult> {
  await ensureTauriApi();
  return invoke<ShellResult>("run_shell", {
    workspacePath,
    command,
    timeoutMs: timeoutMs ?? null,
  });
}

export async function readSystemPrompt(workspacePath: string): Promise<string | null> {
  await ensureTauriApi();
  return invoke<string | null>("read_system_prompt", { workspacePath });
}

export async function writeSystemPrompt(workspacePath: string, content: string): Promise<void> {
  await ensureTauriApi();
  return invoke<void>("write_system_prompt", { workspacePath, content });
}

export async function ensureSystemPromptsLayout(workspacePath: string): Promise<void> {
  await ensureTauriApi();
  return invoke<void>("ensure_system_prompts_layout", { workspacePath });
}

export async function ensureSkillDir(workspacePath: string, skillId: string): Promise<void> {
  await ensureTauriApi();
  return invoke<void>("ensure_skill_dir", { workspacePath, skillId });
}

export async function readProjectState(workspacePath: string): Promise<string | null> {
  await ensureTauriApi();
  return invoke<string | null>("read_project_state", { workspacePath });
}

export async function writeProjectState(workspacePath: string, content: string): Promise<void> {
  await ensureTauriApi();
  return invoke<void>("write_project_state", { workspacePath, content });
}

export async function findFiles(
  workspacePath: string,
  globPattern: string,
  maxResults?: number
): Promise<string[]> {
  await ensureTauriApi();
  return invoke<string[]>("find_files", {
    workspacePath,
    globPattern,
    maxResults: maxResults ?? null,
  });
}

export async function listDirTree(
  path: string,
  maxDepth?: number,
  maxEntries?: number
): Promise<FileEntry[]> {
  await ensureTauriApi();
  return invoke<FileEntry[]>("list_dir_tree", {
    path,
    maxDepth: maxDepth ?? null,
    maxEntries: maxEntries ?? null,
  });
}

export async function webFetch(
  url: string,
  allowedHosts: string[],
  maxBytes?: number
): Promise<string> {
  await ensureTauriApi();
  return invoke<string>("web_fetch", {
    url,
    allowedHosts,
    maxBytes: maxBytes ?? null,
  });
}

export async function iconPackGetDir(): Promise<string | null> {
  await ensureTauriApi();
  return invoke<string | null>("icon_pack_get_dir");
}

export async function iconPackRefreshBundled(): Promise<string> {
  await ensureTauriApi();
  return invoke<string>("icon_pack_refresh_bundled");
}

export async function pickIconPackFolder(): Promise<string | null> {
  await ensureTauriApi();
  return invoke<string | null>("pick_icon_pack_folder");
}

// Recent projects + launch args (onboarding / CLI — spec 36 custom)

export async function getRecentProjects(): Promise<string[]> {
  await ensureTauriApi();
  return invoke<string[]>("get_recent_projects");
}

export async function addRecentProject(path: string): Promise<void> {
  await ensureTauriApi();
  return invoke<void>("add_recent_project", { path });
}

export interface LaunchArgs {
  /** Absolute path passed as the first CLI argument, or null if none. */
  path: string | null;
  /** True when the path points to a file (not a directory). */
  is_file: boolean;
}

export async function getLaunchArgs(): Promise<LaunchArgs> {
  await ensureTauriApi();
  return invoke<LaunchArgs>("get_launch_args");
}

// LSP transport (spec 25) ------------------------------------------------

export async function spawnLsp(
  serverCmd: string,
  args: string[],
  workspace: string,
): Promise<string> {
  await ensureTauriApi();
  return invoke<string>("spawn_lsp", { serverCmd, args, workspace });
}

export async function lspSend(lspId: string, message: unknown): Promise<void> {
  await ensureTauriApi();
  return invoke<void>("lsp_send", { lspId, message });
}

export async function lspStop(lspId: string): Promise<void> {
  await ensureTauriApi();
  return invoke<void>("lsp_stop", { lspId });
}

export async function listenLspMessage(
  callback: (lspId: string, message: unknown) => void,
): Promise<() => void> {
  await ensureTauriApi();
  return listen<{ lspId: string; message: unknown }>("lsp:message", (e) =>
    callback(e.payload.lspId, e.payload.message),
  );
}

export async function listenLspExit(
  callback: (lspId: string, code: number | null) => void,
): Promise<() => void> {
  await ensureTauriApi();
  return listen<{ lspId: string; code: number | null }>("lsp:exit", (e) =>
    callback(e.payload.lspId, e.payload.code),
  );
}

// Workspace lock (spec 35) -----------------------------------------------

export interface LockInfo {
  pid: number;
  timestamp: string;
  hostname: string;
}

export type LockResult =
  | { kind: "Acquired" }
  | { kind: "ConflictLive"; lock_info: LockInfo };

export async function acquireWorkspaceLock(workspacePath: string): Promise<LockResult> {
  await ensureTauriApi();
  return invoke<LockResult>("acquire_workspace_lock", { workspacePath });
}

export async function releaseWorkspaceLock(workspacePath: string): Promise<void> {
  await ensureTauriApi();
  return invoke<void>("release_workspace_lock", { workspacePath });
}

export async function readWorkspaceLock(workspacePath: string): Promise<LockInfo | null> {
  await ensureTauriApi();
  return invoke<LockInfo | null>("read_workspace_lock", { workspacePath });
}
