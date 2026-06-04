# Gemma 4 12B Eval Profile

Profile ID: `gemma-12b`  
Default model: `hf.co/unsloth/gemma-4-12b-it-GGUF:Q8_0`

## Quick start

```bash
# Smoke run (~6 tests, still slow on 12B — expect 15–45 min)
pnpm eval:gemma-smoke

# Gemma-focused suites only
pnpm eval:gemma -- --tag gemma

# Full profile (all 18 suites — plan for hours)
pnpm eval:gemma

# Single probe
EVAL_PROFILE=gemma-12b pnpm eval -- --test gemma-tool-01
```

## What gets measured

| Output | Purpose |
|--------|---------|
| `results/<run-id>/report.md` | Per-test responses, tool traces, timings |
| `results/<run-id>/analysis.md` | Category pass rates, model vs app recommendations |
| `results/<run-id>/analysis.json` | Machine-readable scores |

### Suite groups for Gemma

| Suite | Focus |
|-------|--------|
| `16-gemma-tool-calling` | Text fallback JSON, correct tool names, no hallucinated results |
| `17-gemma-local-project` | Multi-file reads/writes, grep, mini codebase changes |
| `18-gemma-weakness-probe` | Plan mode, shell, anti-hallucination, reasoning |
| `01–15` (optional full run) | Baseline comparison with other models |

## Recommended Sidebar settings

Apply in **Settings → Provider defaults (Ollama)** and per-model overrides:

| Setting | Value | Why |
|---------|-------|-----|
| Tool format | **Text fallback** | Ollama lists completion+vision only — no native `tool_calls` |
| Prompt verbosity | **Detailed** | Shows JSON tool-call example |
| Parallel tool calls | **Off** | 12B struggles with multi-tool turns |
| Context window | **32768** | Balance speed vs large-project context |
| Agent mode | **On** | Chat/plan lack write tools for implementation |

### If tool calls still fail

1. Confirm model row uses **Text fallback** (not Native).
2. Check Activity panel for raw assistant text — recovery parses `<|tool_call>` and ```json blocks.
3. Alias recovery maps `grep_file_content` → `grep`, etc. (see `textToolCalls.ts`).
4. Use **Detailed** verbosity so the system prompt includes a JSON example.

### Parameters not in UI yet (future)

These would help weaker local models if exposed in Settings:

- `temperature` (lower ≈ 0.2–0.4 for tool reliability)
- `top_p` / `repeat_penalty`
- Per-model `maxAgentSteps` default
- `num_ctx` tied to context window slider

## Project build eval (suite 19)

Tests end-to-end project creation — the closest match to “build me a landing page” in Sidebar:

| Test | Task |
|------|------|
| `build-landing-01` | Coffee shop landing (`index.html` + `styles.css`) |
| `build-landing-02` | Responsive SaaS page with `@media` query |
| `build-static-03` | Two-page portfolio with shared CSS |
| `build-extend-04` | Extend existing HTML stub with pricing |
| `build-readme-05` | README scaffold for a CLI tool |
| `build-landing-plan-06` | Plan-only (no HTML) for a bakery landing |

Pass/fail uses **artifact checks** (doctype, semantic sections, linked CSS, nav links, etc.) scored 0–100%. Review generated files under `tests/llm/fixtures/workspace/build/` after a run.

```bash
pnpm eval:gemma-landing    # ~15–45 min
pnpm eval:gemma-build      # hours — run overnight
```

## Interpreting results

**Model weakness** (lower model / quant / training):

- Low pass on `chat` / `code` without tools
- Correct tool *calls* but wrong file content or logic
- Repeated wrong tool names despite aliases

**App improvement** (Sidebar tuning):

- Timeouts → increase timeouts or reduce steps
- High `textToolRecoveries` with passes → text fallback working; keep Detailed on
- Tool calls never parsed → missing tool instructions (fixed in harness via `assembleSystemPrompt`)
- `toolSuccessRate` low with valid names → check eval fixture paths / Tauri vs Node runner in desktop

## Hardware expectations

Q8_0 12B on consumer GPU/CPU:

- First token: 30s–3min
- Agent step: 1–5min
- Smoke run: 15–45min
- Full `pnpm eval:gemma`: several hours

Run overnight for full suites. Partial results are saved after each test.
