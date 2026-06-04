import fs from "node:fs/promises";
import path from "node:path";
import type { LLMTestResult } from "./types";

export interface RunSummaryStats {
  totalTests: number;
  passed: number;
  failed: number;
  errors: number;
  timeouts: number;
  suites: Record<string, { total: number; passed: number; failed: number; errors: number }>;
}

export class ResultsWriter {
  private readonly baseDir: string;

  constructor(resultsDir: string) {
    this.baseDir = resultsDir;
  }

  runDir(runId: string): string {
    return path.join(this.baseDir, runId);
  }

  async ensureRunDir(runId: string): Promise<string> {
    const dir = this.runDir(runId);
    await fs.mkdir(path.join(dir, "suites"), { recursive: true });
    return dir;
  }

  async writeSuiteResults(runId: string, suiteId: string, results: LLMTestResult[]): Promise<void> {
    const dir = await this.ensureRunDir(runId);
    const file = path.join(dir, "suites", `${suiteId}.json`);
    await fs.writeFile(file, JSON.stringify(results, null, 2), "utf8");
  }

  async appendSuiteResult(runId: string, suiteId: string, result: LLMTestResult): Promise<void> {
    const dir = await this.ensureRunDir(runId);
    const file = path.join(dir, "suites", `${suiteId}.json`);
    let existing: LLMTestResult[] = [];
    try {
      existing = JSON.parse(await fs.readFile(file, "utf8")) as LLMTestResult[];
    } catch {
      /* new file */
    }
    existing.push(result);
    await fs.writeFile(file, JSON.stringify(existing, null, 2), "utf8");
  }

  async writeRunSummary(
    runId: string,
    meta: {
      model: string;
      startedAt: string;
      completedAt: string;
      durationMs: number;
      stats: RunSummaryStats;
    }
  ): Promise<void> {
    const dir = await this.ensureRunDir(runId);
    const summary = {
      runId,
      model: meta.model,
      startedAt: meta.startedAt,
      completedAt: meta.completedAt,
      durationMs: meta.durationMs,
      totalTests: meta.stats.totalTests,
      passed: meta.stats.passed,
      failed: meta.stats.failed,
      errors: meta.stats.errors,
      timeouts: meta.stats.timeouts,
      suites: meta.stats.suites,
    };
    await fs.writeFile(path.join(dir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  }

  async writeMarkdownReport(runId: string, model: string, stats: RunSummaryStats): Promise<void> {
    const dir = this.runDir(runId);
    const suiteFiles = await fs.readdir(path.join(dir, "suites"));
    const lines: string[] = [
      "# LLM Eval Report",
      `**Run:** ${runId}  `,
      `**Model:** ${model}  `,
      `**Result:** ${stats.passed} / ${stats.totalTests} passed`,
      "",
      "---",
      "",
    ];

    for (const file of suiteFiles.sort()) {
      const suiteId = file.replace(/\.json$/, "");
      const results = JSON.parse(
        await fs.readFile(path.join(dir, "suites", file), "utf8")
      ) as LLMTestResult[];
      const passed = results.filter((r) => r.status === "pass").length;
      lines.push(`## Suite ${suiteId}`);
      lines.push(`${passed} / ${results.length} passed`, "");

      const byTest = new Map<string, LLMTestResult[]>();
      for (const r of results) {
        const list = byTest.get(r.testId) ?? [];
        list.push(r);
        byTest.set(r.testId, list);
      }

      for (const [testId, runs] of byTest) {
        const icon = runs.every((r) => r.status === "pass") ? "✅" : "❌";
        const first = runs[0];
        lines.push(`### ${testId} ${icon} (×${runs.length})`);
        lines.push(`**Prompt:** ${first.description}`);
        lines.push(`**Expected:** ${runs[0].description}`, "");

        for (const r of runs) {
          lines.push(`**Run ${r.runIndex}** (${(r.durationMs / 1000).toFixed(1)}s) — ${r.status}`);
          if (r.errorMessage) lines.push(`**Error:** ${r.errorMessage}`);
          if (r.artifactScore != null) {
            lines.push(`**Artifact score:** ${r.artifactScore}%`);
          }
          if (r.artifactChecks?.length) {
            lines.push("**Artifact checks:**");
            for (const c of r.artifactChecks) {
              lines.push(`  - ${c.pass ? "✅" : "❌"} ${c.id}${c.detail ? ` (${c.detail})` : ""}`);
            }
          }
          if (r.toolCalls?.length) {
            lines.push("**Tools called:**");
            for (const [i, tc] of r.toolCalls.entries()) {
              const mark = tc.success ? "✅" : "❌";
              lines.push(`  ${i + 1}. ${tc.toolName}(${JSON.stringify(tc.args)}) ${mark} ${tc.durationMs}ms`);
            }
          }
          const excerpt = r.response.trim().slice(0, 800);
          if (excerpt) {
            lines.push("> " + excerpt.replace(/\n/g, "\n> "));
          }
          lines.push("");
        }
        lines.push("---", "");
      }
    }

    await fs.writeFile(path.join(dir, "report.md"), lines.join("\n"), "utf8");
  }
}

export async function findLatestRunId(resultsDir: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(resultsDir, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
      .reverse();
    return dirs[0] ?? null;
  } catch {
    return null;
  }
}
