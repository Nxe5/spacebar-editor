/** Apply a single unique string replacement to file contents. */

export type StrReplaceResult =
  | { ok: true; content: string; replacements: number }
  | { ok: false; error: string };

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while (true) {
    const next = haystack.indexOf(needle, idx);
    if (next === -1) break;
    count++;
    idx = next + needle.length;
  }
  return count;
}

export function applyStrReplace(
  content: string,
  oldStr: string,
  newStr: string,
  replaceAll = false
): StrReplaceResult {
  if (!oldStr) {
    return { ok: false, error: "old_str must be a non-empty string" };
  }

  const occurrences = countOccurrences(content, oldStr);
  if (occurrences === 0) {
    return {
      ok: false,
      error:
        "old_str not found in file. Read the file again and copy the exact text to replace.",
    };
  }

  if (!replaceAll && occurrences > 1) {
    return {
      ok: false,
      error: `old_str appears ${occurrences} times; it must match exactly once. Add more surrounding context or set replace_all to true.`,
    };
  }

  const replacements = replaceAll ? occurrences : 1;
  const next = replaceAll ? content.split(oldStr).join(newStr) : content.replace(oldStr, newStr);
  return { ok: true, content: next, replacements };
}
