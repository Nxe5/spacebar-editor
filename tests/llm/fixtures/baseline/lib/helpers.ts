import fs from "node:fs";

export function fileExists(path: string): boolean {
  return fs.existsSync(path);
}

export function readText(path: string): string {
  return fs.readFileSync(path, "utf8");
}
