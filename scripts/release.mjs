#!/usr/bin/env node
/**
 * Bump app version, commit, tag, and push.
 *
 * Run after feature/docs commits are done on a clean working tree:
 *
 *   pnpm release 0.1.5
 *   pnpm release 0.1.5 --message "v0.1.5 — MLX provider"
 *   pnpm release 0.1.5 --dry-run
 *   pnpm release 0.1.5 --no-push
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

const VERSION_FILES = [
  { path: "package.json", pattern: /("version":\s*")[^"]+(")/ },
  { path: "src-tauri/tauri.conf.json", pattern: /("version":\s*")[^"]+(")/ },
  { path: "src-tauri/Cargo.toml", pattern: /(^version\s*=\s*")[^"]+(")/m },
];

const SEMVER = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/;

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: opts.inherit ? "inherit" : "pipe", ...opts });
}

function runChecked(cmd, opts = {}) {
  try {
    return run(cmd, opts);
  } catch (e) {
    const msg = e.stderr?.trim() || e.stdout?.trim() || e.message;
    fail(msg || `Command failed: ${cmd}`);
  }
}

function fail(msg) {
  console.error(`release: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const positional = [];
  let message = "";
  let dryRun = false;
  let noPush = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--no-push") noPush = true;
    else if (arg === "--message" || arg === "-m") {
      message = argv[++i];
      if (!message) fail("--message requires a value");
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith("-")) fail(`Unknown option: ${arg}`);
    else positional.push(arg);
  }

  if (positional.length !== 1) {
    printHelp();
    process.exit(positional.length === 0 ? 1 : 1);
  }

  const raw = positional[0].replace(/^v/, "");
  if (!SEMVER.test(raw)) fail(`Invalid version "${positional[0]}" — expected semver like 0.1.5`);

  return { version: raw, tag: `v${raw}`, message, dryRun, noPush };
}

function printHelp() {
  console.log(`Usage: pnpm release <version> [options]

Bump package.json, tauri.conf.json, Cargo.toml (+ Cargo.lock), then commit, tag, and push.

Arguments:
  version           Semver (e.g. 0.1.5 or v0.1.5)

Options:
  -m, --message     Annotated tag message (default: "vX.Y.Z — Spacebar Editor release")
  --dry-run         Print actions without writing, committing, or pushing
  --no-push         Commit and tag locally only
  -h, --help        Show this help

Examples:
  pnpm release 0.1.5
  pnpm release 0.1.5 -m "v0.1.5 — MLX provider and activity grouping"
  pnpm release 0.1.5 --dry-run
`);
}

function readCurrentVersion() {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
  return pkg.version;
}

function assertCleanTree() {
  const status = run("git status --porcelain").trim();
  if (status) {
    fail(
      "Working tree is not clean. Commit or stash changes before releasing.\n" +
        status
          .split("\n")
          .map((l) => `  ${l}`)
          .join("\n")
    );
  }
}

function assertTagAbsent(tag) {
  const tags = run("git tag -l").trim().split("\n").filter(Boolean);
  if (tags.includes(tag)) fail(`Tag ${tag} already exists`);
}

function bumpVersionFiles(version) {
  const changes = [];
  for (const { path, pattern } of VERSION_FILES) {
    const abs = resolve(ROOT, path);
    const before = readFileSync(abs, "utf8");
    const after = before.replace(pattern, `$1${version}$2`);
    if (after === before) fail(`Could not update version in ${path}`);
    changes.push({ path, before, after });
  }
  return changes;
}

function applyChanges(changes) {
  for (const { path, after } of changes) {
    writeFileSync(resolve(ROOT, path), after, "utf8");
  }
}

/** Sync Cargo.lock with the bumped Cargo.toml, or CI's `cargo check --locked`
 *  fails. Prefers cargo; falls back to editing the lockfile's own package
 *  entry directly on machines without a Rust toolchain. */
function syncCargoLock(version) {
  try {
    run("cargo update --workspace --offline", { cwd: resolve(ROOT, "src-tauri"), inherit: true });
    return;
  } catch {
    console.warn("release: cargo unavailable — patching Cargo.lock directly");
  }
  // The app crate is `sidebar` (src-tauri/Cargo.toml [package].name).
  const lockPath = resolve(ROOT, "src-tauri/Cargo.lock");
  const before = readFileSync(lockPath, "utf8");
  const after = before.replace(
    /(\[\[package\]\]\nname = "sidebar"\nversion = ")[^"]+(")/,
    `$1${version}$2`
  );
  if (after === before) fail("Could not update the sidebar package entry in src-tauri/Cargo.lock");
  writeFileSync(lockPath, after, "utf8");
}

function main() {
  const { version, tag, message, dryRun, noPush } = parseArgs(process.argv.slice(2));
  const current = readCurrentVersion();
  const tagMessage = message || `${tag} — Spacebar Editor release`;

  console.log(`Current version: ${current}`);
  console.log(`New version:     ${version}`);
  console.log(`Tag:             ${tag}`);
  if (dryRun) console.log("(dry run — no changes will be made)\n");

  assertCleanTree();
  assertTagAbsent(tag);

  if (version === current) {
    console.warn(`release: warning — new version equals current (${current})`);
  }

  const changes = bumpVersionFiles(version);

  if (dryRun) {
    for (const { path, before, after } of changes) {
      console.log(`Would update ${path}`);
      const oldLine = before.match(/version[^\n]*/i)?.[0];
      const newLine = after.match(/version[^\n]*/i)?.[0];
      console.log(`  ${oldLine} → ${newLine}`);
    }
    console.log("Would sync src-tauri/Cargo.lock");
    console.log(`Would commit: chore: bump version to ${version}`);
    console.log(`Would tag:    ${tag}`);
    console.log(`  ${tagMessage}`);
    if (!noPush) console.log("Would push:   origin HEAD && origin " + tag);
    return;
  }

  applyChanges(changes);
  syncCargoLock(version);

  runChecked(
    "git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock",
    { inherit: true }
  );
  runChecked(`git commit -m "chore: bump version to ${version}"`, { inherit: true });
  runChecked(`git tag -a ${tag} -m ${JSON.stringify(tagMessage)}`, { inherit: true });

  console.log(`\nCreated ${tag} at chore: bump version to ${version}`);

  if (noPush) {
    console.log("Skipped push (--no-push). To publish:");
    console.log("  git push origin HEAD");
    console.log(`  git push origin ${tag}`);
    return;
  }

  runChecked("git push origin HEAD", { inherit: true });
  runChecked(`git push origin ${tag}`, { inherit: true });
  console.log(`\nPushed main and ${tag}. GitHub Release workflow should start for the tag.`);
}

main();
