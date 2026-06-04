/**
 * JSON-RPC client for one language server instance (spec 25 §4).
 *
 * Lifecycle:
 *   const client = new LspClient("typescript-language-server", ["--stdio"], ws);
 *   await client.start();           // spawns server, sends initialize
 *   client.onDiagnostics = ...      // subscribe to publishDiagnostics
 *   await client.didOpen(uri, text, lang, version);
 *   // ... user edits ...
 *   await client.didChange(uri, text, version);
 *   const hover = await client.hover(uri, pos);
 *   client.stop();
 */
import {
  spawnLsp, lspSend, lspStop,
  listenLspMessage, listenLspExit,
  isTauriAvailable,
} from "../ipc";
import type {
  LspMessage, RequestMessage, NotificationMessage,
  ResponseMessage, Diagnostic, Hover, Position,
  CompletionList, Location, DocumentSymbol, SymbolInformation,
} from "./lspProtocol";
import { isResponse, isNotification } from "./lspProtocol";

type Resolver = { resolve: (v: unknown) => void; reject: (e: unknown) => void };

export class LspClient {
  private lspId: string | null = null;
  private nextId = 1;
  private pending = new Map<number, Resolver>();
  private unlistenMessage: (() => void) | null = null;
  private unlistenExit: (() => void) | null = null;
  private initialized = false;

  /** Called when the server publishes diagnostics for a file. */
  onDiagnostics: ((uri: string, diagnostics: Diagnostic[]) => void) | null = null;
  /** Called when the server exits unexpectedly. */
  onExit: ((code: number | null) => void) | null = null;

  constructor(
    private readonly serverCmd: string,
    private readonly serverArgs: string[],
    private readonly workspacePath: string,
    private readonly language: string,
  ) {}

  get isRunning(): boolean { return this.lspId !== null && this.initialized; }

  async start(): Promise<void> {
    if (!isTauriAvailable()) return;
    this.lspId = await spawnLsp(this.serverCmd, this.serverArgs, this.workspacePath);

    // Wire up event listeners before initialize so we don't miss the response.
    this.unlistenMessage = await listenLspMessage((id, msg) => {
      if (id === this.lspId) this.handleMessage(msg as LspMessage);
    });
    this.unlistenExit = await listenLspExit((id, code) => {
      if (id === this.lspId) {
        this.lspId = null;
        this.initialized = false;
        this.onExit?.(code);
      }
    });

    await this.initialize();
    this.initialized = true;
  }

  stop(): void {
    if (this.lspId) {
      lspStop(this.lspId).catch(() => {});
      this.lspId = null;
    }
    this.initialized = false;
    this.unlistenMessage?.();
    this.unlistenExit?.();
    this.unlistenMessage = null;
    this.unlistenExit = null;
    for (const { reject } of this.pending.values()) {
      reject(new Error("LSP client stopped"));
    }
    this.pending.clear();
  }

  // -------------------------------------------------------------------------
  // Document lifecycle
  // -------------------------------------------------------------------------

  async didOpen(uri: string, text: string, languageId: string, version = 1): Promise<void> {
    await this.notify("textDocument/didOpen", {
      textDocument: { uri, languageId, version, text },
    });
  }

  async didChange(uri: string, text: string, version: number): Promise<void> {
    await this.notify("textDocument/didChange", {
      textDocument: { uri, version },
      contentChanges: [{ text }],
    });
  }

  async didClose(uri: string): Promise<void> {
    await this.notify("textDocument/didClose", { textDocument: { uri } });
  }

  // -------------------------------------------------------------------------
  // Requests
  // -------------------------------------------------------------------------

  async hover(uri: string, position: Position): Promise<Hover | null> {
    try {
      const result = await this.request("textDocument/hover", {
        textDocument: { uri },
        position,
      });
      return result as Hover | null;
    } catch {
      return null;
    }
  }

  async completion(uri: string, position: Position): Promise<CompletionList | null> {
    try {
      const result = await this.request("textDocument/completion", {
        textDocument: { uri },
        position,
        context: { triggerKind: 1 },
      });
      if (!result) return null;
      if (Array.isArray(result)) return { isIncomplete: false, items: result as never[] };
      return result as CompletionList;
    } catch {
      return null;
    }
  }

  async references(
    uri: string,
    position: Position,
    includeDeclaration = false,
    timeoutMs = 5000
  ): Promise<Location[]> {
    const result = await this.requestWithTimeout(
      "textDocument/references",
      {
        textDocument: { uri },
        position,
        context: { includeDeclaration },
      },
      timeoutMs
    );
    return Array.isArray(result) ? (result as Location[]) : [];
  }

  async definition(
    uri: string,
    position: Position,
    timeoutMs = 5000
  ): Promise<Location | Location[] | null> {
    const result = await this.requestWithTimeout(
      "textDocument/definition",
      { textDocument: { uri }, position },
      timeoutMs
    );
    if (!result) return null;
    if (Array.isArray(result)) return result as Location[];
    return result as Location;
  }

  async documentSymbol(
    uri: string,
    timeoutMs = 3000
  ): Promise<DocumentSymbol[] | SymbolInformation[]> {
    const result = await this.requestWithTimeout(
      "textDocument/documentSymbol",
      { textDocument: { uri } },
      timeoutMs
    );
    return Array.isArray(result) ? result : [];
  }

  async workspaceSymbol(
    query: string,
    timeoutMs = 8000
  ): Promise<SymbolInformation[]> {
    const result = await this.requestWithTimeout(
      "workspace/symbol",
      { query },
      timeoutMs
    );
    return Array.isArray(result) ? (result as SymbolInformation[]) : [];
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private async initialize(): Promise<void> {
    const rootUri = `file://${this.workspacePath}`;
    await this.request("initialize", {
      processId: null,
      rootUri,
      capabilities: {
        textDocument: {
          publishDiagnostics: { relatedInformation: false },
          hover: { contentFormat: ["markdown", "plaintext"] },
          completion: { completionItem: { documentationFormat: ["markdown", "plaintext"] } },
        },
        workspace: { workspaceFolders: false, symbol: { dynamicRegistration: false } },
      },
      initializationOptions: null,
    });
    await this.notify("initialized", {});
  }

  private async request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const msg: RequestMessage = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.sendRaw(msg);
    });
  }

  private async requestWithTimeout(
    method: string,
    params: unknown,
    timeoutMs: number
  ): Promise<unknown> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.request(method, params),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`LSP request timed out after ${timeoutMs}ms`)),
            timeoutMs
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async notify(method: string, params: unknown): Promise<void> {
    const msg: NotificationMessage = { jsonrpc: "2.0", method, params };
    this.sendRaw(msg);
  }

  private sendRaw(msg: LspMessage): void {
    if (!this.lspId) return;
    lspSend(this.lspId, msg).catch((e) => console.error("[lsp] send error", e));
  }

  private handleMessage(msg: LspMessage): void {
    if (isResponse(msg)) {
      const pending = this.pending.get(msg.id as number);
      if (pending) {
        this.pending.delete(msg.id as number);
        if (msg.error) {
          pending.reject(new Error(msg.error.message));
        } else {
          pending.resolve(msg.result);
        }
      }
    } else if (isNotification(msg)) {
      if (msg.method === "textDocument/publishDiagnostics") {
        const { uri, diagnostics } = msg.params as { uri: string; diagnostics: Diagnostic[] };
        this.onDiagnostics?.(uri, diagnostics);
      }
    }
  }
}
