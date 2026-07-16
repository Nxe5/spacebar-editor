# AI Agent System

> **Status:** ✅ **COMPLETE** — Implemented entirely in the **Svelte webview** + **Rust IPC** (no Node sidecar).

---

## Where the agent runs

| Component | Location | Status |
|-----------|----------|--------|
| `runAgentLoop()` | `src/modules/agent/ChatPane.svelte` | ✅ |
| `streamOneTurn()` | `src/lib/agent/streamTurn.ts` | ✅ |
| Provider HTTP | `src/lib/providers/anthropic.ts`, `openaiCompat.ts`, `deepseek.ts`, `glm.ts`, `kimi.ts` (`fetch` in webview) | ✅ |
| Tool execution | `src/lib/tools/toolRunner.ts` → Tauri `invoke` | ✅ |
| Node sidecar / harness | — | ❌ Not used (removed) |

Ollama and llama.cpp receive **tools in the chat completion request** when the model supports OpenAI-style `tool_calls` (same path as Anthropic tool streaming, via `openaiCompat.ts`).

---

## Agent Flow

1. User sends message → appended to session
2. `buildProviderMessages()` + `buildSystemPrompt()` (mode + workspace + custom prompt)
3. `runAgentLoop()` in ChatPane:
   - For each **step** (up to `settings.agentLimits.maxAgentSteps` or unlimited):
     - `streamOneTurn()` → text + optional tool calls
     - If no tools → done
     - `executeToolCallsWithApproval()` → policy gates → `executeTool()` → IPC
     - Append tool results; continue
   - Stop if **max tool calls per run** exceeded
4. `filesystemSync` + `bumpGitRefresh()` after mutating tools

---

## Chat Modes

| Mode | Tools | Behavior | Status |
|------|-------|----------|--------|
| **Chat** | None (`[]`) | Pure conversation, no file access | ✅ |
| **Plan** | Read-only tools | Analysis without writes; plans live in chat only | ✅ (see [19-planning-system.md](19-planning-system.md) for file-backed plans) |
| **Agent** | All 17 built-in tools | Full read/write/exec | ✅ |

Final tool list = **mode tools ∩ effective policy** (denied/removed tools excluded from schema sent to model).

---

## Providers

| Backend | Client | Streaming | Status |
|---------|--------|-----------|--------|
| `anthropic` | `src/lib/providers/anthropic.ts` | SSE | ✅ |
| `deepseek` | `src/lib/providers/deepseek.ts` → `openaiCompat.ts` | SSE | ✅ |
| `glm` | `src/lib/providers/glm.ts` → `openaiCompat.ts` | SSE | ✅ |
| `kimi` | `src/lib/providers/kimi.ts` → `openaiCompat.ts` | SSE | ✅ |
| `ollama`, `llamacpp` | `src/lib/providers/openaiCompat.ts` | SSE | ✅ |

Cloud model catalogs are fetched via `src/lib/cloudModelCatalog.ts` (with static fallbacks when offline).

---

## Chat Footer Profiles

Defined in `src/lib/chatFooterProfile.ts`:

| Backend | Stream Metrics | Context Budget UI | Monthly Usage | Status |
|---------|----------------|-------------------|---------------|--------|
| Ollama | Yes | Editable menu | No | ✅ |
| llama.cpp | Yes | Read-only (`· server`) | No | ✅ |
| Anthropic | Yes | Read-only estimate | Yes (`providerUsage` store) | ✅ |
| DeepSeek | Yes | Read-only estimate | Yes | ✅ |
| GLM | Yes | Read-only estimate | Yes | ✅ |
| Kimi | Yes | Read-only estimate | Yes | ✅ |

In `ChatPane.svelte`'s `.context-footer`, the monthly-usage label and stream-metrics label render together in a single left-aligned row (`.context-meta-start`, with a `·` separator when both are present) directly above the segmented context bar; the editable/read-only budget row (`~used / max tok` + compact button) stays below the bar.

---

## Tool Approval

| Policy | Behavior | Status |
|--------|----------|--------|
| `allow` | Execute immediately | ✅ |
| `ask` | Show approval UI; Allow / Allow always / Deny | ✅ |
| `deny` | Skip execution; return policy error | ✅ |

When policy is `ask`, UI above composer blocks until user responds. Sequential execution within a turn.

---

## Agent Limits

| Setting | Default | Description | Status |
|---------|---------|-------------|--------|
| `maxAgentSteps` | 0 (unlimited) | LLM ↔ tool round trips per user message | ✅ |
| `maxToolCallsPerRun` | 0 (unlimited) | Total tool executions per message | ✅ |
| `maxToolsPerTurn` | 0 (unlimited) | Tool calls per model response | ✅ |

Bounds: steps 0-200, calls 0-500, per-turn 0-50.

---

## Streaming Layer

`src/lib/agent/streamTurn.ts` — **`streamOneTurn()`**:

- Single abstraction over Anthropic vs OpenAI-compatible backends
- Consumes unified `StreamEvent` stream:
  - `delta` — text chunk
  - `tool_call` — completed tool call `{ id, name, arguments }`
  - `done` — optional token usage
  - `error` — throws
- Returns `{ content, toolCalls, usage? }`

---

## Activity Feed (Agent Turns)

> **Status:** ✅ Complete (display-only)

`src/lib/agent/activity.ts` groups messages into `AgentTurnBlock` with optional `planText` — assistant content **before** the final reply in a tool turn. Rendered in `AgentActivityFeed.svelte` as a collapsible “Plan” row.

This is **not** a project plan document. See [19-planning-system.md](19-planning-system.md).

---

## Known Limitations & Roadmap

| Feature | Status | Notes |
|---------|--------|-------|
| Persistent `plans/` folder | ❌ Not started | [19-planning-system.md](19-planning-system.md) |
| Parallel read-only tools | ✅ Complete | [38-parallel-tool-execution.md](38-parallel-tool-execution.md) |
| Context overflow warnings | ✅ Complete | [34-context-overflow-warnings.md](34-context-overflow-warnings.md) |
| Agent error recovery | ✅ Complete | [32-agent-error-recovery.md](32-agent-error-recovery.md) |
| Context compaction | ✅ Complete | [21-context-compaction.md](21-context-compaction.md) — enabled by default at 85% |
| Agent activity step grouping | ❌ Not started | [40-product-hardening-and-agent-ux.md](40-product-hardening-and-agent-ux.md) §5 — v0.1.3 |
| Attachment chip click-to-open | ✅ Complete | [43-v-next-release-fixes.md](43-v-next-release-fixes.md) §3 |
