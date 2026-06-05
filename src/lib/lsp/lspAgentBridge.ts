/** Agent-facing LSP queries via the frontend LspClient (spec 41 §3, §7). */

import { get } from "svelte/store";
import { readFile } from "../ipc";
import { normalizeFilePath } from "../fsPath";
import { resolveWorkspacePath } from "../tools/pathUtils";
import { LspClient } from "./lspClient";
import type { Diagnostic, Position } from "./lspProtocol";
import {
  formatDefinitionOutput,
  formatDiagnosticsOutput,
  formatDocumentSymbolsOutput,
  formatReferencesOutput,
  formatWorkspaceSymbolsOutput,
  lspNotAvailableMessage,
  lspTimeoutMessage,
  lspUnknownLanguageMessage,
} from "./lspAgentFormat";
import {
  languageIdForPath,
  languageIdLabel,
  resolvedLanguageIdForPath,
} from "./lspLanguage";
import { getLspConfigForLanguage, isLspEnabledForLanguage } from "./lspSettings";
import { ensureLspServer, getDiagnosticsForUri, lspDiagnostics } from "./lspStore";

export const LSP_TOOL_NAMES = [
  "lsp_find_references",
  "lsp_go_to_definition",
  "lsp_document_symbols",
  "lsp_workspace_symbols",
  "lsp_get_diagnostics",
] as const;

export type LspToolName = (typeof LSP_TOOL_NAMES)[number];

export function isLspTool(name: string): name is LspToolName {
  return (LSP_TOOL_NAMES as readonly string[]).includes(name);
}

const openDocs = new Set<string>();

function pathToUri(absPath: string): string {
  return `file://${normalizeFilePath(absPath)}`;
}

function uriToRel(uri: string, workspacePath: string): string {
  const abs = normalizeFilePath(uri.replace(/^file:\/\//, ""));
  const root = normalizeFilePath(workspacePath).replace(/\/$/, "");
  return abs.startsWith(`${root}/`) ? abs.slice(root.length + 1) : abs;
}

function toLspPosition(line: number, character: number): Position {
  return {
    line: Math.max(0, Math.floor(line) - 1),
    character: Math.max(0, Math.floor(character) - 1),
  };
}

async function getClientForFile(
  workspacePath: string,
  relPath: string
): Promise<
  | { ok: true; client: LspClient; uri: string; relPath: string }
  | { ok: false; output: string }
> {
  const absPath = resolveWorkspacePath(workspacePath, relPath);
  const languageId = languageIdForPath(relPath);
  if (!languageId) {
    const ext = relPath.split(".").pop() ?? "?";
    return { ok: false, output: lspUnknownLanguageMessage(ext) };
  }
  const serverLang = resolvedLanguageIdForPath(relPath) ?? languageId;
  if (!isLspEnabledForLanguage(serverLang)) {
    return { ok: false, output: lspNotAvailableMessage(languageIdLabel(serverLang)) };
  }
  const cfg = getLspConfigForLanguage(serverLang);
  if (!cfg?.enabled) {
    return { ok: false, output: lspNotAvailableMessage(languageIdLabel(serverLang)) };
  }
  const client = await ensureLspServer(serverLang, workspacePath, cfg.command, cfg.args);
  if (!client?.isRunning) {
    return { ok: false, output: lspNotAvailableMessage(languageIdLabel(serverLang)) };
  }
  const uri = pathToUri(absPath);
  const openKey = `${serverLang}:${uri}`;
  if (!openDocs.has(openKey)) {
    try {
      const text = await readFile(workspacePath, absPath);
      await client.didOpen(uri, text, languageId, 1);
      openDocs.add(openKey);
    } catch (e) {
      return {
        ok: false,
        output: `Failed to open file for LSP: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }
  return { ok: true, client, uri, relPath };
}

async function getAnyRunningClient(workspacePath: string): Promise<LspClient | null> {
  for (const lang of ["typescript", "rust", "python", "go", "svelte"] as const) {
    if (!isLspEnabledForLanguage(lang)) continue;
    const cfg = getLspConfigForLanguage(lang);
    if (!cfg?.enabled) continue;
    const client = await ensureLspServer(lang, workspacePath, cfg.command, cfg.args);
    if (client?.isRunning) return client;
  }
  return null;
}

export type LspAgentLimits = {
  lspToolTimeout: number;
  lspWorkspaceSymbolTimeout: number;
};

const DEFAULT_LSP_LIMITS: LspAgentLimits = {
  lspToolTimeout: 5000,
  lspWorkspaceSymbolTimeout: 8000,
};

export async function runLspFindReferences(
  workspacePath: string,
  args: Record<string, unknown>,
  limits: LspAgentLimits = DEFAULT_LSP_LIMITS
): Promise<{ success: boolean; output: string }> {
  const file = String(args.file ?? "");
  const line = Number(args.line);
  const character = Number(args.character);
  const includeDeclaration = args.include_declaration === true;
  if (!file || !Number.isFinite(line) || !Number.isFinite(character)) {
    return { success: false, output: "Error: file, line, and character are required." };
  }
  const ctx = await getClientForFile(workspacePath, file);
  if (!ctx.ok) return { success: false, output: ctx.output };
  try {
    const locs = await ctx.client.references(
      ctx.uri,
      toLspPosition(line, character),
      includeDeclaration,
      limits.lspToolTimeout
    );
    const label = String(args.symbol ?? "symbol");
    return { success: true, output: formatReferencesOutput(label, locs, workspacePath) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("timed out")) {
      return {
        success: false,
        output: lspTimeoutMessage("textDocument/references", limits.lspToolTimeout),
      };
    }
    return { success: false, output: `LSP error: ${msg}` };
  }
}

export async function runLspGoToDefinition(
  workspacePath: string,
  args: Record<string, unknown>,
  limits: LspAgentLimits = DEFAULT_LSP_LIMITS
): Promise<{ success: boolean; output: string }> {
  const file = String(args.file ?? "");
  const line = Number(args.line);
  const character = Number(args.character);
  if (!file || !Number.isFinite(line) || !Number.isFinite(character)) {
    return { success: false, output: "Error: file, line, and character are required." };
  }
  const ctx = await getClientForFile(workspacePath, file);
  if (!ctx.ok) return { success: false, output: ctx.output };
  try {
    const result = await ctx.client.definition(
      ctx.uri,
      toLspPosition(line, character),
      limits.lspToolTimeout
    );
    const locs = !result ? [] : Array.isArray(result) ? result : [result];
    const label = String(args.symbol ?? "symbol");
    return { success: true, output: formatDefinitionOutput(label, locs, workspacePath) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("timed out")) {
      return {
        success: false,
        output: lspTimeoutMessage("textDocument/definition", limits.lspToolTimeout),
      };
    }
    return { success: false, output: `LSP error: ${msg}` };
  }
}

export async function runLspDocumentSymbols(
  workspacePath: string,
  args: Record<string, unknown>,
  limits: LspAgentLimits = DEFAULT_LSP_LIMITS
): Promise<{ success: boolean; output: string }> {
  const file = String(args.file ?? "");
  if (!file) return { success: false, output: "Error: file is required." };
  const ctx = await getClientForFile(workspacePath, file);
  if (!ctx.ok) return { success: false, output: ctx.output };
  try {
    const symbols = await ctx.client.documentSymbol(ctx.uri, limits.lspToolTimeout);
    return { success: true, output: formatDocumentSymbolsOutput(ctx.relPath, symbols) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("timed out")) {
      return {
        success: false,
        output: lspTimeoutMessage("textDocument/documentSymbol", limits.lspToolTimeout),
      };
    }
    return { success: false, output: `LSP error: ${msg}` };
  }
}

export async function runLspWorkspaceSymbols(
  workspacePath: string,
  args: Record<string, unknown>,
  limits: LspAgentLimits = DEFAULT_LSP_LIMITS
): Promise<{ success: boolean; output: string }> {
  const query = String(args.query ?? "").trim();
  if (!query) return { success: false, output: "Error: query is required." };
  const client = await getAnyRunningClient(workspacePath);
  if (!client) {
    return {
      success: false,
      output: lspNotAvailableMessage("workspace (no language server running)"),
    };
  }
  try {
    const symbols = await client.workspaceSymbol(query, limits.lspWorkspaceSymbolTimeout);
    return { success: true, output: formatWorkspaceSymbolsOutput(query, symbols, workspacePath) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("timed out")) {
      return {
        success: false,
        output: lspTimeoutMessage("workspace/symbol", limits.lspWorkspaceSymbolTimeout),
      };
    }
    return { success: false, output: `LSP error: ${msg}` };
  }
}

export async function runLspGetDiagnostics(
  workspacePath: string,
  args: Record<string, unknown>
): Promise<{ success: boolean; output: string }> {
  const file = args.file != null ? String(args.file).trim() : "";
  const root = normalizeFilePath(workspacePath).replace(/\/$/, "");
  const byFile = new Map<string, Diagnostic[]>();

  if (file) {
    const abs = resolveWorkspacePath(workspacePath, file);
    const uri = pathToUri(abs);
    byFile.set(file.replace(/\\/g, "/"), getDiagnosticsForUri(uri));
  } else {
    for (const [uri, diags] of get(lspDiagnostics)) {
      if (!uri.startsWith(`file://${root}`)) continue;
      const rel = uriToRel(uri, workspacePath);
      if (diags.length) byFile.set(rel, diags);
    }
  }

  return { success: true, output: formatDiagnosticsOutput(workspacePath, byFile) };
}

export async function runLspAgentTool(
  name: LspToolName,
  args: Record<string, unknown>,
  workspacePath: string,
  limits?: LspAgentLimits
): Promise<{ success: boolean; output: string }> {
  const l = limits ?? DEFAULT_LSP_LIMITS;
  switch (name) {
    case "lsp_find_references":
      return runLspFindReferences(workspacePath, args, l);
    case "lsp_go_to_definition":
      return runLspGoToDefinition(workspacePath, args, l);
    case "lsp_document_symbols":
      return runLspDocumentSymbols(workspacePath, args, l);
    case "lsp_workspace_symbols":
      return runLspWorkspaceSymbols(workspacePath, args, l);
    case "lsp_get_diagnostics":
      return runLspGetDiagnostics(workspacePath, args);
    default:
      return { success: false, output: `Unknown LSP tool: ${name}` };
  }
}
