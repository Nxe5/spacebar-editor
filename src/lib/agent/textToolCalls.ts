import type { StoredToolCall } from "../stores/chat";

/**
 * Matches any fenced code block, capturing the info/language tag and the body
 * separately. Splitting them out is essential: a ```` ```python ```` block must
 * NOT be treated as a JSON tool call just because its code happens to contain a
 * `"name":` key (e.g. a Python dict or package.json snippet).
 */
const CODE_FENCE = /```([a-zA-Z0-9_+.#-]*)[ \t]*\r?\n?([\s\S]*?)```/gi;

/** A fence that could plausibly carry a JSON tool call: no language, or `json`. */
function isJsonFenceLang(lang: string): boolean {
  const l = lang.trim().toLowerCase();
  return l === "" || l === "json";
}

/** Trimmed body looks like a JSON object carrying a tool name (real or malformed). */
function bodyLooksLikeToolCallJson(inner: string): boolean {
  if (!inner.startsWith("{")) return false;
  return /"name"\s*:/.test(inner) || /"tool_name"\s*:/.test(inner);
}

const TOOL_NAME_ALIASES: Record<string, string> = {
  "git status": "get_git_status",
  "git diff": "get_git_diff",
  "git log": "get_git_log",
  grep_file_content: "grep",
  grep_files: "grep",
  grep_content: "grep",
  search_code: "grep",
  search_files: "grep",
  file_search: "find_file",
  find_files: "find_file",
  read: "read_file",
  write: "write_file",
  list_directory: "list_dir",
  list_files: "list_dir",
  ls: "list_dir",
  dir: "list_dir",
  ll: "list_dir",
  run_command: "run_shell",
  shell: "run_shell",
  execute_command: "run_shell",
  find_all_references: "lsp_find_references",
  find_references: "lsp_find_references",
  go_to_definition: "lsp_go_to_definition",
  document_symbols: "lsp_document_symbols",
  workspace_symbols: "lsp_workspace_symbols",
  get_diagnostics: "lsp_get_diagnostics",
};

/** Map common hallucinated argument keys to our tool schemas. */
export function normalizeToolArguments(
  toolName: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...args };
  if (toolName === "grep") {
    if (out.pattern == null) {
      const pattern =
        out.search_string ?? out.query ?? out.search ?? out.text ?? out.term;
      if (typeof pattern === "string" && pattern.trim()) {
        out.pattern = pattern;
      }
    }
    if (out.file_glob == null && typeof out.file_pattern === "string") {
      out.file_glob = out.file_pattern;
    }
    if (out.file_glob == null && typeof out.glob === "string") {
      out.file_glob = out.glob;
    }
  }
  if (toolName === "read_file" && out.path == null && typeof out.file === "string") {
    out.path = out.file;
  }
  if (toolName === "list_dir") {
    if (out.path == null) {
      const p = out.directory ?? out.dir ?? out.folder ?? out.pathname;
      if (typeof p === "string" && p.trim()) out.path = p;
      else if (Object.keys(out).length === 0) out.path = ".";
    }
  }
  if (toolName === "find_file" && out.glob == null) {
    const g = out.pattern ?? out.query ?? out.name;
    if (typeof g === "string") out.glob = g;
  }
  if (toolName === "run_shell" && out.command == null) {
    const cmd = out.cmd ?? out.script ?? out.shell_command;
    if (typeof cmd === "string") out.command = cmd;
  }
  return out;
}

export function normalizeToolName(raw: string): string {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  const alias = TOOL_NAME_ALIASES[lower] ?? TOOL_NAME_ALIASES[trimmed];
  return alias ?? trimmed;
}

function tryParseObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Scan content for balanced `{ ... }` objects (handles multi-line nested JSON). */
export function extractTopLevelJsonObjects(
  content: string
): Array<{ raw: string; start: number; end: number }> {
  const out: Array<{ raw: string; start: number; end: number }> = [];
  let i = 0;
  while (i < content.length) {
    const start = content.indexOf("{", i);
    if (start === -1) break;
    let depth = 0;
    let inString = false;
    let escape = false;
    let closed = false;
    for (let j = start; j < content.length; j++) {
      const c = content[j];
      if (inString) {
        if (escape) escape = false;
        else if (c === "\\") escape = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') {
        inString = true;
        continue;
      }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          const raw = content.slice(start, j + 1);
          out.push({ raw, start, end: j + 1 });
          i = j + 1;
          closed = true;
          break;
        }
      }
    }
    if (!closed) break;
  }
  return out;
}

function looksLikeToolCallObject(obj: Record<string, unknown>): boolean {
  return Boolean(readToolNameFromRecord(obj));
}

function isHallucinatedToolRecord(obj: Record<string, unknown>): boolean {
  if ("result" in obj || "output" in obj || "response" in obj) return true;
  const name = readToolNameFromRecord(obj).toLowerCase();
  if (name.includes("porto")) return true;
  return false;
}

function readToolNameFromRecord(obj: Record<string, unknown>): string {
  if (typeof obj.name === "string" && obj.name.trim()) return obj.name;
  if (typeof obj.tool_name === "string" && obj.tool_name.trim()) return obj.tool_name;
  const fn = obj.function;
  if (fn && typeof fn === "object" && !Array.isArray(fn)) {
    const name = (fn as Record<string, unknown>).name;
    if (typeof name === "string" && name.trim()) return name;
  }
  return "";
}

function toStoredToolCall(obj: Record<string, unknown>, allowedTools: Set<string>): StoredToolCall | null {
  if (isHallucinatedToolRecord(obj)) return null;
  const rawName = readToolNameFromRecord(obj);
  if (!rawName.trim()) return null;
  const name = normalizeToolName(rawName);
  if (!allowedTools.has(name)) return null;

  const argsRaw =
    obj.arguments && typeof obj.arguments === "object" && !Array.isArray(obj.arguments)
      ? (obj.arguments as Record<string, unknown>)
      : obj.args && typeof obj.args === "object" && !Array.isArray(obj.args)
        ? (obj.args as Record<string, unknown>)
        : {};

  const args = normalizeToolArguments(name, argsRaw);

  return {
    id: `recovered-${crypto.randomUUID()}`,
    name,
    arguments: JSON.stringify(args),
  };
}

// ---------------------------------------------------------------------------
// Token-delimited tool calls (Gemma / template-leak formats)
//
// Some local models (e.g. Gemma via Ollama) emit tool calls using special
// template tokens that leak into the text instead of the API tool_calls field:
//
//   <|tool_call>call:run_shell{command:<|"|>ls -F<|"|>}<tool_call|>
//
// where `<|"|>` is the model's quote token. We recover these into real calls.
// ---------------------------------------------------------------------------

/** Matches a `<|tool_call>` … `<tool_call|>` block (delimiters may vary slightly). */
const DELIMITED_TOOL_CALL = /<\|?tool_call\|?>([\s\S]*?)<\|?\/?tool_call\|?>/gi;
/** The model's quote token, e.g. `<|"|>value<|"|>`. */
const QUOTE_TOKEN = /<\|"\|>/g;

/** Parse an args body like `command:<|"|>ls -F<|"|>, count:3` into an object. */
export function parseDelimitedArgs(body: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  // key : ( <|"|>…<|"|> | "…" | '…' | bareValue )
  const re =
    /([a-zA-Z_][a-zA-Z0-9_]*)\s*[:=]\s*(?:<\|"\|>([\s\S]*?)<\|"\|>|"((?:[^"\\]|\\.)*)"|'([^']*)'|([^,}]+?))(?=\s*[,}]|\s*$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const key = m[1];
    if (m[2] !== undefined) {
      args[key] = m[2];
    } else if (m[3] !== undefined) {
      args[key] = m[3].replace(/\\(.)/g, "$1");
    } else if (m[4] !== undefined) {
      args[key] = m[4];
    } else if (m[5] !== undefined) {
      const t = m[5].trim();
      if (t === "true") args[key] = true;
      else if (t === "false") args[key] = false;
      else if (t === "null") args[key] = null;
      else if (/^-?\d+(\.\d+)?$/.test(t)) args[key] = Number(t);
      else args[key] = t;
    }
  }
  return args;
}

/** Extract `[call:]name{args}` or embedded JSON from a delimited chunk. */
function parseDelimitedToolCallChunk(
  chunk: string,
  allowedTools: Set<string>
): StoredToolCall | null {
  const jsonStart = chunk.indexOf("{");
  if (jsonStart >= 0) {
    for (const { raw } of extractTopLevelJsonObjects(chunk.slice(jsonStart))) {
      const obj = tryParseObject(raw);
      if (obj) {
        const tc = toStoredToolCall(obj, allowedTools);
        if (tc) return tc;
      }
    }
  }
  return parseCallExpression(chunk, allowedTools);
}

/** Extract `[call:]name{args}` from a chunk; returns null if no allowed tool shape found. */
function parseCallExpression(
  chunk: string,
  allowedTools: Set<string>
): StoredToolCall | null {
  const m = chunk.match(/(?:call\d*\s*[:=])?\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\{([\s\S]*)\})?/);
  if (!m) return null;
  const name = normalizeToolName(m[1]);
  if (!allowedTools.has(name)) return null;
  const argsRaw = m[2] != null ? parseDelimitedArgs(m[2]) : {};
  const args = normalizeToolArguments(name, argsRaw);
  return {
    id: `recovered-${crypto.randomUUID()}`,
    name,
    arguments: JSON.stringify(args),
  };
}

/**
 * Recover token-delimited tool calls. Matches both `<|tool_call>…<tool_call|>`
 * blocks and bare `call:name{…}` expressions (the latter only when `name` is an
 * allowed tool, to avoid false positives in prose).
 */
export function extractDelimitedToolCalls(
  content: string,
  allowedTools: Set<string>
): Array<{ call: StoredToolCall; raw: string }> {
  const out: Array<{ call: StoredToolCall; raw: string }> = [];
  const consumed: Array<[number, number]> = [];

  for (const block of content.matchAll(DELIMITED_TOOL_CALL)) {
    const call = parseDelimitedToolCallChunk(block[1] ?? "", allowedTools);
    if (call) {
      out.push({ call, raw: block[0] });
      if (block.index != null) consumed.push([block.index, block.index + block[0].length]);
    }
  }

  // Bare `call:name{…}` not already inside a matched delimited block.
  const bare = /(call\s*[:=]\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\{[\s\S]*?\})/g;
  let bm: RegExpExecArray | null;
  while ((bm = bare.exec(content)) !== null) {
    const start = bm.index;
    const end = start + bm[1].length;
    if (consumed.some(([s, e]) => start >= s && end <= e)) continue;
    const call = parseCallExpression(bm[1], allowedTools);
    if (call) out.push({ call, raw: bm[1] });
  }

  return out;
}

/** Pull tool invocations out of markdown/JSON the model wrote instead of using API tool_calls. */
export function recoverToolCallsFromText(
  content: string,
  allowedTools: Set<string>
): { calls: StoredToolCall[]; cleanedText: string } {
  const calls: StoredToolCall[] = [];
  const seen = new Set<string>();
  let cleaned = content;

  // Token-delimited tool calls (Gemma-style template leaks) first.
  for (const { call, raw } of extractDelimitedToolCalls(content, allowedTools)) {
    const key = `${call.name}:${call.arguments}`;
    if (seen.has(key)) continue;
    seen.add(key);
    calls.push(call);
    cleaned = cleaned.replace(raw, "");
  }

  const tryAdd = (obj: Record<string, unknown>, rawSlice: string) => {
    const tc = toStoredToolCall(obj, allowedTools);
    if (!tc) return;
    const key = `${tc.name}:${tc.arguments}`;
    if (seen.has(key)) return;
    seen.add(key);
    calls.push(tc);
    cleaned = cleaned.replace(rawSlice, "");
  };

  for (const match of content.matchAll(CODE_FENCE)) {
    if (!isJsonFenceLang(match[1] ?? "")) continue;
    const raw = match[0];
    const inner = match[2]?.trim();
    if (!inner) continue;
    const obj = tryParseObject(inner);
    if (obj) tryAdd(obj, raw);
  }

  // Exclude every fenced block (any language) from the bare-object scan below,
  // so JSON-looking snippets inside ```python / ```js code are left as content.
  const fencedRanges: Array<{ start: number; end: number }> = [];
  for (const match of content.matchAll(CODE_FENCE)) {
    if (match.index != null) {
      fencedRanges.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  CODE_FENCE.lastIndex = 0;

  for (const { raw, start, end } of extractTopLevelJsonObjects(content)) {
    if (fencedRanges.some((r) => start >= r.start && end <= r.end)) continue;
    const obj = tryParseObject(raw);
    if (obj && looksLikeToolCallObject(obj)) tryAdd(obj, raw);
  }

  cleaned = cleaned
    .replace(/```(?:json)?\s*```/gi, "")
    // Strip any leftover tool-call / quote template tokens (Gemma-style).
    .replace(/<\|?\/?tool_call\|?>/gi, "")
    .replace(QUOTE_TOKEN, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { calls, cleanedText: cleaned };
}

/** JSON-like tool call blocks that failed to parse (spec 22 §5). */
export function findMalformedToolCallFragments(content: string): string[] {
  const errors: string[] = [];
  for (const match of content.matchAll(CODE_FENCE)) {
    // Only a json/no-language fence whose body is a JSON object with a tool
    // name can be a (broken) tool call. This skips ```python / ```js code and
    // prose objects that merely contain a `"name":` key.
    if (!isJsonFenceLang(match[1] ?? "")) continue;
    const inner = match[2]?.trim();
    if (!inner || !bodyLooksLikeToolCallJson(inner)) continue;
    if (tryParseObject(inner)) continue;
    errors.push(inner.slice(0, 200));
  }
  return errors;
}

export function formatToolParseError(raw: string): string {
  return `[Tool call parse error: model emitted invalid JSON for a tool call.\nRaw (first 200 chars): ${raw}]`;
}

/** Model wrote tool-like JSON or fake results in prose — nothing actually ran. */
export function textLooksLikeFakeToolUse(content: string): boolean {
  if (!content.trim()) return false;
  // A json/no-language fence whose body is a tool-call object — but NOT an
  // ordinary ```python / ```js code block that happens to contain `"name":`.
  for (const match of content.matchAll(CODE_FENCE)) {
    if (!isJsonFenceLang(match[1] ?? "")) continue;
    if (bodyLooksLikeToolCallJson(match[2]?.trim() ?? "")) return true;
  }
  if (/\{"name"\s*:\s*"[^"]+"/.test(content)) return true;
  if (/\{"tool_name"\s*:\s*"[^"]+"/.test(content)) return true;
  if (/porto_file/i.test(content)) return true;
  if (/"result"\s*:\s*\{/.test(content)) return true;
  // Token-delimited tool calls (Gemma-style template leak).
  if (/<\|?tool_call\|?>/i.test(content)) return true;
  return false;
}

export const TOOL_USE_INSTRUCTION = `

Tool use (critical):
- Invoke tools through the API tool_call mechanism only — never write JSON tool calls in your reply text.
- Never invent or simulate tool results (no fake "result" / "output" blocks, no porto_file, no pretend git output).
- If you need to create a file, call write_file or create_file — do not only describe git add/commit unless the file already exists.
- Wait for real tool results before claiming work is done.`;
