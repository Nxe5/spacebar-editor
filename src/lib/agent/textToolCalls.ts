import type { StoredToolCall } from "../stores/chat";

const JSON_FENCE = /```(?:json)?\s*([\s\S]*?)```/gi;

const TOOL_NAME_ALIASES: Record<string, string> = {
  "git status": "get_git_status",
  "git diff": "get_git_diff",
  "git log": "get_git_log",
};

export function normalizeToolName(raw: string): string {
  const trimmed = raw.trim();
  const alias = TOOL_NAME_ALIASES[trimmed.toLowerCase()];
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

  const args =
    obj.arguments && typeof obj.arguments === "object" && !Array.isArray(obj.arguments)
      ? (obj.arguments as Record<string, unknown>)
      : obj.args && typeof obj.args === "object" && !Array.isArray(obj.args)
        ? (obj.args as Record<string, unknown>)
        : {};

  return {
    id: `recovered-${crypto.randomUUID()}`,
    name,
    arguments: JSON.stringify(args),
  };
}

/** Pull tool invocations out of markdown/JSON the model wrote instead of using API tool_calls. */
export function recoverToolCallsFromText(
  content: string,
  allowedTools: Set<string>
): { calls: StoredToolCall[]; cleanedText: string } {
  const calls: StoredToolCall[] = [];
  const seen = new Set<string>();
  let cleaned = content;

  const tryAdd = (obj: Record<string, unknown>, rawSlice: string) => {
    const tc = toStoredToolCall(obj, allowedTools);
    if (!tc) return;
    const key = `${tc.name}:${tc.arguments}`;
    if (seen.has(key)) return;
    seen.add(key);
    calls.push(tc);
    cleaned = cleaned.replace(rawSlice, "");
  };

  for (const match of content.matchAll(JSON_FENCE)) {
    const raw = match[0];
    const inner = match[1]?.trim();
    if (!inner) continue;
    const obj = tryParseObject(inner);
    if (obj) tryAdd(obj, raw);
  }

  const fencedRanges: Array<{ start: number; end: number }> = [];
  for (const match of content.matchAll(JSON_FENCE)) {
    if (match.index != null) {
      fencedRanges.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  JSON_FENCE.lastIndex = 0;

  for (const { raw, start, end } of extractTopLevelJsonObjects(content)) {
    if (fencedRanges.some((r) => start >= r.start && end <= r.end)) continue;
    const obj = tryParseObject(raw);
    if (obj && looksLikeToolCallObject(obj)) tryAdd(obj, raw);
  }

  cleaned = cleaned
    .replace(/```(?:json)?\s*```/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { calls, cleanedText: cleaned };
}

/** JSON-like tool call blocks that failed to parse (spec 22 §5). */
export function findMalformedToolCallFragments(content: string): string[] {
  const errors: string[] = [];
  for (const match of content.matchAll(JSON_FENCE)) {
    const inner = match[1]?.trim();
    if (!inner || !(/"name"\s*:/.test(inner) || /"tool_name"\s*:/.test(inner))) continue;
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
  if (JSON_FENCE.test(content)) {
    JSON_FENCE.lastIndex = 0;
    return true;
  }
  if (/\{"name"\s*:\s*"[^"]+"/.test(content)) return true;
  if (/\{"tool_name"\s*:\s*"[^"]+"/.test(content)) return true;
  if (/porto_file/i.test(content)) return true;
  if (/"result"\s*:\s*\{/.test(content)) return true;
  return false;
}

export const TOOL_USE_INSTRUCTION = `

Tool use (critical):
- Invoke tools through the API tool_call mechanism only — never write JSON tool calls in your reply text.
- Never invent or simulate tool results (no fake "result" / "output" blocks, no porto_file, no pretend git output).
- If you need to create a file, call write_file or create_file — do not only describe git add/commit unless the file already exists.
- Wait for real tool results before claiming work is done.`;
