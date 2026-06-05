import fs from "node:fs/promises";
import path from "node:path";
import type { EvalConfig } from "./config";
import type { LLMTestResult } from "./types";

export type CategoryScore = {
  category: string;
  passed: number;
  total: number;
  passRate: number;
  avgDurationMs: number;
  avgFirstTokenMs: number;
  toolSuccessRate: number | null;
  textRecoveries: number;
};

export type AnalysisReport = {
  model: string;
  profileId: string | null;
  categories: CategoryScore[];
  overallPassRate: number;
  totalDurationMs: number;
  modelWeaknesses: string[];
  appImprovements: string[];
  recommendedSettings: EvalConfig["recommendedAppSettings"];
};

const SUITE_CATEGORY: Record<string, string> = {
  "01-chat-basic": "chat",
  "02-chat-reasoning": "chat",
  "03-chat-multiturn": "chat",
  "04-chat-code": "code",
  "05-plan-create": "plan",
  "06-plan-update": "plan",
  "07-plan-multiturn": "plan",
  "08-agent-files": "agent-files",
  "09-agent-code": "agent-code",
  "10-agent-fix": "agent-fix",
  "11-agent-multistep": "agent-multistep",
  "12-agent-git": "agent-git",
  "13-agent-search": "agent-search",
  "14-agent-shell": "agent-shell",
  "15-stress-repetition": "stress",
  "16-gemma-tool-calling": "tool-calling",
  "17-gemma-local-project": "local-project",
  "18-gemma-weakness-probe": "weakness",
  "19-gemma-project-build": "project-build",
};

function categoryForResult(r: LLMTestResult): string {
  if (r.testId.startsWith("build-")) return "project-build";
  if (r.testId.startsWith("gemma-")) {
    if (r.testId.includes("tool")) return "tool-calling";
    if (r.testId.includes("project")) return "local-project";
    if (r.testId.includes("weak")) return "weakness";
  }
  return SUITE_CATEGORY[r.suite] ?? "other";
}

export function analyzeResults(
  results: LLMTestResult[],
  config: Pick<EvalConfig, "model" | "profileId" | "recommendedAppSettings">
): AnalysisReport {
  const byCategory = new Map<string, LLMTestResult[]>();
  for (const r of results) {
    const cat = categoryForResult(r);
    const list = byCategory.get(cat) ?? [];
    list.push(r);
    byCategory.set(cat, list);
  }

  const categories: CategoryScore[] = [];
  for (const [category, runs] of byCategory) {
    const passed = runs.filter((r) => r.status === "pass").length;
    const withTools = runs.filter((r) => r.metrics);
    const toolRates = withTools.map((r) => r.metrics!.toolSuccessRate);
    categories.push({
      category,
      passed,
      total: runs.length,
      passRate: runs.length ? passed / runs.length : 0,
      avgDurationMs: runs.reduce((s, r) => s + r.durationMs, 0) / (runs.length || 1),
      avgFirstTokenMs:
        runs.filter((r) => r.firstTokenMs != null).reduce((s, r) => s + (r.firstTokenMs ?? 0), 0) /
        (runs.filter((r) => r.firstTokenMs != null).length || 1),
      toolSuccessRate: toolRates.length
        ? toolRates.reduce((a, b) => a + b, 0) / toolRates.length
        : null,
      textRecoveries: runs.reduce((s, r) => s + (r.metrics?.textToolRecoveries ?? 0), 0),
    });
  }
  categories.sort((a, b) => a.category.localeCompare(b.category));

  const passed = results.filter((r) => r.status === "pass").length;
  const modelWeaknesses: string[] = [];
  const appImprovements: string[] = [];

  for (const c of categories) {
    if (c.passRate < 0.5 && c.total >= 1) {
      modelWeaknesses.push(
        `${c.category}: ${(c.passRate * 100).toFixed(0)}% pass (${c.passed}/${c.total}) — likely model limit`
      );
    } else if (c.passRate < 0.8 && c.total >= 1) {
      appImprovements.push(
        `${c.category}: ${(c.passRate * 100).toFixed(0)}% pass — tune prompts/settings or add recovery`
      );
    }
    if (c.textRecoveries > 0 && c.category === "tool-calling") {
      appImprovements.push(
        `Text tool recovery used ${c.textRecoveries}× — text_fallback path is working; ensure Detailed verbosity stays on`
      );
    }
    if (c.toolSuccessRate != null && c.toolSuccessRate < 0.9) {
      modelWeaknesses.push(
        `${c.category}: tool execution success ${(c.toolSuccessRate * 100).toFixed(0)}% — check hallucinated tool names/args`
      );
    }
  }

  const timeouts = results.filter((r) => r.status === "timeout").length;
  if (timeouts > 0) {
    appImprovements.push(
      `${timeouts} timeout(s) — increase agentRun/fullResponse timeouts or reduce maxAgentSteps for this hardware`
    );
  }

  if (!modelWeaknesses.length && results.length) {
    modelWeaknesses.push("No category below 50% pass — review report.md for quality issues");
  }

  return {
    model: config.model,
    profileId: config.profileId,
    categories,
    overallPassRate: results.length ? passed / results.length : 0,
    totalDurationMs: results.reduce((s, r) => s + r.durationMs, 0),
    modelWeaknesses,
    appImprovements,
    recommendedSettings: config.recommendedAppSettings,
  };
}

export async function writeAnalysisReport(
  runDir: string,
  analysis: AnalysisReport
): Promise<void> {
  await fs.writeFile(path.join(runDir, "analysis.json"), JSON.stringify(analysis, null, 2), "utf8");

  const lines: string[] = [
    "# Model Analysis",
    `**Model:** ${analysis.model}`,
    analysis.profileId ? `**Profile:** ${analysis.profileId}` : "",
    `**Overall pass rate:** ${(analysis.overallPassRate * 100).toFixed(1)}%`,
    `**Total eval time:** ${(analysis.totalDurationMs / 60_000).toFixed(1)} min`,
    "",
    "## Category scores",
    "",
    "| Category | Pass | Avg time | Tool success | Text recoveries |",
    "|----------|------|----------|--------------|-----------------|",
  ];

  for (const c of analysis.categories) {
    lines.push(
      `| ${c.category} | ${c.passed}/${c.total} (${(c.passRate * 100).toFixed(0)}%) | ${(c.avgDurationMs / 1000).toFixed(0)}s | ${c.toolSuccessRate != null ? `${(c.toolSuccessRate * 100).toFixed(0)}%` : "—"} | ${c.textRecoveries} |`
    );
  }

  lines.push("", "## Likely model weaknesses", "");
  for (const w of analysis.modelWeaknesses) lines.push(`- ${w}`);

  lines.push("", "## Suggested app improvements", "");
  for (const a of analysis.appImprovements) lines.push(`- ${a}`);

  if (analysis.recommendedSettings) {
    const s = analysis.recommendedSettings;
    lines.push("", "## Recommended Spacebar Editor settings", "");
    lines.push(`- **Tool format:** ${s.toolCallFormat}`);
    lines.push(`- **Prompt verbosity:** ${s.promptVerbosity}`);
    lines.push(`- **Parallel tool calls:** ${s.parallelToolCalls ? "on" : "off"}`);
    lines.push(`- **Context window:** ${s.contextWindow.toLocaleString()}`);
    for (const n of s.notes) lines.push(`- ${n}`);
  }

  await fs.writeFile(path.join(runDir, "analysis.md"), lines.filter(Boolean).join("\n"), "utf8");
}

export async function loadAllResultsFromRun(runDir: string): Promise<LLMTestResult[]> {
  const suitesDir = path.join(runDir, "suites");
  const files = await fs.readdir(suitesDir);
  const results: LLMTestResult[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const chunk = JSON.parse(await fs.readFile(path.join(suitesDir, file), "utf8")) as LLMTestResult[];
    results.push(...chunk);
  }
  return results;
}
