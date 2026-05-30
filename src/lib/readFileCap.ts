/** Global agent setting: cap read_file output by line count or % of context window. */

export type ReadFileCapMode = "lines" | "percent";

export type ReadFileCapSettings = {
  mode: ReadFileCapMode;
  /** Used when mode is `lines` (default 500). */
  maxLines: number;
  /** Used when mode is `percent` — share of active model context window (default 5). */
  maxPercent: number;
};

export const DEFAULT_READ_FILE_CAP: ReadFileCapSettings = {
  mode: "lines",
  maxLines: 500,
  maxPercent: 5,
};

/** Rough tokens per line for code when converting context % → line cap. */
export const READ_FILE_TOKENS_PER_LINE = 20;

export const READ_FILE_CAP_BOUNDS = {
  maxLines: { min: 50, max: 5000 },
  maxPercent: { min: 1, max: 50 },
} as const;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export function normalizeReadFileCap(raw: Partial<ReadFileCapSettings> | undefined): ReadFileCapSettings {
  const mode: ReadFileCapMode = raw?.mode === "percent" ? "percent" : "lines";
  return {
    mode,
    maxLines: clampInt(
      raw?.maxLines,
      READ_FILE_CAP_BOUNDS.maxLines.min,
      READ_FILE_CAP_BOUNDS.maxLines.max,
      DEFAULT_READ_FILE_CAP.maxLines
    ),
    maxPercent: clampInt(
      raw?.maxPercent,
      READ_FILE_CAP_BOUNDS.maxPercent.min,
      READ_FILE_CAP_BOUNDS.maxPercent.max,
      DEFAULT_READ_FILE_CAP.maxPercent
    ),
  };
}

/** Resolve the effective max_lines for a read_file call at runtime. */
export function resolveReadFileMaxLines(
  cap: ReadFileCapSettings,
  contextWindow: number,
  requestMaxLines?: number
): number {
  if (typeof requestMaxLines === "number" && requestMaxLines > 0) {
    return clampInt(
      requestMaxLines,
      READ_FILE_CAP_BOUNDS.maxLines.min,
      READ_FILE_CAP_BOUNDS.maxLines.max,
      DEFAULT_READ_FILE_CAP.maxLines
    );
  }
  if (cap.mode === "lines") return cap.maxLines;
  const tokenBudget = Math.floor(contextWindow * (cap.maxPercent / 100));
  const fromPercent = Math.floor(tokenBudget / READ_FILE_TOKENS_PER_LINE);
  return Math.max(READ_FILE_CAP_BOUNDS.maxLines.min, fromPercent);
}

export function resolveReadFileStartLine(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 1;
  return Math.max(1, Math.floor(raw));
}
