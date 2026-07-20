/** Maintainer contact for in-app feedback (mailto). */
export const FEEDBACK_CONTACT_EMAIL = "higueylabs-s1@protonmail.com";

export type FeedbackKind = "inquiry" | "bug" | "suggestion";

export const FEEDBACK_KIND_OPTIONS: { id: FeedbackKind; label: string }[] = [
  { id: "inquiry", label: "General inquiry" },
  { id: "bug", label: "Bug report" },
  { id: "suggestion", label: "Suggestion" },
];

const KIND_SUBJECT: Record<FeedbackKind, string> = {
  inquiry: "General inquiry",
  bug: "Bug report",
  suggestion: "Suggestion",
};

export function buildFeedbackMailto(options: {
  kind: FeedbackKind;
  body: string;
  appVersion?: string;
}): string {
  const subject = `[Spacebar Editor] ${KIND_SUBJECT[options.kind]}`;
  const footer = options.appVersion ? `\n\n—\nApp version: ${options.appVersion}` : "";
  const body = `${options.body.trim()}${footer}`;
  const params = new URLSearchParams({
    subject,
    body,
  });
  return `mailto:${FEEDBACK_CONTACT_EMAIL}?${params.toString()}`;
}
