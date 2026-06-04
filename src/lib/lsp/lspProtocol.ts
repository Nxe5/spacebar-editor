/** Subset of LSP types used by Sidebar Editor (spec 25). */

export interface Position {
  line: number;       // 0-based
  character: number;  // 0-based
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  uri: string;
  range: Range;
}

export interface DocumentSymbol {
  name: string;
  detail?: string;
  kind?: number;
  range: Range;
  selectionRange?: Range;
  children?: DocumentSymbol[];
}

export interface SymbolInformation {
  name: string;
  kind?: number;
  location: Location;
  containerName?: string;
}

export const DiagnosticSeverity = {
  Error: 1,
  Warning: 2,
  Information: 3,
  Hint: 4,
} as const;
export type DiagnosticSeverityValue = (typeof DiagnosticSeverity)[keyof typeof DiagnosticSeverity];

export interface Diagnostic {
  range: Range;
  severity?: DiagnosticSeverityValue;
  code?: string | number;
  source?: string;
  message: string;
}

export interface PublishDiagnosticsParams {
  uri: string;
  version?: number;
  diagnostics: Diagnostic[];
}

export interface HoverContents {
  kind: "plaintext" | "markdown";
  value: string;
}

export interface Hover {
  contents: HoverContents | HoverContents[] | string;
  range?: Range;
}

export interface CompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string | { kind: string; value: string };
  insertText?: string;
}

export interface CompletionList {
  isIncomplete: boolean;
  items: CompletionItem[];
}

// ---------------------------------------------------------------------------
// JSON-RPC shapes
// ---------------------------------------------------------------------------

export interface RequestMessage {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

export interface NotificationMessage {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface ResponseMessage {
  jsonrpc: "2.0";
  id: number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export type LspMessage = RequestMessage | NotificationMessage | ResponseMessage;

export function isResponse(m: LspMessage): m is ResponseMessage {
  return "id" in m && ("result" in m || "error" in m);
}

export function isNotification(m: LspMessage): m is NotificationMessage {
  return !("id" in m);
}

// ---------------------------------------------------------------------------
// LSP server config (stored in settings)
// ---------------------------------------------------------------------------

export interface LspServerConfig {
  language: string;
  enabled: boolean;
  /** null = auto-detect on PATH */
  command: string | null;
  args: string[];
}

export const DEFAULT_LSP_SERVERS: LspServerConfig[] = [
  {
    language: "typescript",
    enabled: false,
    command: null,
    args: ["--stdio"],
  },
  {
    language: "javascript",
    enabled: false,
    command: null,
    args: ["--stdio"],
  },
  {
    language: "svelte",
    enabled: false,
    command: null,
    args: ["--stdio"],
  },
];

/** Well-known binary names per language for auto-detection. */
export const LSP_BINARY_NAMES: Record<string, string> = {
  typescript: "typescript-language-server",
  javascript: "typescript-language-server",
  rust: "rust-analyzer",
  python: "pyright-langserver",
  go: "gopls",
  css: "vscode-css-language-server",
  html: "vscode-html-language-server",
  json: "vscode-json-language-server",
  svelte: "svelte-language-server",
};
