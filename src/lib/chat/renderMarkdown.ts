import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: true,
});

/** Above this size a full markdown parse can stall the UI thread for seconds
 *  (or exhaust webview memory); fall back to escaped plain text. */
const MARKDOWN_PARSE_LIMIT = 300_000;

export function renderChatMarkdown(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return "";
  if (trimmed.length > MARKDOWN_PARSE_LIMIT) {
    return `<pre>${escapeHtml(trimmed)}</pre>`;
  }
  const raw = marked.parse(trimmed, { async: false }) as string;
  return sanitizeChatHtml(raw);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Minimal sanitization for model-generated HTML (desktop local context). */
function sanitizeChatHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}
