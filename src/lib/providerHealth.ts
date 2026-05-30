/** Connection health for local inference servers (Ollama, llama.cpp). */

import { ollamaAuthHeaders } from "./ollamaClient";

export type ProviderDot = "idle" | "green" | "red" | "yellow";

export type ProviderHealth = {
  dot: ProviderDot;
  detail: string;
  modelCount: number;
  version?: string;
};

const PROBE_TIMEOUT_MS = 8_000;

function probeSignal(): AbortSignal {
  return AbortSignal.timeout(PROBE_TIMEOUT_MS);
}

/** TCP port from a base URL (falls back when omitted). */
export function portFromBaseUrl(url: string, defaultPort: number): number {
  try {
    const u = new URL(url.trim() || `http://127.0.0.1:${defaultPort}`);
    if (u.port) {
      const p = parseInt(u.port, 10);
      if (Number.isFinite(p) && p > 0) return p;
    }
    return u.protocol === "https:" ? 443 : defaultPort;
  } catch {
    return defaultPort;
  }
}

/** Probe Ollama (`/api/version` + `/api/tags`). */
export async function probeOllama(endpoint: string, apiKey?: string): Promise<ProviderHealth> {
  const base = (endpoint.trim() || "http://127.0.0.1:11434").replace(/\/$/, "");
  const headers = ollamaAuthHeaders(apiKey);
  try {
    const ver = await fetch(`${base}/api/version`, { headers, signal: probeSignal() });
    if (!ver.ok) {
      return { dot: "red", detail: `HTTP ${ver.status} at ${base}`, modelCount: 0 };
    }
    const verJson = (await ver.json().catch(() => ({}))) as { version?: string };
    const version = verJson.version;

    const tagsRes = await fetch(`${base}/api/tags`, { headers, signal: probeSignal() });
    if (!tagsRes.ok) {
      return {
        dot: "yellow",
        detail: `Server up · tags failed (${tagsRes.status})`,
        modelCount: 0,
        version,
      };
    }
    const tagsJson = (await tagsRes.json()) as { models?: { name: string }[] };
    const modelCount = tagsJson.models?.length ?? 0;
    if (modelCount === 0) {
      return {
        dot: "yellow",
        detail: `Connected · no models installed`,
        modelCount: 0,
        version,
      };
    }
    return {
      dot: "green",
      detail: version
        ? `Connected · v${version} · ${modelCount} model(s)`
        : `Connected · ${modelCount} model(s)`,
      modelCount,
      version,
    };
  } catch {
    return { dot: "red", detail: `Unreachable at ${base}`, modelCount: 0 };
  }
}

/** Probe llama.cpp OpenAI-compatible server (`GET /v1/models`). */
export async function probeLlamacpp(
  endpoint: string,
  apiKey?: string
): Promise<ProviderHealth> {
  const base = (endpoint.trim() || "http://127.0.0.1:8080").replace(/\/$/, "");
  const headers: Record<string, string> = {};
  const k = apiKey?.trim();
  if (k) headers.Authorization = `Bearer ${k}`;

  try {
    const res = await fetch(`${base}/v1/models`, { headers, signal: probeSignal() });
    if (!res.ok) {
      return {
        dot: "red",
        detail: `HTTP ${res.status} at ${base}`,
        modelCount: 0,
      };
    }
    const j = (await res.json()) as { data?: Array<{ id: string }> };
    const modelCount = j.data?.length ?? 0;
    if (modelCount === 0) {
      return {
        dot: "yellow",
        detail: `Connected · no models reported`,
        modelCount: 0,
      };
    }
    return {
      dot: "green",
      detail: `Connected · ${modelCount} model(s)`,
      modelCount,
    };
  } catch {
    return { dot: "red", detail: `Unreachable at ${base}`, modelCount: 0 };
  }
}

/** Shell command to stop a process listening on a port (Linux/macOS). */
export function stopServerOnPortCommand(port: number): string {
  return `(fuser -k ${port}/tcp 2>/dev/null || (pids=$(lsof -ti:${port} 2>/dev/null) && [ -n "$pids" ] && kill $pids)) || true`;
}

/** Start Ollama in the background (best-effort). */
export function startOllamaServeCommand(): string {
  return "nohup ollama serve >/dev/null 2>&1 &";
}

/** Stop llama-server processes (best-effort). */
export function stopLlamacppServerCommand(port: number): string {
  return `${stopServerOnPortCommand(port)}; pkill -f llama-server 2>/dev/null || true`;
}

/** Stop Ollama listener + daemon (best-effort). */
export function stopOllamaServerCommand(port: number): string {
  return `${stopServerOnPortCommand(port)}; pkill -x ollama 2>/dev/null || true`;
}
