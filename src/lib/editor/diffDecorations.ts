import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

const diffAddLine = Decoration.line({ attributes: { class: "cm-diff-line-add" } });
const diffChangeLine = Decoration.line({ attributes: { class: "cm-diff-line-change" } });

export type LineDiffKind = "same" | "add" | "change";

/** Line-level diff kinds for the working copy (new text). */
export function diffLineKinds(oldText: string, newText: string): LineDiffKind[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const n = oldLines.length;
  const m = newLines.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const kinds: LineDiffKind[] = Array(m).fill("change");
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      kinds[j - 1] = "same";
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      kinds[j - 1] = "add";
      j--;
    } else if (i > 0) {
      i--;
    } else {
      j--;
    }
  }

  return kinds;
}

function buildDiffDecorations(view: EditorView, diffBase: string): DecorationSet {
  const doc = view.state.doc.toString();
  const kinds = diffLineKinds(diffBase, doc);
  const builder = new RangeSetBuilder<Decoration>();
  const lineCount = view.state.doc.lines;

  for (let i = 0; i < Math.min(kinds.length, lineCount); i++) {
    const kind = kinds[i];
    if (kind === "same") continue;
    const line = view.state.doc.line(i + 1);
    const mark = kind === "add" ? diffAddLine : diffChangeLine;
    builder.add(line.from, line.from, mark);
  }

  return builder.finish();
}

/** Highlight added/changed lines when `diffBase` is set on the open file. */
export function gitDiffHighlightExtension(getDiffBase: () => string | undefined) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none;

      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.build(update.view);
        }
      }

      build(view: EditorView) {
        const base = getDiffBase();
        if (base === undefined) return Decoration.none;
        return buildDiffDecorations(view, base);
      }
    },
    { decorations: (v) => v.decorations }
  );
}
