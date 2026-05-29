import prettier from "prettier/standalone";
import prettierPluginBabel from "prettier/plugins/babel";
import prettierPluginEstree from "prettier/plugins/estree";
import prettierPluginHtml from "prettier/plugins/html";
import prettierPluginMarkdown from "prettier/plugins/markdown";
import prettierPluginPostcss from "prettier/plugins/postcss";
import prettierPluginTypescript from "prettier/plugins/typescript";
import prettierPluginYaml from "prettier/plugins/yaml";

const PLUGINS = [
  prettierPluginBabel,
  prettierPluginEstree,
  prettierPluginTypescript,
  prettierPluginHtml,
  prettierPluginMarkdown,
  prettierPluginPostcss,
  prettierPluginYaml,
];

export type PrettierParser =
  | "babel"
  | "typescript"
  | "json"
  | "html"
  | "markdown"
  | "css"
  | "scss"
  | "yaml";

export function prettierParserForPath(path: string): PrettierParser | null {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  switch (ext) {
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "babel";
    case "ts":
    case "tsx":
    case "mts":
    case "cts":
      return "typescript";
    case "json":
    case "jsonc":
      return "json";
    case "html":
    case "htm":
    case "svelte":
    case "vue":
      return "html";
    case "md":
    case "mdx":
      return "markdown";
    case "css":
      return "css";
    case "scss":
    case "less":
      return "scss";
    case "yaml":
    case "yml":
      return "yaml";
    default:
      return null;
  }
}

export function isPrettierSupportedPath(path: string): boolean {
  return prettierParserForPath(path) != null;
}

export async function formatWithPrettier(
  content: string,
  filepath: string
): Promise<string | null> {
  const parser = prettierParserForPath(filepath);
  if (!parser) return null;
  try {
    return await prettier.format(content, {
      parser,
      filepath,
      plugins: PLUGINS,
      tabWidth: 2,
      printWidth: 100,
    });
  } catch {
    return null;
  }
}

export async function isContentPrettierFormatted(
  content: string,
  filepath: string
): Promise<"formatted" | "unformatted" | "unsupported" | "error"> {
  if (!isPrettierSupportedPath(filepath)) return "unsupported";
  const formatted = await formatWithPrettier(content, filepath);
  if (formatted === null) return "error";
  return formatted === content ? "formatted" : "unformatted";
}
