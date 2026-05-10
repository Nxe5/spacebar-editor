import type { FileEntry } from "./stores/files";

const isTauri = typeof window !== "undefined" && "__TAURI__" in window;

let invoke: typeof import("@tauri-apps/api/core").invoke;
let listen: typeof import("@tauri-apps/api/event").listen;

let apiLoad: Promise<void> | null = null;

function ensureTauriApi(): Promise<void> {
  if (!isTauri) {
    return Promise.reject(
      new Error("Tauri API unavailable. Run with 'npm run tauri dev' instead of 'npm run dev'.")
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

export async function readFile(path: string): Promise<string> {
  await ensureTauriApi();
  return invoke<string>("read_file", { path });
}

export async function writeFile(path: string, contents: string): Promise<void> {
  await ensureTauriApi();
  return invoke<void>("write_file", { path, contents });
}

export async function getWorkspacePath(): Promise<string> {
  await ensureTauriApi();
  return invoke<string>("get_workspace_path");
}

/** Native folder dialog; persists for next launch. Returns `null` if cancelled. */
export async function pickWorkspaceFolder(): Promise<string | null> {
  await ensureTauriApi();
  return invoke<string | null>("pick_workspace_folder");
}

export async function startHarness(): Promise<void> {
  await ensureTauriApi();
  return invoke<void>("start_harness");
}

export async function sendToHarness(
  method: string,
  params: Record<string, unknown>
): Promise<number> {
  await ensureTauriApi();
  return invoke<number>("send_to_harness", { method, params });
}

export async function stopHarness(): Promise<void> {
  await ensureTauriApi();
  return invoke<void>("stop_harness");
}

export interface HarnessEvent {
  id: number;
  event: string;
  data: unknown;
}

type UnlistenFn = () => void;

export async function listenHarnessEvents(
  callback: (event: HarnessEvent) => void
): Promise<UnlistenFn> {
  await ensureTauriApi();
  return listen<HarnessEvent>("harness:event", (e) => {
    callback(e.payload);
  });
}

export function isTauriAvailable(): boolean {
  return isTauri;
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

/** Close every WebviewWindow except the main shell (`label` `main`). */
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
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    md: "markdown",
    rs: "rust",
    py: "python",
    html: "html",
    css: "css",
    scss: "css",
    svelte: "svelte",
    vue: "vue",
    go: "go",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    sql: "sql",
  };
  return langMap[ext] ?? "plaintext";
}
