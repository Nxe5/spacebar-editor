/**
 * Bash `echo` (without -e) prints `\n` literally. Models often emit those in run_shell commands.
 * Unescape for display (and provider context) when literals dominate over real newlines.
 */
export function unescapeLiteralEscapes(text: string): string {
  if (!/\\[nrt"]/.test(text)) return text;
  const literalNewlines = (text.match(/\\n/g) ?? []).length;
  const realNewlines = (text.match(/\n/g) ?? []).length;
  if (literalNewlines === 0) return text;
  if (realNewlines > literalNewlines) return text;

  return text
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}
