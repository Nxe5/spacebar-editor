/**
 * Active LSP server registry (spec 25 §4, lspStore.ts).
 *
 * Manages one LspClient per language per workspace. Feeds diagnostics into
 * the existing `editorErrorCountsByRel` store so the explorer can show counts.
 */
import { writable, get } from "svelte/store";
import type { Diagnostic } from "./lspProtocol";
import { LspClient } from "./lspClient";
import { setEditorErrorCounts } from "../stores/editorDiagnostics";
import { normalizeFilePath } from "../fsPath";
import { LSP_BINARY_NAMES, LSP_INSTALL_HINTS } from "./lspProtocol";

// ---------------------------------------------------------------------------
// Public stores
// ---------------------------------------------------------------------------

/** Diagnostics by file URI: uri → Diagnostic[]. */
export const lspDiagnostics = writable<Map<string, Diagnostic[]>>(new Map());

/** Server status per language. */
export type LspStatus = "stopped" | "starting" | "running" | "error";
export const lspServerStatus = writable<Map<string, LspStatus>>(new Map());

/** Last spawn error per language (for Settings UI). */
export const lspServerErrors = writable<Map<string, string>>(new Map());

// ---------------------------------------------------------------------------
// Active clients
// ---------------------------------------------------------------------------

const clients = new Map<string, LspClient>();
/** Languages that failed to start — skip retries until settings change. */
const failedStarts = new Set<string>();

/** Clear cached failure so the next file open retries spawn. */
export function clearLspFailure(language: string): void {
  failedStarts.delete(language);
  lspServerErrors.update((m) => {
    const next = new Map(m);
    next.delete(language);
    return next;
  });
  lspServerStatus.update((m) => {
    const next = new Map(m);
    if (next.get(language) === "error") next.set(language, "stopped");
    return next;
  });
}

function formatSpawnError(language: string, cmd: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/no such file|not found|enoent/i.test(msg)) {
    const hint = LSP_INSTALL_HINTS[language];
    return hint
      ? `'${cmd}' not found on PATH. Install: ${hint}`
      : `'${cmd}' not found on PATH. Install the server or set a custom path in Settings → LSP.`;
  }
  return msg;
}

// ---------------------------------------------------------------------------
// Diagnostics path helpers
// ---------------------------------------------------------------------------

function uriToPath(uri: string): string {
  return normalizeFilePath(uri.replace(/^file:\/\//, ""));
}

function pathRelative(absPath: string, workspacePath: string): string {
  const ws = normalizeFilePath(workspacePath).replace(/\/$/, "");
  const p = normalizeFilePath(absPath);
  return p.startsWith(`${ws}/`) ? p.slice(ws.length + 1) : p;
}

function rebuildErrorCounts(workspacePath: string): void {
  const counts = new Map<string, number>();
  for (const [uri, diags] of get(lspDiagnostics)) {
    const errors = diags.filter((d) => (d.severity ?? 1) === 1).length;
    if (errors > 0) {
      const rel = pathRelative(uriToPath(uri), workspacePath);
      counts.set(rel, (counts.get(rel) ?? 0) + errors);
    }
  }
  setEditorErrorCounts(counts);
}

// ---------------------------------------------------------------------------
// Server management
// ---------------------------------------------------------------------------

/**
 * Ensure a server is running for `language` in `workspacePath`.
 * `command` is the resolved binary path (null → use well-known name).
 * `args` are passed to the server (e.g. ["--stdio"]).
 */
export async function ensureLspServer(
  language: string,
  workspacePath: string,
  command: string | null,
  args: string[],
): Promise<LspClient | null> {
  const key = `${language}:${workspacePath}`;
  if (clients.has(key)) return clients.get(key)!;
  if (failedStarts.has(language)) return null;

  const cmd = command ?? LSP_BINARY_NAMES[language];
  if (!cmd) return null;

  lspServerStatus.update((m) => new Map(m).set(language, "starting"));

  const client = new LspClient(cmd, args, workspacePath, language);
  client.onDiagnostics = (uri, diags) => {
    lspDiagnostics.update((m) => {
      const next = new Map(m);
      next.set(uri, diags);
      return next;
    });
    rebuildErrorCounts(workspacePath);
  };
  client.onExit = (_code) => {
    clients.delete(key);
    lspServerStatus.update((m) => {
      const next = new Map(m);
      next.set(language, "stopped");
      return next;
    });
  };

  try {
    await client.start();
    clients.set(key, client);
    lspServerStatus.update((m) => new Map(m).set(language, "running"));
    return client;
  } catch (e) {
    const message = formatSpawnError(language, cmd, e);
    failedStarts.add(language);
    console.warn(`[lsp] failed to start ${cmd}: ${message}`);
    lspServerErrors.update((m) => new Map(m).set(language, message));
    lspServerStatus.update((m) => new Map(m).set(language, "error"));
    return null;
  }
}

/** Stop all servers for a workspace (e.g. on workspace close). */
export function stopLspForWorkspace(workspacePath: string): void {
  for (const [key, client] of clients) {
    if (key.endsWith(`:${workspacePath}`)) {
      client.stop();
      clients.delete(key);
    }
  }
  // Clear diagnostics for this workspace.
  lspDiagnostics.update((m) => {
    const next = new Map(m);
    const prefix = `file://${workspacePath}/`;
    for (const uri of next.keys()) {
      if (uri.startsWith(prefix)) next.delete(uri);
    }
    return next;
  });
  rebuildErrorCounts(workspacePath);
}

/** Stop everything (app shutdown). */
export function stopAllLspClients(): void {
  for (const client of clients.values()) client.stop();
  clients.clear();
}

/** Get diagnostics for a specific file URI. */
export function getDiagnosticsForUri(uri: string): Diagnostic[] {
  return get(lspDiagnostics).get(uri) ?? [];
}
