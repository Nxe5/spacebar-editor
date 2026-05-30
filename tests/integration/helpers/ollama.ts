const DEFAULT_HOST = "http://127.0.0.1:11434";

export function ollamaHost(): string {
  return (process.env.OLLAMA_HOST ?? DEFAULT_HOST).replace(/\/$/, "");
}

export async function ollamaReachable(host = ollamaHost()): Promise<boolean> {
  try {
    const res = await fetch(`${host}/api/version`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listOllamaModels(host = ollamaHost()): Promise<string[]> {
  const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Ollama /api/tags failed: ${res.status}`);
  const data = (await res.json()) as { models?: Array<{ name: string }> };
  return (data.models ?? []).map((m) => m.name).filter(Boolean);
}

/** Models to run tool probes against (env-driven). */
export async function resolveOllamaToolTestModels(host = ollamaHost()): Promise<string[]> {
  const explicit = process.env.OLLAMA_TOOL_TEST_MODELS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (explicit?.length) return explicit;

  const all = await listOllamaModels(host);
  if (process.env.OLLAMA_TOOL_TEST_ALL === "1") return all;

  const single =
    process.env.OLLAMA_TOOL_TEST_MODEL?.trim() ||
    process.env.OLLAMA_TEST_MODEL?.trim() ||
    "llama3.2:1b";
  return [single];
}
