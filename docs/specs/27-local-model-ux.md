# Spec 27 — Local Model UX

> **Status:** 🔶 **Partially superseded** — §2–3 (capability flags & prompt variants) replaced by [30](30-agent-context-and-model-settings.md); **§4 Ollama model-pull UI remains current**
> **Area:** Agent Prompts · Providers · Settings · Ollama Integration
> **Phase:** §4 Ollama pull UI: Phase 1 (Phase B) · §2–3 prompt/capability work: Final, folded into [30](30-agent-context-and-model-settings.md) (implement LAST)
> **Depends on:** [08-ai-agent.md](08-ai-agent.md) (prompts) · [09-tool-system.md](09-tool-system.md) (tool instructions) · [22-llm-file-interaction.md](22-llm-file-interaction.md) (stall/parse handling) · [21-context-compaction.md](21-context-compaction.md) (context window)

> **Related:** `extension.md` §8 · `src/lib/ollamaClient.ts` · `src/lib/ollamaLibrary.ts` · `src/lib/providers/` · `src/lib/agent/` (TOOL_USE_INSTRUCTION)

---

## ⚠️ Partially superseded — read [Spec 30](30-agent-context-and-model-settings.md)

[30-agent-context-and-model-settings.md](30-agent-context-and-model-settings.md) revises how local-model adaptivity works:

| This spec (27) | Replaced by spec 30 |
|----------------|---------------------|
| **§3 auto-inferred `ModelCapabilities`** (name heuristics: `*:1b` → `weakReasoning`) | **User-owned per-model settings**, no silent auto-inference ([30](30-agent-context-and-model-settings.md) §1.1, §3) |
| Flags `nativeFunctionCalling` / `weakReasoning` / `supportsThinking` | `toolCallFormat` / `parallelToolCalls` / `promptVerbosity` ([30](30-agent-context-and-model-settings.md) §3.4) |
| **§2.2 prompt-variant matrix** keyed on capability flags | Verbosity driven by `promptVerbosity`; pacing driven by `parallelToolCalls` ([30](30-agent-context-and-model-settings.md) §7.3) |

**Still current in this spec:** **§4 — Ollama model-pull UI** (search, streaming pull progress, delete, "Recommended for agent use" badge) is **not** superseded by [30](30-agent-context-and-model-settings.md) and remains the canonical spec for that feature. It can ship in Phase 1 independently of the prompt/capability rework.

The §2–3 prompt/capability material is part of the "implement LAST / discuss first" group — see [30](30-agent-context-and-model-settings.md)'s discussion note.

---

## 1. Overview

Local models in the 7B–14B range are the product's core audience but the weakest link in agent quality. Spacebar Editor cannot win on raw model intelligence; it must win on **how well it drives weaker models**. This spec covers three improvements:

1. **Enhanced tool-use instructions** tuned for weak models (worked examples, explicit one-tool-at-a-time guidance).
2. **Model capability flags** that adapt prompting and behavior per model.
3. **Ollama model-pull UI** with streaming progress and agent-suitability recommendations.

These complement the robustness fixes in [22-llm-file-interaction.md](22-llm-file-interaction.md) (stall detection, malformed-JSON handling).

### Goals

- Weak models receive concrete, example-driven tool-call instructions.
- A `ModelCapabilities` record drives adaptive prompting and feature gating.
- Users can browse, pull (with progress), and delete Ollama models in-app.
- Known agent-capable models are surfaced with a recommendation badge.

### Non-Goals

- Fine-tuning or model training.
- Auto-selecting a model for the user (recommend, don't force).
- A model marketplace beyond Ollama's library (curated list is enough in v1).
- Capability auto-probing via test prompts (use name heuristics + manual override).

---

## 2. Enhanced Tool-Use Instruction

`TOOL_USE_INSTRUCTION` (in `src/lib/agent/`) is terse. Weak models need more scaffolding.

### 2.1 Spec

The enhanced instruction must:

- Include **one concrete worked example** of a valid tool call in the exact format the text fallback parser ([22](22-llm-file-interaction.md) §5) expects.
- State explicitly: *"Call one tool at a time unless you are certain the calls are fully independent."*
- Add: *"After receiving a tool result, read it carefully before calling another tool. Do not repeat a tool call with identical arguments."* (reinforces stall avoidance — [22](22-llm-file-interaction.md) §6).
- For models flagged `weakReasoning` or `nativeFunctionCalling: false` (§3), inject a **more detailed** format example and stricter pacing guidance.

### 2.2 Variant selection

| Model flags | Instruction variant |
|-------------|---------------------|
| `nativeFunctionCalling: true` | Concise (provider handles format) |
| `nativeFunctionCalling: false` | Verbose + fallback-format worked example |
| `weakReasoning: true` | Verbose + one-tool-at-a-time emphasis + read-result reminder |

### 2.3 Files to change

| File | Change |
|------|--------|
| `src/lib/agent/` (prompts module) | Variants of `TOOL_USE_INSTRUCTION` |
| `src/modules/agent/ChatPane.svelte` | Select variant from active model capabilities |

---

## 3. Model Capability Flags

### 3.1 Type

Introduce in `src/lib/providers/`:

```typescript
interface ModelCapabilities {
  nativeFunctionCalling: boolean;  // provider/model supports tool_use natively
  contextWindow: number;           // tokens (may be auto-detected — spec 21 §7)
  supportsThinking: boolean;       // Anthropic extended thinking
  weakReasoning: boolean;          // triggers verbose prompting + tighter limits
}
```

### 3.2 Resolution

| Source | Behavior |
|--------|----------|
| Anthropic / DeepSeek | `nativeFunctionCalling: true`, `supportsThinking` per model |
| Ollama / llama.cpp | Default `nativeFunctionCalling` by model family; many small models `false` |
| Name heuristics | `phi3:mini`, `tinyllama`, `*:1b`, `*:3b` → `weakReasoning: true` |
| Manual override | Settings per-model toggles win over heuristics |

Persist capability overrides alongside the model entry in settings (additive, no migration).

### 3.3 Effects

- Prompt variant selection (§2.2).
- `weakReasoning` may tighten default `agentLimits` (fewer tools per turn) and lower the stall threshold.
- `contextWindow` feeds the budget meter ([21](21-context-compaction.md) §7).

---

## 4. Ollama Model Pull UI

`ollamaClient.ts` has pull/delete helpers; `ollamaLibrary.ts` can supply a catalog. Add UI to **Settings → Ollama**.

### 4.1 Spec

- **Search box** querying the Ollama library (or a curated list).
- **One-click pull** with a streaming progress bar (Ollama `/api/pull` streams progress).
- **Delete** button with confirmation.
- **"Recommended for agent use"** badge on models known to handle tool calls well (e.g. Qwen2.5-Coder, Mistral-Nemo, Llama 3.1+).

### 4.2 Recommendation list

Maintain a small curated list in `ollamaLibrary.ts`:

```typescript
const AGENT_RECOMMENDED = new Set([
  "qwen2.5-coder", "mistral-nemo", "llama3.1", "llama3.2", "deepseek-coder-v2",
]);
```

Matching is by model-name prefix. The badge is advisory, not a filter.

### 4.3 Files to change

| File | Change |
|------|--------|
| `src/lib/ollamaLibrary.ts` | Curated catalog + `AGENT_RECOMMENDED` |
| `src/lib/ollamaClient.ts` | Surface streaming pull progress to UI |
| `src/modules/settings/SettingsPane.svelte` | Pull/search/delete UI + progress bar |

---

## 5. Implementation Plan

### Phase 1 — Capability flags + prompt variants

- [ ] `ModelCapabilities` type + resolver (name heuristics + provider defaults)
- [ ] Per-model capability overrides in settings
- [ ] `TOOL_USE_INSTRUCTION` variants; select by capabilities
- [ ] `weakReasoning` tightens agent limits / stall threshold

**Deliverable:** Prompting adapts to model strength.

### Phase 2 — Ollama pull UI

- [ ] Curated catalog + recommendation set in `ollamaLibrary.ts`
- [ ] Streaming pull progress from `ollamaClient.ts`
- [ ] Settings UI: search, pull (progress bar), delete (confirm), recommended badge

**Deliverable:** In-app model management for Ollama.

---

## 6. Edge Cases & Failure Modes

| Scenario | Handling |
|----------|----------|
| Ollama server unreachable during pull | Error toast; partial pull resumable on retry |
| Unknown model name heuristic | Default `weakReasoning: false`; rely on manual override |
| Pull of a very large model | Progress bar + size estimate; allow cancel |
| Delete the currently selected model | Confirm + clear selection; fall back to another enabled model |
| Capability override conflicts with provider reality | User override wins; document the risk |
| Model claims native tool calls but fails | Stall/parse handling ([22](22)) still catches it |

---

## 7. Open Questions

| Question | Recommendation |
|----------|----------------|
| Curated list vs live Ollama library API? | Curated list in v1 (stable, offline-friendly); live API optional later. |
| Auto-probe capabilities with a test prompt? | No — slow and unreliable; heuristics + manual override. |
| Should `weakReasoning` auto-enable compaction? | No — recommend in UI; respect user's opt-in ([21](21)). |
| Badge criteria source? | Hand-curated; revisit as local tool-calling improves. |

---

## 8. Acceptance Criteria

1. Selecting a `phi3:mini`-class model auto-flags `weakReasoning` and uses the verbose tool instruction.
2. A model without native function calling receives a fallback-format worked example in its prompt.
3. Users can search, pull (with live progress), and delete Ollama models from Settings.
4. Agent-capable models show a "Recommended for agent use" badge.
5. Per-model capability overrides persist and take precedence over heuristics.
6. `contextWindow` from capabilities feeds the context meter ([21](21-context-compaction.md)).

---

*Spec created: 2026-05-30 · Source: `extension.md` §8 · Target: Phase 1 (local-model quality)*
