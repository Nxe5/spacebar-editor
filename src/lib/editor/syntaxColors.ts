/** Tokyo Night–style defaults for the code editor (Nightfox / Tokyo Night Storm–aligned). */
export const TOKYO_NIGHT_SYNTAX_DEFAULTS = {
  keyword: "#bb9af7",
  function: "#7aa2f7",
  variable: "#c0caf5",
  number: "#ff9e64",
  string: "#9ece6a",
  type: "#2ac3de",
  operator: "#f7768e",
  property: "#73daca",
  comment: "#565f89",
  default: "#c0caf5",
  invalid: "#f7768e",
  heading: "#7aa2f7",
  link: "#73daca",
  emphasis: "#bb9af7",
  strong: "#c0caf5",
  meta: "#565f89",
  punctuation: "#9aa5ce",
  tag: "#f7768e",
  regexp: "#b4f9f8",
} as const;

export type SyntaxColorKey = keyof typeof TOKYO_NIGHT_SYNTAX_DEFAULTS;

export type SyntaxColorMap = Record<SyntaxColorKey, string>;

export const SYNTAX_COLOR_FIELDS: {
  key: SyntaxColorKey;
  label: string;
  hint: string;
  group?: "code" | "markdown";
}[] = [
  { key: "keyword", label: "Keywords", hint: "if · return · const · class", group: "code" },
  { key: "function", label: "Functions", hint: "myFunction() · render()", group: "code" },
  { key: "variable", label: "Variables", hint: "myVar · count · data", group: "code" },
  { key: "number", label: "Constants / numbers", hint: "MAX_SIZE · 42 · 3.14", group: "code" },
  { key: "string", label: "Strings", hint: '"hello world" · \'arch linux\'', group: "code" },
  { key: "type", label: "Types / classes", hint: "String · MyClass · Vec", group: "code" },
  { key: "operator", label: "Operators", hint: "= · && · => · !", group: "code" },
  { key: "property", label: "Properties / fields", hint: "obj.name · self.value", group: "code" },
  { key: "comment", label: "Comments", hint: "// this is a comment", group: "code" },
  { key: "punctuation", label: "Punctuation", hint: ". , ; : ( )", group: "code" },
  { key: "tag", label: "Tags", hint: "HTML/XML tags", group: "code" },
  { key: "regexp", label: "Regex", hint: "/pattern/ flags", group: "code" },
  { key: "default", label: "Default text", hint: "Unclassified tokens", group: "code" },
  { key: "invalid", label: "Invalid / error", hint: "Syntax errors", group: "code" },
  { key: "heading", label: "Markdown headings", hint: "# Title", group: "markdown" },
  { key: "link", label: "Markdown links", hint: "[text](url)", group: "markdown" },
  { key: "emphasis", label: "Markdown emphasis", hint: "*italic*", group: "markdown" },
  { key: "strong", label: "Markdown strong", hint: "**bold**", group: "markdown" },
  { key: "meta", label: "Markdown meta", hint: "Frontmatter · code fence info", group: "markdown" },
];

const STORAGE_KEY = "tinyllama.syntaxColors.v2";
const STORAGE_KEY_V1 = "tinyllama.syntaxColors.v1";

function normalizeHex(raw: string, fallback: string): string {
  const t = raw.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(t)) return t.toLowerCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(t)) {
    const h = t.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }
  return fallback;
}

export function defaultSyntaxColors(): SyntaxColorMap {
  return { ...TOKYO_NIGHT_SYNTAX_DEFAULTS };
}

export function normalizeSyntaxColors(parsed: Partial<SyntaxColorMap> | null | undefined): SyntaxColorMap {
  const base = defaultSyntaxColors();
  if (!parsed || typeof parsed !== "object") return base;
  const out = { ...base };
  for (const key of Object.keys(base) as SyntaxColorKey[]) {
    const v = parsed[key];
    if (typeof v === "string") out[key] = normalizeHex(v, base[key]);
  }
  return out;
}

function migrateFromV1(parsed: Partial<SyntaxColorMap>): SyntaxColorMap {
  const out = normalizeSyntaxColors(parsed);
  if (parsed.heading == null) out.heading = out.function;
  if (parsed.link == null) out.link = out.property;
  if (parsed.emphasis == null) out.emphasis = out.keyword;
  if (parsed.strong == null) out.strong = out.variable;
  if (parsed.meta == null) out.meta = out.comment;
  if (parsed.punctuation == null) out.punctuation = out.operator;
  if (parsed.tag == null) out.tag = out.type;
  if (parsed.regexp == null) out.regexp = out.string;
  return out;
}

export function loadSyntaxColors(): SyntaxColorMap {
  if (typeof localStorage === "undefined") return defaultSyntaxColors();
  try {
    const rawV2 = localStorage.getItem(STORAGE_KEY);
    if (rawV2) return normalizeSyntaxColors(JSON.parse(rawV2) as Partial<SyntaxColorMap>);
    const rawV1 = localStorage.getItem(STORAGE_KEY_V1);
    if (rawV1) {
      const migrated = migrateFromV1(JSON.parse(rawV1) as Partial<SyntaxColorMap>);
      saveSyntaxColors(migrated);
      return migrated;
    }
    return defaultSyntaxColors();
  } catch {
    return defaultSyntaxColors();
  }
}

export function saveSyntaxColors(colors: SyntaxColorMap): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
    localStorage.removeItem(STORAGE_KEY_V1);
  } catch {
    /* ignore */
  }
}

const CSS_VAR_BY_KEY: Record<SyntaxColorKey, string> = {
  keyword: "--syntax-keyword",
  function: "--syntax-function",
  variable: "--syntax-variable",
  number: "--syntax-number",
  string: "--syntax-string",
  type: "--syntax-type",
  operator: "--syntax-operator",
  property: "--syntax-property",
  comment: "--syntax-comment",
  default: "--syntax-default",
  invalid: "--syntax-invalid",
  heading: "--syntax-heading",
  link: "--syntax-link",
  emphasis: "--syntax-emphasis",
  strong: "--syntax-strong",
  meta: "--syntax-meta",
  punctuation: "--syntax-punctuation",
  tag: "--syntax-tag",
  regexp: "--syntax-regexp",
};

/** Push syntax token colors to CSS variables (CodeMirror reads `var(--syntax-*)`). */
export function applySyntaxColorsToDocument(colors: SyntaxColorMap): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const key of Object.keys(CSS_VAR_BY_KEY) as SyntaxColorKey[]) {
    root.style.setProperty(CSS_VAR_BY_KEY[key], colors[key]);
  }
  root.style.setProperty("--syntax-bool", colors.number);
  root.style.setProperty("--syntax-class", colors.type);
  root.style.setProperty("--syntax-parameter", colors.variable);
  root.style.setProperty("--syntax-attribute", colors.property);
}
