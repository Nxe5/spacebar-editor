/** Canonical form for comparing paths across Windows vs POSIX and mixed slashes. */
export function normalizeFilePath(p: string): string {
  return p.trim().replace(/\\/g, "/");
}
