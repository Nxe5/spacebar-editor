#!/usr/bin/env node
/**
 * Copy the canonical cask into homebrew-spacebar/Casks/ (body sync from packaging template).
 *
 *   pnpm sync-homebrew-tap
 */
import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SRC = resolve(ROOT, "packaging/homebrew/spacebar-editor.rb");
const DEST = resolve(ROOT, "homebrew-spacebar/Casks/spacebar-editor.rb");

if (!existsSync(SRC)) {
  console.error("sync-homebrew-tap: missing packaging/homebrew/spacebar-editor.rb");
  process.exit(1);
}

copyFileSync(SRC, DEST);
console.log(`Synced ${DEST}`);
