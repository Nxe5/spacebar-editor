# Spec 42 — MLX Provider (Apple Silicon)

> **Status:** ❌ **Not started**
> **Area:** Providers · Settings · Local Models · macOS
> **Phase:** B / Phase 1 — high priority for beta on Apple Silicon
> **Depends on:** [08-ai-agent.md](08-ai-agent.md) · [30-agent-context-and-model-settings.md](30-agent-context-and-model-settings.md) · [02-technology.md](02-technology.md)

> **Related:** `src/lib/providers/openaiCompat.ts` · `src/lib/llamaCppClient.ts` · `src/lib/modelSettings.ts` · `src/lib/agentLimits.ts` · `src/lib/chatFooterProfile.ts` · `src/lib/compactionModel.ts` · `src/lib/inferenceOptions.ts` · `src/lib/contextBudget.ts`

---

## 1. Overview

[MLX](https://github.com/ml-explore/mlx) is Apple's array framework for Apple Silicon. `mlx_lm` ships a local inference server (`mlx_lm.server`) that exposes an **OpenAI-compatible HTTP API**. It runs natively on M-series chips via the Metal GPU without any Docker or CUDA layer, making it the fastest local inference path for macOS users.

Adding MLX as a first-class provider gives Apple Silicon users an alternative to Ollama and llama.cpp with:
- Metal GPU acceleration (no CPU fallback bottleneck)
- HuggingFace model ecosystem with MLX-format quantizations
- Zero configuration beyond `pip install mlx-lm && mlx_lm.server`

### Protocol summary

`mlx_lm.server` implements the same OpenAI chat completions wire format as `openaiCompat.ts` already handles. The main differences from llama.cpp:

| Feature | llama.cpp | mlx_lm.server |
|---------|-----------|----------------|
| Default port | 8080 | 8080 (configurable) |
| `/v1/chat/completions` | ✅ | ✅ |
| `/v1/models` | ✅ | ✅ (returns loaded model) |
| `/props` (context window) | ✅ | ❌ — use `/v1/models` metadata |
| Streaming (SSE) | ✅ | ✅ |
| Tool calls | Model-dependent | Model-dependent |
| Platform | Cross-platform | macOS + Apple Silicon only |

Because the wire protocol is already handled by `openaiCompat.ts`, implementing MLX is mainly plumbing: a thin `mlxClient.ts`, model settings integration, and Settings UI — matching the llama.cpp pattern.

### Goals

- MLX appears as a selectable backend (`chatBackend: "mlx"`) alongside Ollama, llama.cpp, Anthropic, and DeepSeek.
- Users configure the server URL and model name in Settings → MLX.
- Context window is read from `/v1/models` metadata or set as a manual override.
- Chat footer shows the active MLX model name and connection status.
- All agent features (tool calls, compaction, limits) work identically to llama.cpp.
- macOS-only UI hint: a note in Settings surfaces that MLX requires Apple Silicon.

### Non-Goals

- Spawning the `mlx_lm.server` process from within the app (users run it themselves — same as llama.cpp).
- Listing or downloading models from HuggingFace in-app (that is Phase 2 / Spec 27 scope extended to MLX).
- Detecting Apple Silicon at runtime to hide/show the provider (show it always; let users discover).
- Fine-tuning support.

---

## 2. Protocol Details

### 2.1 Server startup (user responsibility)

```bash
pip install mlx-lm
mlx_lm.server --model mlx-community/Qwen2.5-Coder-7B-Instruct-4bit --port 8080
```

The model argument is a HuggingFace repo ID. MLX downloads and caches the model on first run.

### 2.2 `/v1/models` response

```json
{
  "object": "list",
  "data": [
    {
      "id": "mlx-community/Qwen2.5-Coder-7B-Instruct-4bit",
      "object": "model",
      "created": 1700000000
    }
  ]
}
```

The `id` is the HuggingFace repo identifier. Use it as the display name (strip `mlx-community/` prefix for short display).

### 2.3 Context window

`mlx_lm.server` does not expose context window size in the `/v1/models` response. Two options:
1. **Manual override** (default): user sets `contextWindow` in Settings; fallback is 8192.
2. **Heuristic**: map known model families to known context sizes (Qwen2.5 → 32768, Llama 3 → 8192). This is advisory.

Prefer the manual override path — same as llama.cpp's fallback.

---

## 3. Implementation Plan

### Phase 1 — Core provider (target: beta)

#### 3.1 `src/lib/mlxClient.ts` (new file)

Mirror `llamaCppClient.ts`. Key exports:

```typescript
export const DEFAULT_MLX_ENDPOINT = "http://127.0.0.1:8080";

export type MlxModelRow = {
  id: string;          // full HF repo id
  name: string;        // display: strip "mlx-community/" prefix
  provider: "mlx";
  contextWindow: number;
};

/** GET /v1/models — returns the single loaded model. */
export async function fetchMlxModelList(
  endpoint: string,
  fallbackContext = 8192
): Promise<MlxModelRow[]>;

/** HEAD /v1/models — returns true if the server is reachable. */
export async function pingMlxServer(endpoint: string): Promise<boolean>;
```

No `/props` equivalent — context comes from user setting or heuristic table.

#### 3.2 `src/lib/modelSettings.ts`

Add `mlx` alongside `llamacpp`:

```typescript
mlx: {
  endpoint: DEFAULT_MLX_ENDPOINT,
  models: [] as MlxModelRow[],
  selectedModel: "",
  contextWindow: 8192,   // user-overridable
}
```

Persistence key: `sidebar.settings.v4` (same JSON blob, additive — no migration needed).

#### 3.3 `src/lib/agentLimits.ts`

```typescript
export type AgentLimitsBackend = "anthropic" | "deepseek" | "ollama" | "llamacpp" | "mlx";
```

MLX uses the same default limits as `llamacpp` (local, unmetered).

#### 3.4 `src/lib/inferenceOptions.ts`

Add `mlxModels: MlxModelRow[]` to the inference options type. Wire `backend === "mlx"` to `mlxModels` in the selector.

#### 3.5 `src/lib/contextBudget.ts`

Add `mlx` branch — reads `contextWindow` from model settings (same as `llamacpp` pattern).

#### 3.6 `src/lib/compactionModel.ts`

Add `"mlx"` to `BACKENDS` array and add the `mlx` branch in the model/context-window selectors.

#### 3.7 `src/lib/chatFooterProfile.ts`

Add `mlx` entry:

```typescript
mlx: {
  label: "MLX",
  color: "text-purple-400",      // Apple-adjacent purple
  icon: "cpu",                   // or a custom icon
  usageProviderId: "mlx",
}
```

#### 3.8 `src/lib/providers/openaiCompat.ts`

Add default endpoint:

```typescript
export const DEFAULT_ENDPOINTS = {
  ollama: "http://localhost:11434",
  lmstudio: "http://localhost:1234",
  llamacpp: "http://localhost:8080",
  mlx: "http://localhost:8080",   // mlx_lm.server default
};
```

The stream function itself needs no changes — `openaiCompat.streamChat` already handles the wire format.

#### 3.9 Settings UI — Settings → MLX (new section)

Pattern: mirror the llama.cpp settings section.

| Control | Notes |
|---------|-------|
| **Server URL** text field | Default: `http://127.0.0.1:8080` |
| **Refresh models** button | Calls `fetchMlxModelList`; populates model list |
| **Model selector** dropdown | Shows refreshed models; `name` is the display string |
| **Context window** number input | Manual override; shown below model picker |
| **Connection status** indicator | Green dot (reachable) / red (unreachable) via `pingMlxServer` |
| **Platform note** | `"Requires mlx-lm on Apple Silicon (macOS only)"` — muted help text |

No API key field — `mlx_lm.server` has no auth by default. If the user wants auth, they can add a Bearer token; add an optional API key field as a stretch goal.

#### 3.10 Backend selector in chat footer / agent settings

Add `"mlx"` to the provider dropdown wherever `"llamacpp"` appears.

### Phase 2 — Model recommendations (post-beta)

Maintain a curated list of MLX-format models known to handle tool calls well, following the Ollama recommendation pattern in [Spec 27](27-local-model-ux.md) §4.2:

```typescript
const MLX_AGENT_RECOMMENDED = new Set([
  "mlx-community/Qwen2.5-Coder-7B-Instruct-4bit",
  "mlx-community/Qwen2.5-Coder-14B-Instruct-4bit",
  "mlx-community/Mistral-Nemo-Instruct-2407-4bit",
  "mlx-community/Llama-3.1-8B-Instruct-4bit",
]);
```

Show a "Recommended for agent use" badge next to known-good models in the model picker.

---

## 4. Files to Change

| File | Change |
|------|--------|
| `src/lib/mlxClient.ts` | **New** — `fetchMlxModelList`, `pingMlxServer` |
| `src/lib/modelSettings.ts` | Add `mlx` settings shape + pick helper |
| `src/lib/agentLimits.ts` | Add `"mlx"` to `AgentLimitsBackend` union |
| `src/lib/inferenceOptions.ts` | Add `mlxModels` field + `backend === "mlx"` branch |
| `src/lib/contextBudget.ts` | Add `mlxModels` field + `"mlx"` branch |
| `src/lib/compactionModel.ts` | Add `"mlx"` to `BACKENDS`; model/context branches |
| `src/lib/chatFooterProfile.ts` | Add `mlx` chat footer profile entry |
| `src/lib/providers/openaiCompat.ts` | Add `mlx` to `DEFAULT_ENDPOINTS` |
| `src/lib/providers/index.ts` | Re-export any new MLX-specific types if needed |
| Settings Svelte component | New MLX section (URL, refresh, model picker, context override, status) |
| Agent backend selector | Add `"mlx"` wherever `"llamacpp"` appears in dropdowns |

---

## 5. Edge Cases & Failure Modes

| Scenario | Handling |
|----------|----------|
| Server not running | `pingMlxServer` returns false; show red indicator + "Start mlx_lm.server" hint |
| Port conflict with llama.cpp (both on 8080) | Both servers can't use 8080; user changes one — document in Settings help text |
| Model not yet loaded (server starting) | Retry on refresh button; don't auto-retry on a timer |
| `/v1/models` returns empty list | Show "No model loaded" state; prompt user to restart server with `--model` |
| Non-Apple-Silicon macOS or Linux | Server simply won't be installable; no runtime check needed in the app |
| Tool call format mismatch | Same stall/parse handling as llama.cpp via `openaiCompat.ts` + [22](22-llm-file-interaction.md) |
| Context window unknown | Fallback to 8192; user overrides via the context window field in Settings |

---

## 6. Open Questions

| Question | Recommendation |
|----------|----------------|
| Separate port from llama.cpp (e.g. 8081 default)? | Keep 8080 as default — matches mlx_lm.server default; users change whichever conflicts |
| Auto-detect if running on Apple Silicon and hide the provider on other platforms? | No — keep it visible; cross-platform developers still want to know it exists |
| Optional Bearer token / API key support? | Add an optional field in Settings but don't require it; document the `--api-key` mlx_lm flag |
| Share the port / endpoint field with llama.cpp? | No — separate settings. Both are single-model servers but configured independently |

---

## 7. Acceptance Criteria

1. MLX appears as a selectable backend in Settings and the chat footer provider picker.
2. Entering the server URL and clicking "Refresh Models" populates the model list from `GET /v1/models`.
3. Agent chat with tool use works via `streamChat` with `backend: "mlx"`.
4. Context window is read from the user-set override; the context budget meter reflects it.
5. Connection status indicator shows green when `mlx_lm.server` is reachable, red otherwise.
6. Compaction and agent limits work identically to the llama.cpp backend.
7. A macOS/Apple Silicon platform note is visible in the Settings MLX section.
8. No regressions in Ollama, llama.cpp, Anthropic, or DeepSeek providers.

---

*Spec created: 2026-06-04 · Area: local model providers · Target: Phase B / beta*
