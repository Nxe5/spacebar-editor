#!/usr/bin/env node
/**
 * Desktop dev launcher: WebKit on Linux often loses the Vite connection or shows a
 * blank webview unless compositing is disabled. Forwards all args to `tauri`.
 */
import { spawn } from "node:child_process";

const env = { ...process.env };
if (process.platform === "linux") {
  env.WEBKIT_DISABLE_COMPOSITING_MODE = "1";
}

const child = spawn("pnpm", ["exec", "tauri", ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
  shell: false,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
