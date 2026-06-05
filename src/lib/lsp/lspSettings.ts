/**
 * LSP server settings — stored independently from the main settings schema
 * so we don't need a settings migration. (spec 25 §7)
 */
import { writable, get } from "svelte/store";
import { type LspServerConfig, DEFAULT_LSP_SERVERS, LSP_BINARY_NAMES } from "./lspProtocol";
import { isTauriAvailable } from "../ipc";
import { clearLspFailure } from "./lspStore";

const LSP_STORAGE_KEY = "sidebar.lsp.v1";

function load(): LspServerConfig[] {
  try {
    const raw = localStorage.getItem(LSP_STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_LSP_SERVERS);
    const parsed = JSON.parse(raw) as LspServerConfig[];
    if (!Array.isArray(parsed)) return structuredClone(DEFAULT_LSP_SERVERS);
    return parsed;
  } catch {
    return structuredClone(DEFAULT_LSP_SERVERS);
  }
}

function save(servers: LspServerConfig[]): void {
  try {
    localStorage.setItem(LSP_STORAGE_KEY, JSON.stringify(servers));
  } catch { /* quota */ }
}

export const lspServers = writable<LspServerConfig[]>(load());

lspServers.subscribe(save);

export function setLspServer(language: string, patch: Partial<LspServerConfig>): void {
  if ("enabled" in patch || "command" in patch || "args" in patch) {
    clearLspFailure(language);
  }
  lspServers.update((servers) => {
    const idx = servers.findIndex((s) => s.language === language);
    if (idx >= 0) {
      const next = [...servers];
      next[idx] = { ...next[idx], ...patch };
      return next;
    }
    return [
      ...servers,
      {
        language,
        enabled: false,
        command: null,
        args: ["--stdio"],
        ...patch,
      },
    ];
  });
}

export function getLspConfigForLanguage(language: string): LspServerConfig | null {
  return get(lspServers).find((s) => s.language === language) ?? null;
}

/** Returns true if a language has an enabled LSP server config. */
export function isLspEnabledForLanguage(language: string): boolean {
  if (!isTauriAvailable()) return false;
  const cfg = getLspConfigForLanguage(language);
  return cfg?.enabled === true;
}

/** Languages that map to the same server (e.g. javascript uses typescript-language-server). */
export function resolvedLanguageForLsp(language: string): string {
  // javascript and jsx both use the typescript-language-server
  if (language === "javascript" || language === "jsx" || language === "tsx") return "typescript";
  return language;
}
