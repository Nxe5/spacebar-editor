import fs from "node:fs/promises";
import path from "node:path";
import { EVAL_CONFIG } from "./config";

const BASELINE_DIR = path.join(path.dirname(EVAL_CONFIG.fixturesDir), "baseline");

async function copyBaselineRecursive(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyBaselineRecursive(from, to);
    } else {
      await fs.copyFile(from, to);
    }
  }
}

export async function seedBaselineFixtures(): Promise<void> {
  try {
    await fs.access(BASELINE_DIR);
  } catch {
    console.warn(`⚠️  No baseline at ${BASELINE_DIR} — skipping seed`);
    return;
  }
  await copyBaselineRecursive(BASELINE_DIR, EVAL_CONFIG.fixturesDir);
}
