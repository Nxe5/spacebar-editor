/**
 * Free the TCP listener on the Vite dev port before starting Vite.
 * Matches defaults in vite.config.ts / src-tauri/tauri.conf.json devUrl.
 *
 * kill-port alone sometimes misses listeners (IPv6 / edge cases); we SIGKILL
 * processes from lsof LISTEN rows first on Unix, then kill-port / fuser.
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";

const require = createRequire(import.meta.url);
/** @type {(port: number, method?: string) => Promise<void>} */
const killPortPkg = require("kill-port");

const port = Number(process.env.VITE_PORT ?? process.env.PORT ?? 14200);

function killListenPidsUnix(p) {
  try {
    const out = execSync(`lsof -nP -iTCP:${p} -sTCP:LISTEN -t`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    for (const token of out.split(/\s+/)) {
      const pid = Number(token);
      if (Number.isFinite(pid) && pid > 0) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          /* stale PID */
        }
      }
    }
  } catch {
    /* no LISTEN rows */
  }
}

if (process.platform !== "win32") {
  killListenPidsUnix(port);
}

await killPortPkg(port).catch(() => {});

if (process.platform === "linux") {
  try {
    execSync(`fuser -k ${port}/tcp`, { stdio: "ignore" });
  } catch {
    /* none / no fuser */
  }
}

await new Promise((r) => setTimeout(r, 250));
