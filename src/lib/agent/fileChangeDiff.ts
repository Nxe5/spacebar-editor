/** Unified diff display for agent file-change bubbles (chat UI). */

export type DiffDisplayLine =
  | { kind: "add"; text: string; newLine: number }
  | { kind: "del"; text: string }
  | { kind: "ctx"; text: string; newLine: number };

export type LineDiffStats = {
  additions: number;
  deletions: number;
};

type DiffOp =
  | { op: "keep"; oldIdx: number; newIdx: number }
  | { op: "add"; newIdx: number }
  | { op: "del"; oldIdx: number };

function splitLines(text: string): string[] {
  return text.length === 0 ? [] : text.split("\n");
}

function lcsTable(oldLines: string[], newLines: string[]): number[][] {
  const n = oldLines.length;
  const m = newLines.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] =
        oldLines[i - 1] === newLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

function traceDiffOps(oldLines: string[], newLines: string[]): DiffOp[] {
  const dp = lcsTable(oldLines, newLines);
  const ops: DiffOp[] = [];
  let i = oldLines.length;
  let j = newLines.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      ops.push({ op: "keep", oldIdx: i - 1, newIdx: j - 1 });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ op: "add", newIdx: j - 1 });
      j--;
    } else {
      ops.push({ op: "del", oldIdx: i - 1 });
      i--;
    }
  }
  ops.reverse();
  return ops;
}

export function buildUnifiedDiffDisplay(oldText: string, newText: string): DiffDisplayLine[] {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  const out: DiffDisplayLine[] = [];
  for (const op of traceDiffOps(oldLines, newLines)) {
    if (op.op === "keep") {
      out.push({ kind: "ctx", text: newLines[op.newIdx] ?? "", newLine: op.newIdx + 1 });
    } else if (op.op === "add") {
      out.push({ kind: "add", text: newLines[op.newIdx] ?? "", newLine: op.newIdx + 1 });
    } else {
      out.push({ kind: "del", text: oldLines[op.oldIdx] ?? "" });
    }
  }
  return out;
}

export function diffLineStats(oldText: string, newText: string): LineDiffStats {
  const lines = buildUnifiedDiffDisplay(oldText, newText);
  return {
    additions: lines.filter((l) => l.kind === "add").length,
    deletions: lines.filter((l) => l.kind === "del").length,
  };
}

/** Prefer change lines; include a little context when collapsed. */
export function sliceDiffPreview(
  lines: DiffDisplayLine[],
  maxLines: number,
  expanded: boolean
): DiffDisplayLine[] {
  if (expanded || lines.length <= maxLines) return lines;

  const firstChange = lines.findIndex((l) => l.kind !== "ctx");
  if (firstChange < 0) return lines.slice(0, maxLines);

  const start = Math.max(0, firstChange - 1);
  return lines.slice(start, start + maxLines);
}

export function newFileContentFromToolInput(input: Record<string, unknown>): string {
  return typeof input.content === "string" ? input.content : "";
}

export function filePathFromToolInput(
  toolName: string,
  input: Record<string, unknown>
): string | null {
  if (toolName === "write_file" || toolName === "create_file") {
    return typeof input.path === "string" && input.path.trim() ? input.path.trim() : null;
  }
  return null;
}

export function isFileChangeBubbleTool(toolName: string, success?: boolean): boolean {
  return success !== false && (toolName === "write_file" || toolName === "create_file");
}
