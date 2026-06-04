/** Format LSP agent tool results as model-legible text (spec 41 §4). */

import type { Diagnostic, DocumentSymbol, Location, SymbolInformation } from "./lspProtocol";
import { DiagnosticSeverity } from "./lspProtocol";
import { normalizeFilePath } from "../fsPath";

function uriToRelPath(uri: string, workspacePath: string): string {
  const abs = normalizeFilePath(uri.replace(/^file:\/\//, ""));
  const root = normalizeFilePath(workspacePath).replace(/\/$/, "");
  return abs.startsWith(`${root}/`) ? abs.slice(root.length + 1) : abs;
}

export function formatLocation(loc: Location, workspacePath: string): string {
  const rel = uriToRelPath(loc.uri, workspacePath);
  const line = loc.range.start.line + 1;
  const col = loc.range.start.character + 1;
  return `${rel}:${line}:${col}`;
}

export function formatReferencesOutput(
  symbolLabel: string,
  locations: Location[],
  workspacePath: string
): string {
  if (locations.length === 0) {
    return "No references found.";
  }
  const lines = locations.map((loc) => formatLocation(loc, workspacePath));
  return `References to \`${symbolLabel}\` (${locations.length} found):\n\n${lines.join("\n")}`;
}

export function formatDefinitionOutput(
  symbolLabel: string,
  locations: Location[],
  workspacePath: string
): string {
  if (locations.length === 0) {
    return "No definition found.";
  }
  if (locations.length === 1) {
    return `Definition of \`${symbolLabel}\`:\n\n${formatLocation(locations[0]!, workspacePath)}`;
  }
  const lines = locations.map((loc) => formatLocation(loc, workspacePath));
  return `Definitions of \`${symbolLabel}\` (${locations.length} found):\n\n${lines.join("\n")}`;
}

const SYMBOL_KIND: Record<number, string> = {
  1: "file",
  2: "module",
  3: "namespace",
  4: "package",
  5: "class",
  6: "method",
  7: "property",
  8: "field",
  9: "constructor",
  10: "enum",
  11: "interface",
  12: "function",
  13: "variable",
  14: "constant",
};

function kindLabel(kind?: number): string {
  return kind != null ? (SYMBOL_KIND[kind] ?? "symbol") : "symbol";
}

function formatDocumentSymbolLine(sym: DocumentSymbol, indent: number): string[] {
  const pad = "  ".repeat(indent);
  const line = sym.range.start.line + 1;
  const kind = kindLabel(sym.kind);
  const out = [`${pad}${sym.name} [${kind}]${sym.detail ? ` — ${sym.detail}` : ""}  line ${line}`];
  for (const child of sym.children ?? []) {
    out.push(...formatDocumentSymbolLine(child, indent + 1));
  }
  return out;
}

export function formatDocumentSymbolsOutput(
  relPath: string,
  symbols: DocumentSymbol[] | SymbolInformation[]
): string {
  if (symbols.length === 0) {
    return `No symbols found in ${relPath}.`;
  }
  const lines: string[] = [`Symbols in ${relPath}:`, ""];
  if ("location" in symbols[0]!) {
    for (const sym of symbols as SymbolInformation[]) {
      const line = sym.location.range.start.line + 1;
      lines.push(`${sym.name} [${kindLabel(sym.kind)}]  line ${line}`);
    }
  } else {
    for (const sym of symbols as DocumentSymbol[]) {
      lines.push(...formatDocumentSymbolLine(sym, 0));
    }
  }
  return lines.join("\n");
}

export function formatWorkspaceSymbolsOutput(
  query: string,
  symbols: SymbolInformation[],
  workspacePath: string
): string {
  if (symbols.length === 0) {
    return `No workspace symbols matching "${query}".`;
  }
  const lines = [`Workspace symbols matching "${query}" (${symbols.length} found):`, ""];
  for (const sym of symbols) {
    const loc = formatLocation(sym.location, workspacePath);
    const kind = kindLabel(sym.kind);
    lines.push(`${sym.name} [${kind}]   ${loc}`);
  }
  return lines.join("\n");
}

function severityLabel(sev?: number): string {
  switch (sev) {
    case DiagnosticSeverity.Error:
      return "ERROR";
    case DiagnosticSeverity.Warning:
      return "WARN";
    case DiagnosticSeverity.Information:
      return "INFO";
    case DiagnosticSeverity.Hint:
      return "HINT";
    default:
      return "DIAG";
  }
}

export function formatDiagnosticsForFile(
  relPath: string,
  diagnostics: Diagnostic[]
): string[] {
  if (diagnostics.length === 0) return [];
  const out: string[] = [];
  for (const d of diagnostics) {
    const line = d.range.start.line + 1;
    const col = d.range.start.character + 1;
    const code = d.code != null ? ` [${d.code}]` : "";
    out.push(`  ${severityLabel(d.severity)}  line ${line}:${col}  ${d.message}${code}`);
  }
  return out;
}

export function formatDiagnosticsOutput(
  workspacePath: string,
  byFile: Map<string, Diagnostic[]>
): string {
  if (byFile.size === 0) {
    return "No diagnostics reported.";
  }
  let total = 0;
  for (const diags of byFile.values()) total += diags.length;
  const fileCount = byFile.size;
  const header =
    fileCount === 1 ?
      `Diagnostics for ${[...byFile.keys()][0]} (${total} issue${total === 1 ? "" : "s"}):`
    : `Workspace diagnostics (${total} issue${total === 1 ? "" : "s"} across ${fileCount} files):`;
  const lines = [header, ""];
  for (const [rel, diags] of byFile) {
    if (fileCount > 1) lines.push(rel);
    lines.push(...formatDiagnosticsForFile(rel, diags));
    if (fileCount > 1) lines.push("");
  }
  return lines.join("\n").trim();
}

export function lspNotAvailableMessage(languageId: string): string {
  return (
    `LSP server not available for ${languageId}. Install and enable a language server ` +
    `in Settings → LSP, or use grep to search by text pattern.`
  );
}

export function lspTimeoutMessage(method: string, elapsedMs: number): string {
  return (
    `LSP request timed out after ${elapsedMs}ms (${method}). ` +
    `The server may still be indexing. Try again or use grep.`
  );
}

export function lspUnknownLanguageMessage(ext: string): string {
  return `Cannot determine language for ".${ext}" files.`;
}
