import fs from "node:fs/promises";
import path from "node:path";
import type { ArtifactCheck, EvalRunContext, ProjectVerifyResult } from "./types";

export type { ArtifactCheck, ProjectVerifyResult };

async function exists(fullPath: string): Promise<boolean> {
  try {
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

async function readOptional(fullPath: string): Promise<string | null> {
  try {
    return await fs.readFile(fullPath, "utf8");
  } catch {
    return null;
  }
}

function push(checks: ArtifactCheck[], id: string, pass: boolean, detail?: string): void {
  checks.push({ id, pass, detail });
}

function scoreFromChecks(checks: ArtifactCheck[]): number {
  if (checks.length === 0) return 0;
  return Math.round((checks.filter((c) => c.pass).length / checks.length) * 100);
}

function finish(checks: ArtifactCheck[], minScore: number): ProjectVerifyResult {
  const score = scoreFromChecks(checks);
  const pass = score >= minScore && checks.every((c) => !c.id.startsWith("required-") || c.pass);
  const failed = checks.filter((c) => !c.pass);
  return {
    pass,
    score,
    checks,
    message: pass
      ? undefined
      : `Artifact score ${score}% (need ${minScore}%): ${failed.map((c) => c.id).join(", ")}`,
  };
}

/** Resolve first existing file from candidate relative paths. */
async function findFirst(
  workspacePath: string,
  candidates: string[]
): Promise<{ rel: string; content: string } | null> {
  for (const rel of candidates) {
    const full = path.join(workspacePath, rel);
    const content = await readOptional(full);
    if (content != null) return { rel, content };
  }
  return null;
}

export async function verifyLandingPage(
  ctx: EvalRunContext,
  options: {
    dir: string;
    brandKeywords?: string[];
    minScore?: number;
    requireExternalCss?: boolean;
  }
): Promise<ProjectVerifyResult> {
  const checks: ArtifactCheck[] = [];
  const minScore = options.minScore ?? 70;
  const dir = options.dir.replace(/\/+$/, "");

  const htmlCandidates = [`${dir}/index.html`, `${dir}/Index.html`, `index.html`];
  const htmlHit = await findFirst(ctx.workspacePath, htmlCandidates);
  push(checks, "required-index-html", htmlHit != null, htmlHit?.rel);

  const html = htmlHit?.content ?? "";
  const lower = html.toLowerCase();

  push(checks, "html-doctype", /<!doctype\s+html/i.test(html));
  push(checks, "html-root", lower.includes("<html") && lower.includes("<body"));
  push(checks, "html-title", lower.includes("<title") && lower.includes("</title>"));
  push(checks, "html-h1", /<h1[\s>]/i.test(html));

  const cssPath = path.join(ctx.workspacePath, dir, "styles.css");
  const cssAlt = path.join(ctx.workspacePath, dir, "style.css");
  const cssContent =
    (await readOptional(cssPath)) ?? (await readOptional(cssAlt)) ?? "";
  const hasLinkedCss =
    /rel\s*=\s*["']stylesheet["']/i.test(html) && /href\s*=\s*["'][^"']+\.css["']/i.test(html);
  const hasInlineCss = lower.includes("<style");
  push(
    checks,
    "html-css",
    options.requireExternalCss
      ? hasLinkedCss && cssContent.trim().length > 20
      : hasLinkedCss || hasInlineCss || cssContent.trim().length > 20,
    hasLinkedCss ? "linked stylesheet" : hasInlineCss ? "inline style" : cssContent ? "styles.css" : "none"
  );

  if (cssContent) {
    push(checks, "css-rules", /[{][^}]+[}]/.test(cssContent));
    push(checks, "css-selectors", /\.[a-z-]+|#[a-z-]+|(?:^|\n)\s*[a-z]+/i.test(cssContent));
  }

  push(
    checks,
    "html-structure",
    /<(header|nav|main|section|footer)[\s>]/i.test(html),
    "semantic section element"
  );
  push(
    checks,
    "html-cta",
    /<button|class\s*=\s*["'][^"']*cta|>(get started|sign up|contact|learn more)</i.test(html)
  );

  if (options.brandKeywords?.length) {
    const haystack = `${html}\n${cssContent}`.toLowerCase();
    const hit = options.brandKeywords.some((k) => haystack.includes(k.toLowerCase()));
    push(checks, "brand-present", hit, options.brandKeywords.join(" | "));
  }

  return finish(checks, minScore);
}

export async function verifyStaticSite(
  ctx: EvalRunContext,
  options: {
    dir: string;
    pages: string[];
    minScore?: number;
  }
): Promise<ProjectVerifyResult> {
  const checks: ArtifactCheck[] = [];
  const minScore = options.minScore ?? 75;
  const dir = options.dir.replace(/\/+$/, "");

  for (const page of options.pages) {
    const rel = `${dir}/${page}`;
    const full = path.join(ctx.workspacePath, rel);
    const content = await readOptional(full);
    push(checks, `required-${page}`, content != null, rel);
    if (content) {
      push(checks, `${page}-doctype`, /<!doctype\s+html/i.test(content));
      push(checks, `${page}-body`, content.toLowerCase().includes("<body"));
    }
  }

  const index = await readOptional(path.join(ctx.workspacePath, dir, options.pages[0] ?? "index.html"));
  if (index) {
    for (const page of options.pages.slice(1)) {
      push(
        checks,
        `nav-link-${page}`,
        new RegExp(`href\\s*=\\s*["']${page.replace(".", "\\.")}["']`, "i").test(index),
        `link to ${page}`
      );
    }
  }

  const css =
    (await readOptional(path.join(ctx.workspacePath, dir, "styles.css"))) ??
    (await readOptional(path.join(ctx.workspacePath, dir, "style.css")));
  push(checks, "shared-css", css != null && css.trim().length > 10);

  return finish(checks, minScore);
}

export async function verifyProjectReadme(
  ctx: EvalRunContext,
  options: {
    relPath: string;
    minScore?: number;
  }
): Promise<ProjectVerifyResult> {
  const checks: ArtifactCheck[] = [];
  const minScore = options.minScore ?? 70;
  const content = await readOptional(path.join(ctx.workspacePath, options.relPath));
  push(checks, "required-readme", content != null, options.relPath);
  if (!content) return finish(checks, minScore);

  const lower = content.toLowerCase();
  push(checks, "readme-heading", /^#\s+.+/m.test(content));
  push(checks, "readme-install", lower.includes("install") || lower.includes("npm"));
  push(checks, "readme-usage", lower.includes("usage") || lower.includes("example"));
  push(checks, "readme-length", content.trim().length >= 120, `${content.trim().length} chars`);

  return finish(checks, minScore);
}

export async function verifyResponsiveCss(
  ctx: EvalRunContext,
  options: { cssPath: string }
): Promise<ProjectVerifyResult> {
  const checks: ArtifactCheck[] = [];
  const content = await readOptional(path.join(ctx.workspacePath, options.cssPath));
  push(checks, "required-css", content != null, options.cssPath);
  if (content) {
    push(
      checks,
      "css-media-query",
      /@media\s*\(/.test(content),
      "expects @media rule for responsive layout"
    );
  }
  return finish(checks, 100);
}

export async function resetBuildDir(ctx: EvalRunContext, dir: string): Promise<void> {
  const full = path.join(ctx.workspacePath, dir.replace(/\/+$/, ""));
  await fs.rm(full, { recursive: true, force: true });
  await fs.mkdir(full, { recursive: true });
}

const STARTER_LANDING_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Starter SaaS</title>
</head>
<body>
  <header><h1>Starter SaaS</h1></header>
  <main>
    <section class="hero">
      <h2>Ship faster</h2>
      <p>A minimal landing stub for eval extension tests.</p>
    </section>
  </main>
</body>
</html>
`;

export async function seedStarterLanding(ctx: EvalRunContext): Promise<void> {
  const dir = path.join(ctx.workspacePath, "projects/starter-landing");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "index.html"), STARTER_LANDING_HTML, "utf8");
}

export async function verifyStarterExtended(ctx: EvalRunContext): Promise<ProjectVerifyResult> {
  const checks: ArtifactCheck[] = [];
  const htmlPath = path.join(ctx.workspacePath, "projects/starter-landing/index.html");
  const html = await readOptional(htmlPath);
  push(checks, "required-index", html != null);
  if (!html) return finish(checks, 100);

  push(checks, "pricing-section", /pricing|plans|tiers/i.test(html));
  push(
    checks,
    "css-linked",
    /rel\s*=\s*["']stylesheet["']/i.test(html) ||
      (await exists(path.join(ctx.workspacePath, "projects/starter-landing/styles.css"))) ||
      (await exists(path.join(ctx.workspacePath, "projects/starter-landing/style.css")))
  );
  push(checks, "hero-preserved", /ship faster/i.test(html));

  return finish(checks, 100);
}
