#!/usr/bin/env node
/**
 * Refresh packaging/homebrew/spacebar-editor.rb version + sha256 from GitHub Releases.
 *
 *   pnpm update-homebrew-cask
 *   pnpm update-homebrew-cask 0.1.7
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const CASK_PATH = resolve(ROOT, "packaging/homebrew/spacebar-editor.rb");
const TAP_CASK_PATH = resolve(ROOT, "homebrew-spacebar/Casks/spacebar-editor.rb");
const REPO = "Jiguey/spacebar-editor";

function fail(msg) {
  console.error(`update-homebrew-cask: ${msg}`);
  process.exit(1);
}

function readVersion() {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
  return pkg.version;
}

function dmgFileName(version) {
  return `Spacebar.Editor_${version}_universal.dmg`;
}

function dmgUrl(version) {
  const file = dmgFileName(version);
  return `https://github.com/${REPO}/releases/download/v${version}/${file}`;
}

async function sha256FromReleaseApi(version) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/v${version}`);
  if (!res.ok) {
    return null;
  }
  const release = await res.json();
  const target = dmgFileName(version);
  const asset = release.assets?.find((a) => a.name === target);
  const digest = asset?.digest;
  if (typeof digest === "string" && digest.startsWith("sha256:")) {
    return digest.slice("sha256:".length);
  }
  return null;
}

async function sha256ForUrl(url) {
  const res = await fetch(url);
  if (!res.ok) fail(`GET ${url} failed: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return createHash("sha256").update(buf).digest("hex");
}

function updateCaskFile(path, version, sha256) {
  let text = readFileSync(path, "utf8");
  text = text.replace(/version "[^"]+"/, `version "${version}"`);
  text = text.replace(/sha256 "[^"]+"/, `sha256 "${sha256}"`);
  writeFileSync(path, text);
}

async function main() {
  const version = process.argv[2] ?? readVersion();
  const url = dmgUrl(version);

  let sha256 = await sha256FromReleaseApi(version);
  if (sha256) {
    console.log(`Using sha256 from GitHub release API for ${dmgFileName(version)}`);
  } else {
    console.log(`Fetching ${url}`);
    sha256 = await sha256ForUrl(url);
  }

  updateCaskFile(CASK_PATH, version, sha256);
  updateCaskFile(TAP_CASK_PATH, version, sha256);
  console.log(`Updated ${CASK_PATH}`);
  console.log(`Updated ${TAP_CASK_PATH}`);
  console.log(`  version ${version}`);
  console.log(`  sha256  ${sha256}`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
