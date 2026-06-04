import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { EVAL_CONFIG } from "./config";
import { seedBaselineFixtures } from "./fixture-baseline";

const execFileAsync = promisify(execFile);

async function runGit(args: string[], cwd: string): Promise<void> {
  await execFileAsync("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 });
}

export async function fixturesDirty(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["status", "--porcelain", "--", EVAL_CONFIG.fixturesDir],
      { cwd: EVAL_CONFIG.repoRoot }
    );
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export async function setupFixtures(force = false): Promise<void> {
  const dirty = await fixturesDirty();
  if (dirty && !force && process.env.EVAL_FORCE_RESET !== "1") {
    console.warn(
      "⚠️  fixtures/workspace has uncommitted changes. Set EVAL_FORCE_RESET=1 to reset anyway."
    );
  }

  const rel = path.relative(EVAL_CONFIG.repoRoot, EVAL_CONFIG.fixturesDir);
  try {
    await runGit(["checkout", "HEAD", "--", rel], EVAL_CONFIG.repoRoot);
  } catch {
    /* fixtures may be new — ignore */
  }
  try {
    await runGit(["clean", "-fd", "--", rel], EVAL_CONFIG.repoRoot);
  } catch {
    /* ignore */
  }

  await fs.mkdir(EVAL_CONFIG.fixturesDir, { recursive: true });
  await seedBaselineFixtures();
  await fs.mkdir(path.join(EVAL_CONFIG.fixturesDir, "plans"), { recursive: true });

  const gitDir = path.join(EVAL_CONFIG.fixturesDir, ".git");
  try {
    await fs.access(gitDir);
  } catch {
    await runGit(["init"], EVAL_CONFIG.fixturesDir);
    await runGit(["add", "-A"], EVAL_CONFIG.fixturesDir);
    try {
      await runGit(["commit", "-m", "eval fixtures baseline"], EVAL_CONFIG.fixturesDir);
    } catch {
      /* nothing to commit */
    }
  }
}

export async function resetFixtures(): Promise<void> {
  await setupFixtures(true);
}
