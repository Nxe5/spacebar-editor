#!/usr/bin/env tsx
import fs from "node:fs/promises";
import { analyzeResults, loadAllResultsFromRun, writeAnalysisReport } from "./analysis";
import { EVAL_CONFIG } from "./config";
import { setupFixtures } from "./fixtures";
import { ResultsWriter, type RunSummaryStats } from "./results-writer";
import { preflightCheck, runSuite } from "./suite-runner";
import { allSuites, findSuite, findTest } from "./suites";
import type { LLMSuite, LLMTestResult } from "./types";

function parseArgs(argv: string[]) {
  let suiteId: string | undefined;
  let testId: string | undefined;
  let mode: string | undefined;
  let tag: string | undefined;
  let smoke = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--suite" && argv[i + 1]) suiteId = argv[++i];
    else if (arg === "--test" && argv[i + 1]) testId = argv[++i];
    else if (arg === "--mode" && argv[i + 1]) mode = argv[++i];
    else if (arg === "--tag" && argv[i + 1]) tag = argv[++i];
    else if (arg === "--smoke") smoke = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: pnpm eval [--suite ID] [--test ID] [--mode chat|plan|agent] [--tag TAG] [--smoke]

Environment:
  EVAL_MODEL          Ollama model (profile default when EVAL_PROFILE is set)
  EVAL_PROFILE        Model profile: gemma-12b
  OLLAMA_HOST         Ollama base URL (default: ${EVAL_CONFIG.ollamaBaseUrl})
  EVAL_FORCE_RESET=1  Reset fixtures even if dirty

Profiles:
  gemma-12b           Unsloth Gemma 4 12B — long timeouts, text_fallback, smoke suite list

Examples:
  EVAL_PROFILE=gemma-12b pnpm eval --smoke
  EVAL_PROFILE=gemma-12b pnpm eval -- --suite 16-gemma-tool-calling
  EVAL_MODEL='hf.co/unsloth/gemma-4-12b-it-GGUF:Q8_0' pnpm eval -- --tag gemma
`);
      process.exit(0);
    }
  }

  return { suiteId, testId, mode, tag, smoke };
}

function filterSuitesForSmoke(suites: LLMSuite[], smoke: boolean): LLMSuite[] {
  if (!smoke) return suites;
  const smokeIds = new Set(EVAL_CONFIG.smokeSuiteIds);
  return suites
    .map((s) => {
      if (!smokeIds.has(s.id)) return null;
      const tagged = s.tests.filter((t) => t.smoke || t.tags.includes("gemma-smoke"));
      const tests = tagged.length > 0 ? tagged : s.tests.slice(0, 1);
      return { ...s, tests };
    })
    .filter((s): s is LLMSuite => s != null && s.tests.length > 0);
}

function filterSuitesByTag(suites: LLMSuite[], tag: string | undefined): LLMSuite[] {
  if (!tag) return suites;
  return suites
    .map((s) => ({ ...s, tests: s.tests.filter((t) => t.tags.includes(tag)) }))
    .filter((s) => s.tests.length > 0);
}

function tallyResult(stats: RunSummaryStats, suiteId: string, result: LLMTestResult) {
  stats.totalTests++;
  if (!stats.suites[suiteId]) {
    stats.suites[suiteId] = { total: 0, passed: 0, failed: 0, errors: 0 };
  }
  stats.suites[suiteId].total++;
  if (result.status === "pass") {
    stats.passed++;
    stats.suites[suiteId].passed++;
  } else if (result.status === "fail") {
    stats.failed++;
    stats.suites[suiteId].failed++;
  } else {
    stats.errors++;
    stats.suites[suiteId].errors++;
    if (result.status === "timeout") stats.timeouts++;
  }
}

async function main() {
  const { suiteId, testId, mode, tag, smoke } = parseArgs(process.argv.slice(2));
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const writer = new ResultsWriter(EVAL_CONFIG.resultsDir);
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  await fs.mkdir(EVAL_CONFIG.resultsDir, { recursive: true });

  console.log("\n🦙 Spacebar Editor LLM Eval Harness");
  console.log(`Run ID: ${runId}`);
  if (EVAL_CONFIG.profileLabel) console.log(`Profile: ${EVAL_CONFIG.profileLabel}`);
  console.log(`Model: ${EVAL_CONFIG.model}`);
  if (smoke) console.log("Mode: smoke (subset)");
  console.log(`Results: ${EVAL_CONFIG.resultsDir}/${runId}/\n`);

  await preflightCheck();
  await setupFixtures();

  const ctx = {
    workspacePath: EVAL_CONFIG.fixturesDir,
    fixturesDir: EVAL_CONFIG.fixturesDir,
    resultsDir: EVAL_CONFIG.resultsDir,
  };

  let suites = allSuites;
  if (suiteId) {
    const match = findSuite(suiteId);
    if (!match) {
      console.error(`Unknown suite: ${suiteId}`);
      process.exit(1);
    }
    suites = [match];
  } else if (testId) {
    const found = findTest(testId);
    if (!found) {
      console.error(`Unknown test: ${testId}`);
      process.exit(1);
    }
    suites = [{ ...found.suite, tests: [found.test] }];
  } else {
    suites = filterSuitesForSmoke(suites, smoke);
    suites = filterSuitesByTag(suites, tag);
  }

  if (suites.length === 0) {
    console.error("No suites matched filters.");
    process.exit(1);
  }

  const stats: RunSummaryStats = {
    totalTests: 0,
    passed: 0,
    failed: 0,
    errors: 0,
    timeouts: 0,
    suites: {},
  };

  for (const suite of suites) {
    console.log(`\n📦 Suite ${suite.id} — ${suite.title}`);
    const results = await runSuite(suite, {
      writer,
      runId,
      ctx,
      filterTestId: testId,
      filterMode: mode,
    });
    for (const r of results) tallyResult(stats, suite.id, r);
  }

  const completedAt = new Date().toISOString();
  await writer.writeRunSummary(runId, {
    model: EVAL_CONFIG.model,
    startedAt,
    completedAt,
    durationMs: Date.now() - t0,
    stats,
  });
  await writer.writeMarkdownReport(runId, EVAL_CONFIG.model, stats);

  const runDir = writer.runDir(runId);
  const allResults = await loadAllResultsFromRun(runDir);
  const analysis = analyzeResults(allResults, {
    model: EVAL_CONFIG.model,
    profileId: EVAL_CONFIG.profileId,
    recommendedAppSettings: EVAL_CONFIG.recommendedAppSettings,
  });
  await writeAnalysisReport(runDir, analysis);

  console.log(
    `\n✅ Run complete: ${stats.passed} pass / ${stats.failed} fail / ${stats.errors} error`
  );
  console.log(`📄 Report: ${EVAL_CONFIG.resultsDir}/${runId}/report.md`);
  console.log(`📊 Analysis: ${EVAL_CONFIG.resultsDir}/${runId}/analysis.md`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
