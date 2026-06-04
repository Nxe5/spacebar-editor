/** File extension → LSP language id (spec 41 §6.3). */

import { resolvedLanguageForLsp } from "./lspSettings";

export function languageIdForPath(filePath: string): string | null {
  const base = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
  const dot = base.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = base.slice(dot + 1).toLowerCase();
  switch (ext) {
    case "ts":
    case "mts":
    case "cts":
      return "typescript";
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "javascript";
    case "rs":
      return "rust";
    case "py":
    case "pyi":
      return "python";
    case "go":
      return "go";
    case "svelte":
      return "svelte";
    case "css":
    case "scss":
    case "less":
      return "css";
    case "html":
    case "htm":
      return "html";
    case "json":
    case "jsonc":
      return "json";
    case "yaml":
    case "yml":
      return "yaml";
    case "md":
    case "mdx":
      return "markdown";
    default:
      return null;
  }
}

/** Language id used to pick the running server (TS server for JS/TS/Svelte). */
export function resolvedLanguageIdForPath(filePath: string): string | null {
  const id = languageIdForPath(filePath);
  if (!id) return null;
  if (id === "svelte") return "svelte";
  return resolvedLanguageForLsp(id);
}

export function languageIdLabel(languageId: string): string {
  const labels: Record<string, string> = {
    typescript: "TypeScript",
    javascript: "JavaScript",
    rust: "Rust",
    python: "Python",
    go: "Go",
    svelte: "Svelte",
    css: "CSS",
    html: "HTML",
    json: "JSON",
  };
  return labels[languageId] ?? languageId;
}
