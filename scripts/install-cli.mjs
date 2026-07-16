#!/usr/bin/env node
/**
 * Install the `spacebar` CLI shim to /usr/local/bin (macOS/Linux) or ~/.local/bin.
 *
 *   pnpm install-cli
 *   pnpm install-cli --bin ~/.local/bin
 */
import { execSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHIM_SRC = resolve(ROOT, "scripts/spacebar-cli.sh");

function parseTargetBin(argv) {
  const idx = argv.indexOf("--bin");
  if (idx !== -1) {
    const value = argv[idx + 1];
    if (!value) fail("--bin requires a directory path");
    return resolve(value);
  }
  if (process.platform === "win32") {
    fail("install-cli is macOS/Linux only; use pnpm spacebar on Windows for now");
  }
  return "/usr/local/bin";
}

function fail(msg) {
  console.error(`install-cli: ${msg}`);
  process.exit(1);
}

function main() {
  if (!existsSync(SHIM_SRC)) fail(`missing ${SHIM_SRC}`);

  const binDir = parseTargetBin(process.argv.slice(2));
  const dest = resolve(binDir, "spacebar");

  try {
    mkdirSync(binDir, { recursive: true });
  } catch (e) {
    fail(`cannot create ${binDir}: ${e}`);
  }

  try {
    copyFileSync(SHIM_SRC, dest);
    chmodSync(dest, 0o755);
  } catch (e) {
    fail(
      `cannot write ${dest} (try: pnpm install-cli --bin ${resolve(homedir(), ".local/bin")})\n${e}`
    );
  }

  console.log(`Installed ${dest}`);
  if (binDir === "/usr/local/bin") {
    console.log("Run: spacebar /path/to/file");
  } else {
    console.log(`Ensure ${binDir} is on your PATH, then: spacebar /path/to/file`);
  }
}

main();
