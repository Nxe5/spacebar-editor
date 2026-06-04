import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyLandingPage, verifyStaticSite } from "../llm/project-verify";
import type { EvalRunContext } from "../llm/types";

describe("project-verify", () => {
  let tmp = "";
  let ctx: EvalRunContext;

  afterEach(async () => {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  });

  async function makeWorkspace(files: Record<string, string>) {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "eval-build-"));
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(tmp, rel);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, content, "utf8");
    }
    ctx = { workspacePath: tmp, fixturesDir: tmp, resultsDir: tmp };
  }

  it("passes a minimal valid landing page", async () => {
    await makeWorkspace({
      "build/roast-landing/index.html": `<!DOCTYPE html>
<html><head><title>Roast & Co Coffee</title><link rel="stylesheet" href="styles.css"></head>
<body><header><h1>Roast & Co</h1></header><main><section><h2>Features</h2></section></main>
<footer>contact@roast.co</footer><button>Contact</button></body></html>`,
      "build/roast-landing/styles.css": `.hero { color: brown; } footer { padding: 1rem; }`,
    });
    const result = await verifyLandingPage(ctx, {
      dir: "build/roast-landing",
      brandKeywords: ["roast"],
      requireExternalCss: true,
    });
    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(75);
  });

  it("fails when index.html is missing", async () => {
    await makeWorkspace({});
    const result = await verifyLandingPage(ctx, { dir: "build/empty" });
    expect(result.pass).toBe(false);
    expect(result.checks.find((c) => c.id === "required-index-html")?.pass).toBe(false);
  });

  it("validates a two-page static site", async () => {
    await makeWorkspace({
      "build/dev-portfolio/index.html": `<!DOCTYPE html><html><body><a href="about.html">About</a></body></html>`,
      "build/dev-portfolio/about.html": `<!DOCTYPE html><html><body><p>Bio</p></body></html>`,
      "build/dev-portfolio/styles.css": "body { font-family: sans-serif; }",
    });
    const result = await verifyStaticSite(ctx, {
      dir: "build/dev-portfolio",
      pages: ["index.html", "about.html"],
    });
    expect(result.pass).toBe(true);
  });
});
