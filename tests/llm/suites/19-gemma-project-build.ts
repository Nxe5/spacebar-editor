import type { LLMSuite } from "../types";
import {
  resetBuildDir,
  seedStarterLanding,
  verifyLandingPage,
  verifyProjectReadme,
  verifyResponsiveCss,
  verifyStarterExtended,
  verifyStaticSite,
} from "../project-verify";

/**
 * End-to-end project build evals — landing pages, static sites, docs.
 * Expect long runtimes on 12B local models (15–60+ min per test).
 */
export const suite: LLMSuite = {
  id: "19-gemma-project-build",
  title: "Gemma: Project Build",
  tests: [
    {
      id: "build-landing-01",
      suite: "19-gemma-project-build",
      mode: "agent",
      category: "project-build",
      maxAgentSteps: 25,
      description: "Coffee shop landing page (HTML + CSS)",
      messages: [
        {
          role: "user",
          content: `Create a landing page for a fictional coffee shop called "Roast & Co" in the folder \`build/roast-landing/\`.

Requirements:
- \`index.html\` and \`styles.css\` (vanilla HTML/CSS only — no React, no npm)
- Hero with shop name and tagline
- A features section with at least 3 items
- Footer with contact info or email
- Link styles.css from index.html

Work in the workspace root. Create the build/roast-landing/ directory and files there.`,
        },
      ],
      expectedBehavior: "Multi-file static landing with hero, features, footer, external CSS",
      expectedTools: ["create_file"],
      tags: ["gemma", "project-build", "landing"],
      setup: (ctx) => resetBuildDir(ctx, "build/roast-landing"),
      verify: (ctx) =>
        verifyLandingPage(ctx, {
          dir: "build/roast-landing",
          brandKeywords: ["roast", "coffee"],
          requireExternalCss: true,
          minScore: 75,
        }),
    },
    {
      id: "build-landing-02",
      suite: "19-gemma-project-build",
      mode: "agent",
      category: "project-build",
      maxAgentSteps: 30,
      description: "Responsive SaaS landing page",
      messages: [
        {
          role: "user",
          content: `Build a responsive SaaS landing page in \`build/saas-landing/\` for a product called "FlowDesk".

Files: index.html + styles.css
Include: hero with CTA button, 3 feature cards, pricing section with 2 tiers, footer.
Add at least one CSS @media query for mobile layout.
No frameworks — plain HTML and CSS only.`,
        },
      ],
      expectedBehavior: "Full marketing page with responsive CSS",
      expectedTools: ["create_file"],
      tags: ["gemma", "project-build", "landing"],
      setup: async (ctx) => {
        await resetBuildDir(ctx, "build/saas-landing");
      },
      verify: async (ctx) => {
        const landing = await verifyLandingPage(ctx, {
          dir: "build/saas-landing",
          brandKeywords: ["flowdesk"],
          requireExternalCss: true,
          minScore: 70,
        });
        const cssHit =
          (await verifyResponsiveCss(ctx, { cssPath: "build/saas-landing/styles.css" })).pass
            ? await verifyResponsiveCss(ctx, { cssPath: "build/saas-landing/styles.css" })
            : await verifyResponsiveCss(ctx, { cssPath: "build/saas-landing/style.css" });
        return {
          pass: landing.pass && cssHit.pass,
          score: Math.round((landing.score + cssHit.score) / 2),
          checks: [...landing.checks, ...cssHit.checks],
          message:
            landing.pass && cssHit.pass
              ? undefined
              : [landing.message, cssHit.message].filter(Boolean).join("; "),
        };
      },
    },
    {
      id: "build-static-03",
      suite: "19-gemma-project-build",
      mode: "agent",
      category: "project-build",
      maxAgentSteps: 30,
      description: "Two-page static site with shared CSS",
      messages: [
        {
          role: "user",
          content: `Create a small static developer portfolio in \`build/dev-portfolio/\`:

- index.html — home with name, tagline, link to about
- about.html — short bio paragraph, link back home
- styles.css — shared styles for both pages
- Navigation links between the two pages

Use semantic HTML. No JavaScript required.`,
        },
      ],
      expectedBehavior: "Two HTML pages + shared CSS with cross-links",
      expectedTools: ["create_file"],
      tags: ["gemma", "project-build", "static-site"],
      setup: (ctx) => resetBuildDir(ctx, "build/dev-portfolio"),
      verify: (ctx) =>
        verifyStaticSite(ctx, {
          dir: "build/dev-portfolio",
          pages: ["index.html", "about.html"],
          minScore: 80,
        }),
    },
    {
      id: "build-extend-04",
      suite: "19-gemma-project-build",
      mode: "agent",
      category: "project-build",
      maxAgentSteps: 20,
      description: "Extend existing landing stub with pricing",
      messages: [
        {
          role: "user",
          content: `There is a starter landing page at \`projects/starter-landing/index.html\`.

1. Read the existing file
2. Add a pricing section with 2 plan tiers (names and prices)
3. Create \`projects/starter-landing/styles.css\` and link it from index.html
4. Keep the existing hero content — do not remove it

Do not create a new folder — edit the existing starter project.`,
        },
      ],
      expectedBehavior: "Reads stub, adds pricing + CSS without breaking hero",
      expectedTools: ["read_file", "write_file", "create_file"],
      tags: ["gemma", "project-build", "landing"],
      setup: seedStarterLanding,
      verify: verifyStarterExtended,
    },
    {
      id: "build-readme-05",
      suite: "19-gemma-project-build",
      mode: "agent",
      category: "project-build",
      maxAgentSteps: 15,
      description: "New project README scaffold",
      messages: [
        {
          role: "user",
          content: `Scaffold a new open-source CLI tool project in \`build/cli-tool/\`.

Create README.md with:
- Project title and one-line description
- ## Installation (npm install example)
- ## Usage (code example block)
- ## License (MIT)

No code files needed — documentation only for now.`,
        },
      ],
      expectedBehavior: "README with install, usage, license sections",
      expectedTools: ["create_file"],
      tags: ["gemma", "project-build", "docs"],
      setup: (ctx) => resetBuildDir(ctx, "build/cli-tool"),
      verify: (ctx) =>
        verifyProjectReadme(ctx, {
          relPath: "build/cli-tool/README.md",
          minScore: 75,
        }),
    },
    {
      id: "build-landing-plan-06",
      suite: "19-gemma-project-build",
      mode: "plan",
      category: "project-build",
      maxAgentSteps: 12,
      description: "Plan before building a landing page",
      messages: [
        {
          role: "user",
          content: `I want to build a landing page for a local bakery "Crumb & Crust" in a future session.

Analyze what a good v1 landing page needs and write \`plans/crumb-crust-landing.md\` with:
- YAML frontmatter (id, status: draft, created, updated dates)
- ## Goals
- ## Tasks as checkboxes (- [ ] ...)
- File list (index.html, styles.css) and section outline

Do not create HTML yet — plan only under plans/.`,
        },
      ],
      expectedBehavior: "Structured plan markdown with tasks and file outline",
      expectedTools: ["create_file"],
      tags: ["gemma", "project-build", "planning"],
      verify: async (ctx) => {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        const planDir = path.join(ctx.workspacePath, "plans");
        const files = await fs.readdir(planDir).catch(() => [] as string[]);
        const planFile = files.find((f) => f.includes("crumb") && f.endsWith(".md"));
        if (!planFile) {
          return {
            pass: false,
            score: 0,
            checks: [{ id: "required-plan", pass: false, detail: "no crumb plan in plans/" }],
            message: "Expected plans/*crumb*.md",
          };
        }
        const content = await fs.readFile(path.join(planDir, planFile), "utf8");
        const checks = [
          { id: "plan-frontmatter", pass: content.startsWith("---"), detail: planFile },
          { id: "plan-tasks", pass: /- \[ \]/.test(content) },
          { id: "plan-html-mention", pass: /index\.html/i.test(content) },
          { id: "plan-css-mention", pass: /styles?\.css/i.test(content) },
        ];
        const score = Math.round((checks.filter((c) => c.pass).length / checks.length) * 100);
        return {
          pass: score >= 75,
          score,
          checks,
          message: score >= 75 ? undefined : `Plan score ${score}%`,
        };
      },
    },
  ],
};
