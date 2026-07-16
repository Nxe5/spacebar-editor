import { readFile, pathExists } from "../ipc";
import { applyStrReplace } from "../tools/strReplace";
import { resolveWorkspacePath } from "../tools/pathUtils";

export const FILE_EDIT_TOOLS = new Set(["write_file", "create_file", "str_replace"]);

export interface FileEditPreview {
  path: string;
  before: string;
  after: string;
  isNewFile: boolean;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** Build a before/after preview for file mutation tools shown in approval UI. */
export async function buildFileEditPreview(
  tool: string,
  args: Record<string, unknown>,
  workspacePath: string
): Promise<FileEditPreview | null> {
  if (!FILE_EDIT_TOOLS.has(tool)) return null;

  const relPath = asString(args.path);
  if (!relPath) return null;

  const resolved = resolveWorkspacePath(workspacePath, relPath);
  const exists = await pathExists(workspacePath, resolved).catch(() => false);
  const before = exists ? await readFile(workspacePath, resolved).catch(() => "") : "";

  if (tool === "write_file" || tool === "create_file") {
    if (args.content === undefined) return null;
    return {
      path: relPath,
      before,
      after: String(args.content),
      isNewFile: !exists,
    };
  }

  if (tool === "str_replace") {
    const oldStr = asString(args.old_str);
    if (oldStr == null || args.new_str === undefined) return null;
    const replaceAll = args.replace_all === true;
    const result = applyStrReplace(before, oldStr, String(args.new_str), replaceAll);
    if (!result.ok) {
      return {
        path: relPath,
        before,
        after: `Preview unavailable: ${result.error}`,
        isNewFile: false,
      };
    }
    return {
      path: relPath,
      before,
      after: result.content,
      isNewFile: false,
    };
  }

  return null;
}

/** Compact unified-style diff lines for the approval panel (not a full diff engine). */
export function summarizeEditPreview(preview: FileEditPreview, maxLines = 24): string {
  const beforeLines = preview.before.split("\n");
  const afterLines = preview.after.split("\n");
  const header = preview.isNewFile
    ? `New file: ${preview.path}`
    : `Edit: ${preview.path}`;

  if (preview.after.startsWith("Preview unavailable:")) {
    return `${header}\n\n${preview.after}`;
  }

  const removed = beforeLines.filter((line) => !afterLines.includes(line)).slice(0, maxLines / 2);
  const added = afterLines.filter((line) => !beforeLines.includes(line)).slice(0, maxLines / 2);
  const chunks: string[] = [header, ""];
  for (const line of removed) chunks.push(`- ${line}`);
  for (const line of added) chunks.push(`+ ${line}`);
  const shown = removed.length + added.length;
  const totalDelta = Math.abs(afterLines.length - beforeLines.length);
  if (shown === 0 && beforeLines.join("\n") === afterLines.join("\n")) {
    chunks.push("(no line-level changes detected)");
  } else if (shown >= maxLines || totalDelta > maxLines) {
    chunks.push("…");
  }
  return chunks.join("\n");
}
