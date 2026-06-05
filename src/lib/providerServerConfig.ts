/** Hybrid provider config: API-controllable vs systemd/terminal server settings. */

export type OllamaServerTemplate = {
  modelsPath: string;
  contextLength: number;
  numThreads: number;
  keepAlive: number;
  maxLoadedModels: number;
  numParallel: number;
  newEngine: boolean;
  flashAttention: boolean;
  /** Vega and older GPUs: leave false; do not set HSA_OVERRIDE. */
  useHsaOverride: boolean;
  hsaOverrideVersion: string;
};

export type LlamacppServerTemplate = {
  serviceName: string;
  modelPath: string;
  host: string;
  port: number;
  context: number;
  ngl: number;
  threads: number;
  threadsBatch: number;
  ubatch: number;
  batch: number;
  flashAttn: boolean;
  mlock: boolean;
  jinja: boolean;
  user: string;
};

export const DEFAULT_OLLAMA_SERVER_TEMPLATE: OllamaServerTemplate = {
  modelsPath: "~/.ollama/models",
  contextLength: 8192,
  numThreads: 6,
  keepAlive: -1,
  maxLoadedModels: 1,
  numParallel: 1,
  newEngine: false,
  flashAttention: false,
  useHsaOverride: false,
  hsaOverrideVersion: "9.0.6",
};

export const DEFAULT_LLAMACPP_SERVER_TEMPLATE: LlamacppServerTemplate = {
  serviceName: "llamacpp",
  modelPath: "/path/to/model.gguf",
  host: "127.0.0.1",
  port: 8080,
  context: 8192,
  ngl: 99,
  threads: 6,
  threadsBatch: 12,
  ubatch: 512,
  batch: 512,
  flashAttn: true,
  mlock: true,
  jinja: true,
  user: "user",
};

export type LlamacppFlagDoc = {
  flag: string;
  meaning: string;
  restart: "server" | "api";
};

/** llama-server flags from the project's working systemd unit. */
export const LLAMACPP_FLAG_DOCS: LlamacppFlagDoc[] = [
  { flag: "--host 127.0.0.1", meaning: "Bind address", restart: "server" },
  { flag: "--port 8080", meaning: "HTTP port (Spacebar Editor default)", restart: "server" },
  { flag: "-m /path/to/model.gguf", meaning: "GGUF model file to load", restart: "server" },
  { flag: "-ngl 99", meaning: "GPU layers (99 = all layers on ROCm/Vulkan)", restart: "server" },
  { flag: "-c 8192", meaning: "Context size (KV cache)", restart: "server" },
  { flag: "-t 6", meaning: "CPU threads for prompt processing", restart: "server" },
  { flag: "-tb 12", meaning: "Threads for batch processing", restart: "server" },
  { flag: "-ub 512", meaning: "Micro-batch size (physical)", restart: "server" },
  { flag: "-b 512", meaning: "Logical batch size", restart: "server" },
  { flag: "--flash-attn on", meaning: "Flash attention (GPU-dependent)", restart: "server" },
  { flag: "--jinja", meaning: "Chat template support (recommended)", restart: "server" },
  { flag: "--mlock", meaning: "Lock model in RAM (avoid swap)", restart: "server" },
];

export type OllamaApiDoc = {
  name: string;
  via: "Spacebar Editor" | "API" | "Both";
  notes: string;
};

export const OLLAMA_API_DOCS: OllamaApiDoc[] = [
  { name: "Model", via: "Both", notes: "Switch in model menu or ollama run — no service restart." },
  { name: "Context (num_ctx)", via: "Both", notes: "Per request; may reload model if size changes." },
  { name: "Threads (num_thread)", via: "Both", notes: "Per request; server default from OLLAMA_NUM_THREADS." },
  { name: "Endpoint URL", via: "Spacebar Editor", notes: "Settings → Ollama URL." },
  { name: "OLLAMA_KEEP_ALIVE", via: "API", notes: "ollama ps UNTIL column; -1 = keep loaded." },
];

function clampPosInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) return fallback;
  return Math.floor(value);
}

export function normalizeOllamaServerTemplate(
  raw: Partial<OllamaServerTemplate> | undefined
): OllamaServerTemplate {
  const base = raw ?? {};
  return {
    modelsPath: base.modelsPath?.trim() || DEFAULT_OLLAMA_SERVER_TEMPLATE.modelsPath,
    contextLength: clampPosInt(base.contextLength, DEFAULT_OLLAMA_SERVER_TEMPLATE.contextLength),
    numThreads: clampPosInt(base.numThreads, DEFAULT_OLLAMA_SERVER_TEMPLATE.numThreads),
    keepAlive:
      typeof base.keepAlive === "number" ? base.keepAlive : DEFAULT_OLLAMA_SERVER_TEMPLATE.keepAlive,
    maxLoadedModels: clampPosInt(
      base.maxLoadedModels,
      DEFAULT_OLLAMA_SERVER_TEMPLATE.maxLoadedModels
    ),
    numParallel: clampPosInt(base.numParallel, DEFAULT_OLLAMA_SERVER_TEMPLATE.numParallel),
    newEngine: base.newEngine ?? DEFAULT_OLLAMA_SERVER_TEMPLATE.newEngine,
    flashAttention: base.flashAttention ?? DEFAULT_OLLAMA_SERVER_TEMPLATE.flashAttention,
    useHsaOverride: base.useHsaOverride ?? DEFAULT_OLLAMA_SERVER_TEMPLATE.useHsaOverride,
    hsaOverrideVersion:
      base.hsaOverrideVersion?.trim() || DEFAULT_OLLAMA_SERVER_TEMPLATE.hsaOverrideVersion,
  };
}

export function normalizeLlamacppServerTemplate(
  raw: Partial<LlamacppServerTemplate> | undefined
): LlamacppServerTemplate {
  const base = raw ?? {};
  return {
    serviceName: base.serviceName?.trim() || DEFAULT_LLAMACPP_SERVER_TEMPLATE.serviceName,
    modelPath: base.modelPath?.trim() || DEFAULT_LLAMACPP_SERVER_TEMPLATE.modelPath,
    host: base.host?.trim() || DEFAULT_LLAMACPP_SERVER_TEMPLATE.host,
    port: clampPosInt(base.port, DEFAULT_LLAMACPP_SERVER_TEMPLATE.port),
    context: clampPosInt(base.context, DEFAULT_LLAMACPP_SERVER_TEMPLATE.context),
    ngl:
      typeof base.ngl === "number" && base.ngl >= 0
        ? Math.floor(base.ngl)
        : DEFAULT_LLAMACPP_SERVER_TEMPLATE.ngl,
    threads: clampPosInt(base.threads, DEFAULT_LLAMACPP_SERVER_TEMPLATE.threads),
    threadsBatch: clampPosInt(base.threadsBatch, DEFAULT_LLAMACPP_SERVER_TEMPLATE.threadsBatch),
    ubatch: clampPosInt(base.ubatch, DEFAULT_LLAMACPP_SERVER_TEMPLATE.ubatch),
    batch: clampPosInt(base.batch, DEFAULT_LLAMACPP_SERVER_TEMPLATE.batch),
    flashAttn: base.flashAttn ?? DEFAULT_LLAMACPP_SERVER_TEMPLATE.flashAttn,
    mlock: base.mlock ?? DEFAULT_LLAMACPP_SERVER_TEMPLATE.mlock,
    jinja: base.jinja ?? DEFAULT_LLAMACPP_SERVER_TEMPLATE.jinja,
    user: base.user?.trim() || DEFAULT_LLAMACPP_SERVER_TEMPLATE.user,
  };
}

export type OllamaOverrideFieldKind = "string" | "number" | "boolean";

export type OllamaOverrideField = {
  label: string;
  envVar: string;
  kind: OllamaOverrideFieldKind;
  templateKey: keyof OllamaServerTemplate;
  hint?: string;
  min?: number;
  /** Row visible only when this returns true. */
  visible?: (t: OllamaServerTemplate) => boolean;
};

/** Editable rows for systemd override.conf (context is API-only, not in override). */
export const OLLAMA_OVERRIDE_FIELDS: OllamaOverrideField[] = [
  { label: "Models path", envVar: "OLLAMA_MODELS", kind: "string", templateKey: "modelsPath" },
  {
    label: "New engine",
    envVar: "OLLAMA_NEW_ENGINE",
    kind: "boolean",
    templateKey: "newEngine",
    hint: "Off for Vega",
  },
  {
    label: "Keep alive",
    envVar: "OLLAMA_KEEP_ALIVE",
    kind: "number",
    templateKey: "keepAlive",
    hint: "-1 = forever",
  },
  {
    label: "Max loaded models",
    envVar: "OLLAMA_MAX_LOADED_MODELS",
    kind: "number",
    templateKey: "maxLoadedModels",
    min: 1,
  },
  {
    label: "Threads",
    envVar: "OLLAMA_NUM_THREADS",
    kind: "number",
    templateKey: "numThreads",
    min: 1,
  },
  {
    label: "Flash attention",
    envVar: "OLLAMA_FLASH_ATTENTION",
    kind: "boolean",
    templateKey: "flashAttention",
    hint: "Off for Vega",
  },
  {
    label: "Num parallel",
    envVar: "OLLAMA_NUM_PARALLEL",
    kind: "number",
    templateKey: "numParallel",
    min: 1,
  },
  {
    label: "HSA override",
    envVar: "(enable line)",
    kind: "boolean",
    templateKey: "useHsaOverride",
    hint: "Usually off on Vega",
  },
  {
    label: "HSA version",
    envVar: "HSA_OVERRIDE_GFX_VERSION",
    kind: "string",
    templateKey: "hsaOverrideVersion",
    visible: (t) => t.useHsaOverride,
  },
];

export function buildOllamaOverrideConf(t: OllamaServerTemplate): string {
  const lines = [
    "[Service]",
    `Environment="OLLAMA_MODELS=${t.modelsPath}"`,
    `Environment="OLLAMA_NEW_ENGINE=${t.newEngine ? 1 : 0}"`,
    `Environment="OLLAMA_KEEP_ALIVE=${t.keepAlive}"`,
    `Environment="OLLAMA_MAX_LOADED_MODELS=${t.maxLoadedModels}"`,
    `Environment="OLLAMA_NUM_THREADS=${t.numThreads}"`,
    `Environment="OLLAMA_FLASH_ATTENTION=${t.flashAttention ? 1 : 0}"`,
    `Environment="OLLAMA_NUM_PARALLEL=${t.numParallel}"`,
  ];
  if (t.useHsaOverride) {
    lines.push(`Environment="HSA_OVERRIDE_GFX_VERSION=${t.hsaOverrideVersion}"`);
  }
  lines.push("ExecStart=", "ExecStart=/usr/bin/ollama serve");
  return lines.join("\n");
}

export function buildOllamaApplyCommands(): string {
  return [
    "sudo systemctl edit ollama",
    "# paste the override.conf below, save, then:",
    "sudo systemctl daemon-reload",
    "sudo systemctl restart ollama",
    "sleep 3",
    "ollama ps",
  ].join("\n");
}

/** One line to run after saving override.conf in systemctl edit. */
export function buildOllamaRestartOneLiner(): string {
  return "sudo systemctl daemon-reload && sudo systemctl restart ollama";
}

export function buildOllamaModelfileCommand(model: string, numCtx: number, numThread: number): string {
  const slug = model.replace(/[:/]/g, "-");
  return [
    `cat > /tmp/sidebar-${slug}.Modelfile <<'EOF'`,
    `FROM ${model}`,
    `PARAMETER num_ctx ${numCtx}`,
    `PARAMETER num_thread ${numThread}`,
    "EOF",
    `ollama create sidebar-${slug} -f /tmp/sidebar-${slug}.Modelfile`,
  ].join("\n");
}

export function buildOllamaApiTestCurl(
  endpoint: string,
  model: string,
  numCtx: number,
  numThread: number
): string {
  const base = endpoint.replace(/\/$/, "");
  const body = JSON.stringify({
    model,
    messages: [{ role: "user", content: "Say hi" }],
    stream: false,
    options: { num_ctx: numCtx, num_thread: numThread },
  });
  return `curl -s ${base}/api/chat -H 'Content-Type: application/json' -d '${body}'`;
}

export function buildLlamacppExecStart(t: LlamacppServerTemplate): string {
  const flags = [
    `--host ${t.host}`,
    `--port ${t.port}`,
    `-m ${t.modelPath}`,
    `-ngl ${t.ngl}`,
  ];
  if (t.jinja) flags.push("--jinja");
  if (t.flashAttn) flags.push("--flash-attn on");
  flags.push(
    `-c ${t.context}`,
    `-t ${t.threads}`,
    `-tb ${t.threadsBatch}`,
    `-ub ${t.ubatch}`,
    `-b ${t.batch}`
  );
  if (t.mlock) flags.push("--mlock");
  return `/usr/bin/llama-server \\\n  ${flags.join(" \\\n  ")}`;
}

export function buildLlamacppServiceUnit(t: LlamacppServerTemplate): string {
  return `[Unit]
Description=llama-server
After=network.target

[Service]
ExecStart=${buildLlamacppExecStart(t)}
Restart=always
User=${t.user}

[Install]
WantedBy=default.target`;
}

export function buildLlamacppApplyCommands(t: LlamacppServerTemplate): string {
  return [
    `sudo systemctl edit ${t.serviceName}`,
    "# paste the [Service] ExecStart= block below, save, then:",
    "sudo systemctl daemon-reload",
    `sudo systemctl restart ${t.serviceName}`,
    "sleep 2",
    `curl -s http://${t.host}:${t.port}/v1/models`,
  ].join("\n");
}

/** One line to run after saving ExecStart in systemctl edit. */
export function buildLlamacppRestartOneLiner(t: LlamacppServerTemplate): string {
  return `sudo systemctl daemon-reload && sudo systemctl restart ${t.serviceName}`;
}

export function buildLlamacppContextChangeCommand(
  t: LlamacppServerTemplate,
  newContext: number
): string {
  return [
    `# Change context from ${t.context} → ${newContext} (requires service restart)`,
    `sudo systemctl edit ${t.serviceName}`,
    `# In ExecStart, change: -c ${t.context}  →  -c ${newContext}`,
    "sudo systemctl daemon-reload",
    `sudo systemctl restart ${t.serviceName}`,
  ].join("\n");
}

export function buildLlamacppModelChangeCommand(
  t: LlamacppServerTemplate,
  newModelPath: string
): string {
  return [
    "# Change model file (requires service restart)",
    `sudo systemctl edit ${t.serviceName}`,
    `# In ExecStart, change: -m ${t.modelPath}`,
    `#                    to: -m ${newModelPath}`,
    "sudo systemctl daemon-reload",
    `sudo systemctl restart ${t.serviceName}`,
  ].join("\n");
}

export function buildLlamacppOneShotCommand(t: LlamacppServerTemplate): string {
  return buildLlamacppExecStart(t).replace(/ \\\n  /g, " ");
}
