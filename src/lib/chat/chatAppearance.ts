/** Chat agent activity feed — waiting style and activity colors (persisted in localStorage). */

export type ChatWaitingStyle = "spinner-row" | "dots";

export const CHAT_APPEARANCE_DEFAULTS = {
  waitingStyle: "spinner-row" as ChatWaitingStyle,
  /** Rainbow animated border on the composer while the model is streaming. */
  rainbowBorder: true,
  thoughtLabelColor: "#b8a8e8",
  thoughtLabelActiveColor: "#c9b8f0",
  planLabelColor: "#b8a8e8",
  toolRunningColor: "#9ec9b8",
  toolDoneColor: "#7dd3c0",
  toolFailedColor: "#f08080",
  toolBadgeDoneColor: "#4ec9b0",
  toolBadgeErrorColor: "#f14c4c",
  fileLinkColor: "#4ec9b0",
  messageBoxBg: "#2d2d30",
  /** Background of the model picker popup — kept opaque so translucent themes don't show through. */
  modelPopupBg: "#252526",
} as const;

/** Appearance keys that are not editable hex-color swatches. */
type NonColorAppearanceKey = "waitingStyle" | "rainbowBorder";

export type ChatAppearanceKey = keyof typeof CHAT_APPEARANCE_DEFAULTS;

export type ChatAppearanceMap = {
  waitingStyle: ChatWaitingStyle;
  rainbowBorder: boolean;
  thoughtLabelColor: string;
  thoughtLabelActiveColor: string;
  planLabelColor: string;
  toolRunningColor: string;
  toolDoneColor: string;
  toolFailedColor: string;
  toolBadgeDoneColor: string;
  toolBadgeErrorColor: string;
  fileLinkColor: string;
  messageBoxBg: string;
  modelPopupBg: string;
};

export const CHAT_WAITING_STYLE_OPTIONS: { id: ChatWaitingStyle; label: string }[] = [
  { id: "spinner-row", label: "Purple row + spinner (default)" },
  { id: "dots", label: "Whimsical word + animated dots" },
];

export const CHAT_APPEARANCE_CSS_VARS: Record<
  Exclude<ChatAppearanceKey, NonColorAppearanceKey>,
  string
> = {
  thoughtLabelColor: "--chat-thought-label",
  thoughtLabelActiveColor: "--chat-thought-label-active",
  planLabelColor: "--chat-plan-label",
  toolRunningColor: "--chat-activity-tool-running",
  toolDoneColor: "--chat-activity-tool-done",
  toolFailedColor: "--chat-activity-tool-failed",
  toolBadgeDoneColor: "--chat-activity-badge-done",
  toolBadgeErrorColor: "--chat-activity-badge-error",
  fileLinkColor: "--chat-activity-file-link",
  messageBoxBg: "--chat-message-box-bg",
  modelPopupBg: "--chat-model-popup-bg",
};

export const CHAT_APPEARANCE_COLOR_FIELDS: {
  key: Exclude<ChatAppearanceKey, NonColorAppearanceKey>;
  label: string;
  hint: string;
}[] = [
  { key: "thoughtLabelColor", label: "Thought / status label", hint: "Whimsical label while thinking" },
  {
    key: "thoughtLabelActiveColor",
    label: "Thought label (active)",
    hint: "Label while spinner is showing",
  },
  { key: "planLabelColor", label: "Plan label", hint: "Pre-tool plan line" },
  { key: "toolRunningColor", label: "Tool (running)", hint: "In-progress tool calls" },
  { key: "toolDoneColor", label: "Tool (done)", hint: "Successful finished tools" },
  { key: "toolFailedColor", label: "Tool (failed)", hint: "Failed or errored tools" },
  { key: "toolBadgeDoneColor", label: "Badge: done", hint: "“done” tag on tools" },
  { key: "toolBadgeErrorColor", label: "Badge: failed", hint: "“failed” tag on tools" },
  { key: "fileLinkColor", label: "File chips", hint: "Paths opened from tool rows" },
  { key: "messageBoxBg", label: "Message boxes", hint: "User message bubbles in the chat thread" },
  { key: "modelPopupBg", label: "Model picker popup", hint: "Background of the model / mode / context menus that open from the composer" },
];

const STORAGE_KEY = "sidebar.chatAppearance.v1";

function normalizeHex(raw: string, fallback: string): string {
  const t = raw.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(t)) return t.toLowerCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(t)) {
    const h = t.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }
  return fallback;
}

function normalizeWaitingStyle(raw: unknown): ChatWaitingStyle {
  return raw === "dots" ? "dots" : "spinner-row";
}

export function defaultChatAppearance(): ChatAppearanceMap {
  return { ...CHAT_APPEARANCE_DEFAULTS };
}

export function normalizeChatAppearance(
  parsed: Partial<ChatAppearanceMap> | null | undefined
): ChatAppearanceMap {
  const base = defaultChatAppearance();
  if (!parsed || typeof parsed !== "object") return base;
  const out: ChatAppearanceMap = { ...base };
  out.waitingStyle = normalizeWaitingStyle(parsed.waitingStyle);
  if (typeof parsed.rainbowBorder === "boolean") out.rainbowBorder = parsed.rainbowBorder;
  for (const field of CHAT_APPEARANCE_COLOR_FIELDS) {
    const v = parsed[field.key];
    if (typeof v === "string") {
      out[field.key] = normalizeHex(v, base[field.key]);
    }
  }
  return out;
}

export function loadChatAppearance(): ChatAppearanceMap {
  if (typeof localStorage === "undefined") return defaultChatAppearance();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultChatAppearance();
    return normalizeChatAppearance(JSON.parse(raw) as Partial<ChatAppearanceMap>);
  } catch {
    return defaultChatAppearance();
  }
}

export function saveChatAppearance(appearance: ChatAppearanceMap): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
  } catch {
    /* ignore */
  }
}

export function applyChatAppearanceToDocument(appearance: ChatAppearanceMap): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.chatWaitingStyle = appearance.waitingStyle;
  root.dataset.chatRainbow = appearance.rainbowBorder ? "on" : "off";
  root.style.setProperty("--chat-model-popup-bg", appearance.modelPopupBg);
  root.style.setProperty("--chat-thought-label", appearance.thoughtLabelColor);
  root.style.setProperty("--chat-thought-label-active", appearance.thoughtLabelActiveColor);
  root.style.setProperty("--chat-plan-label", appearance.planLabelColor);
  root.style.setProperty("--chat-activity-tool-running", appearance.toolRunningColor);
  root.style.setProperty("--chat-activity-tool-done", appearance.toolDoneColor);
  root.style.setProperty("--chat-activity-tool-failed", appearance.toolFailedColor);
  root.style.setProperty("--chat-activity-badge-done", appearance.toolBadgeDoneColor);
  root.style.setProperty("--chat-activity-badge-error", appearance.toolBadgeErrorColor);
  root.style.setProperty("--chat-activity-file-link", appearance.fileLinkColor);
  root.style.setProperty("--chat-message-box-bg", appearance.messageBoxBg);
}

export function clearChatAppearanceInlineOverrides(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const cssVar of Object.values(CHAT_APPEARANCE_CSS_VARS)) {
    root.style.removeProperty(cssVar);
  }
}

/** Read chat color tokens from the active workbench theme CSS (after clearing inline overrides). */
export function readChatAppearanceFromDocument(
  fallback: ChatAppearanceMap = defaultChatAppearance()
): ChatAppearanceMap {
  if (typeof document === "undefined") return fallback;
  const s = getComputedStyle(document.documentElement);
  const pick = (varName: string, defaultValue: string) => {
    const v = s.getPropertyValue(varName).trim();
    return v || defaultValue;
  };
  const out: ChatAppearanceMap = { ...fallback };
  for (const field of CHAT_APPEARANCE_COLOR_FIELDS) {
    out[field.key] = pick(
      CHAT_APPEARANCE_CSS_VARS[field.key],
      fallback[field.key]
    );
  }
  return out;
}
