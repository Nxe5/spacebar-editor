/**
 * Free the TCP listener on the Vite dev port before starting Vite.
 * Matches defaults in vite.config.ts / src-tauri/tauri.conf.json devUrl.
 */
import { execSync } from "node:child_process";
import process from "node:process";

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

function killListenPidsWindows(p) {
  try {
    const out = execSync(`netstat -ano -p tcp | findstr :${p}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes("LISTENING")) continue;
      const parts = line.trim().split(/\s+/);
      const pid = Number(parts[parts.length - 1]);
      if (Number.isFinite(pid) && pid > 0) pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
      } catch {
        /* already gone */
      }
    }
  } catch {
    /* no listeners */
  }
}

if (process.platform === "win32") {
  killListenPidsWindows(port);
} else {
  killListenPidsUnix(port);
}

if (process.platform === "linux") {
  try {
    execSync(`fuser -k ${port}/tcp`, { stdio: "ignore" });
  } catch {
    /* none / no fuser */
  }
}

await new Promise((r) => setTimeout(r, 250));
