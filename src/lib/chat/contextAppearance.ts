/** Context bar segment colors — persisted overrides for `--context-*` CSS variables. */

export const CONTEXT_APPEARANCE_DEFAULTS = {
  baseModePrompt: "#6796e6",
  workspaceContext: "#4ec9b0",
  systemPrompts: "#c586c0",
  toolInstructions: "#dcdcaa",
  toolSummaryInstruction: "#808080",
  toolSchemas: "#ce9178",
  chatHistory: "#569cd6",
  skillAccent1: "#4fc1ff",
  skillAccent2: "#b5cea8",
  skillAccent3: "#f7b731",
  skillAccent4: "#e4c97e",
  skillAccent5: "#d7ba7d",
  skillAccent6: "#a8d1e5",
} as const;

export type ContextAppearanceKey = keyof typeof CONTEXT_APPEARANCE_DEFAULTS;

export type ContextAppearanceMap = Record<ContextAppearanceKey, string>;

export const CONTEXT_APPEARANCE_CSS_VARS: Record<ContextAppearanceKey, string> = {
  baseModePrompt: "--context-base-mode-prompt",
  workspaceContext: "--context-workspace-context",
  systemPrompts: "--context-system-prompts",
  toolInstructions: "--context-tool-instructions",
  toolSummaryInstruction: "--context-tool-summary-instruction",
  toolSchemas: "--context-tool-schemas",
  chatHistory: "--context-chat-history",
  skillAccent1: "--context-skill-accent-1",
  skillAccent2: "--context-skill-accent-2",
  skillAccent3: "--context-skill-accent-3",
  skillAccent4: "--context-skill-accent-4",
  skillAccent5: "--context-skill-accent-5",
  skillAccent6: "--context-skill-accent-6",
};

export const CONTEXT_APPEARANCE_COLOR_FIELDS: {
  key: ContextAppearanceKey;
  label: string;
  hint: string;
  group?: "sections" | "skills";
}[] = [
  {
    key: "baseModePrompt",
    label: "Base mode prompt",
    hint: "Mode-specific system instructions",
    group: "sections",
  },
  {
    key: "workspaceContext",
    label: "Workspace context",
    hint: "Project path and file tree block",
    group: "sections",
  },
  {
    key: "toolInstructions",
    label: "Tool instructions",
    hint: "Tool-use guidance for plan/agent modes",
    group: "sections",
  },
  {
    key: "toolSummaryInstruction",
    label: "Tool summary instruction",
    hint: "Post-tool-round summary prompt",
    group: "sections",
  },
  {
    key: "systemPrompts",
    label: "System prompts",
    hint: "User-managed prompt files",
    group: "sections",
  },
  {
    key: "toolSchemas",
    label: "Tool schemas",
    hint: "Native tool definition tokens",
    group: "sections",
  },
  {
    key: "chatHistory",
    label: "Chat history",
    hint: "Accumulated message history",
    group: "sections",
  },
  { key: "skillAccent1", label: "Skill accent 1", hint: "Extra system sections (skills)", group: "skills" },
  { key: "skillAccent2", label: "Skill accent 2", hint: "Extra system sections (skills)", group: "skills" },
  { key: "skillAccent3", label: "Skill accent 3", hint: "Extra system sections (skills)", group: "skills" },
  { key: "skillAccent4", label: "Skill accent 4", hint: "Extra system sections (skills)", group: "skills" },
  { key: "skillAccent5", label: "Skill accent 5", hint: "Extra system sections (skills)", group: "skills" },
  { key: "skillAccent6", label: "Skill accent 6", hint: "Extra system sections (skills)", group: "skills" },
];

const SECTION_ID_TO_KEY: Record<string, ContextAppearanceKey> = {
  "base-mode-prompt": "baseModePrompt",
  "workspace-context": "workspaceContext",
  "system-prompts": "systemPrompts",
  "tool-summary-instruction": "toolSummaryInstruction",
};

const SKILL_ACCENT_KEYS: ContextAppearanceKey[] = [
  "skillAccent1",
  "skillAccent2",
  "skillAccent3",
  "skillAccent4",
  "skillAccent5",
  "skillAccent6",
];

const STORAGE_KEY = "sidebar.contextAppearance.v1";

export function hasSavedContextAppearance(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) !== null;
}

function normalizeHex(raw: string, fallback: string): string {
  const t = raw.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(t)) return t.toLowerCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(t)) {
    const h = t.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }
  return fallback;
}

export function defaultContextAppearance(): ContextAppearanceMap {
  return { ...CONTEXT_APPEARANCE_DEFAULTS };
}

export function normalizeContextAppearance(
  parsed: Partial<ContextAppearanceMap> | null | undefined
): ContextAppearanceMap {
  const base = defaultContextAppearance();
  if (!parsed || typeof parsed !== "object") return base;
  const out: ContextAppearanceMap = { ...base };
  for (const field of CONTEXT_APPEARANCE_COLOR_FIELDS) {
    const v = parsed[field.key];
    if (typeof v === "string") {
      out[field.key] = normalizeHex(v, base[field.key]);
    }
  }
  return out;
}

export function loadContextAppearance(): ContextAppearanceMap {
  if (typeof localStorage === "undefined") return defaultContextAppearance();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultContextAppearance();
    return normalizeContextAppearance(JSON.parse(raw) as Partial<ContextAppearanceMap>);
  } catch {
    return defaultContextAppearance();
  }
}

export function saveContextAppearance(appearance: ContextAppearanceMap): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
  } catch {
    /* ignore */
  }
}

export function applyContextAppearanceToDocument(appearance: ContextAppearanceMap): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const field of CONTEXT_APPEARANCE_COLOR_FIELDS) {
    root.style.setProperty(CONTEXT_APPEARANCE_CSS_VARS[field.key], appearance[field.key]);
  }
}

export function clearContextAppearanceInlineOverrides(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const cssVar of Object.values(CONTEXT_APPEARANCE_CSS_VARS)) {
    root.style.removeProperty(cssVar);
  }
}

export function readContextAppearanceFromDocument(): ContextAppearanceMap {
  if (typeof document === "undefined") return defaultContextAppearance();
  const s = getComputedStyle(document.documentElement);
  const pick = (varName: string, fallback: string) => {
    const v = s.getPropertyValue(varName).trim();
    return v || fallback;
  };
  const base = defaultContextAppearance();
  const out = { ...base };
  for (const field of CONTEXT_APPEARANCE_COLOR_FIELDS) {
    out[field.key] = pick(CONTEXT_APPEARANCE_CSS_VARS[field.key], base[field.key]);
  }
  return out;
}

/** Resolve a context breakdown section id to its display color. */
export function getContextSectionColor(
  sectionId: string,
  appearance: ContextAppearanceMap
): string {
  const mapped = SECTION_ID_TO_KEY[sectionId];
  if (mapped) return appearance[mapped];
  if (sectionId.startsWith("tool-instructions")) return appearance.toolInstructions;
  let h = 0;
  for (let i = 0; i < sectionId.length; i++) {
    h = (Math.imul(h, 31) + sectionId.charCodeAt(i)) | 0;
  }
  return appearance[SKILL_ACCENT_KEYS[Math.abs(h) % SKILL_ACCENT_KEYS.length]];
}
