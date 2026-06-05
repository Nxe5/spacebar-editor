# Spec 31 — LLM Eval Harness (`tests/llm/`)

> **Status:** 🔶 Phase 1 — scaffolding + all suites implemented  
> **Area:** Testing · Agent Loop · Provider Layer  
> **Phase:** A — Dogfooding  
> **Depends on:** [08-ai-agent.md](08-ai-agent.md), [09-tool-system.md](09-tool-system.md), [03-architecture.md](03-architecture.md)

> **Note:** Originally drafted as “Spec 22”; number **31** is used because [22-llm-file-interaction.md](22-llm-file-interaction.md) already exists.

---

## 1. Overview

The LLM eval harness is a comprehensive, long-running test suite that exercises Spacebar Editor's three operating modes — **Chat**, **Plan**, and **Agent** — against a real Ollama model. It runs outside the Tauri desktop shell, talking to Ollama through Spacebar Editor's existing provider layer (`streamOneTurn` → `openaiCompat`), and writes structured results to `tests/llm/results/` for post-run review.

The harness is designed for slow, generous timeouts. A full run against `qwen3.6-27B-GGUF:UD-Q2_K_XL` may take 30–90 minutes. Results are streamed to disk as each test completes so partial runs are always reviewable.

### Goals

- Exercise all three modes (Chat, Plan, Agent) with realistic prompts
- Test file operations, code generation, multi-turn conversations, and tool use
- Run each prompt class multiple times to surface non-determinism
- Produce human-readable markdown reports and machine-readable JSON
- Use Spacebar Editor's actual provider layer — not a raw Ollama-only client — so results reflect real streaming behavior
- Support re-running individual test suites or single tests without a full run

### Non-Goals

- CI/CD integration (long runtimes make this impractical)
- Automated pass/fail scoring (LLM output requires human judgment; harness records objective signals only)
- A/B model comparison in v1
- UI-based test runner
- Load or concurrency testing

---

## 2. File Layout

```
tests/llm/
  README.md
  harness.ts
  config.ts
  types.ts
  run-test.ts
  suite-runner.ts
  results-writer.ts
  eval-tool-runner.ts          # Node fs adapter (headless — not Tauri/Rust)
  fixtures.ts
  fixtures/workspace/
  suites/01-chat-basic.ts … 15-stress-repetition.ts
  scripts/open-latest-report.ts
  results/                     # gitignored
```

---

## 3. Configuration

See `tests/llm/config.ts`. Key defaults:

| Setting | Value |
|---------|-------|
| Model | `qwen3.6-27B-GGUF:UD-Q2_K_XL` |
| Ollama URL | `http://localhost:11434` |
| First token timeout | 120s |
| Full response timeout | 600s |
| Agent run timeout | 900s |
| Max agent steps | 10 |

Override via `EVAL_MODEL`, `OLLAMA_HOST`.

---

## 4. Architecture

### Provider integration

Uses `streamOneTurn` with `backend: "ollama"` — same code path as `ChatPane.svelte`, including text tool-call recovery for Ollama's `text_fallback` format.

### Agent loop

Simplified harness loop in `run-test.ts` (not the full Svelte agent loop). Handles multi-step tool rounds, step cap, and tool recording.

### File tools — Node, not Rust

The harness runs headless without Tauri. Tool execution goes through `eval-tool-runner.ts`:

- Node `fs/promises` for read/write/list/tree
- Host `git` / `rg` / `bash` for git, grep, shell
- Reuses `pathUtils`, `gitFormat`, `textEscapes` from the app

Production agent mode still uses Tauri → Rust (`filesystem.rs`). Eval results for file tools may differ slightly from desktop behavior; provider and tool-call parsing paths match production.

### Plan mode

Plan tests use plan-mode prompts plus `write_file` / `create_file` restricted to `plans/` (ahead of full [19-planning-system.md](19-planning-system.md) implementation in the app).

---

## 5. Test suites

| Suite | Mode | Tests |
|-------|------|-------|
| 01-chat-basic | chat | 8 |
| 02-chat-reasoning | chat | 6 |
| 03-chat-multiturn | chat | 4 |
| 04-chat-code | chat | 10 |
| 05-plan-create | plan | 5 |
| 06-plan-update | plan | 4 |
| 07-plan-multiturn | plan | 2 |
| 08-agent-files | agent | 8 |
| 09-agent-code | agent | 6 |
| 10-agent-fix | agent | 4 |
| 11-agent-multistep | agent | 5 |
| 12-agent-git | agent | 4 |
| 13-agent-search | agent | 4 |
| 14-agent-shell | agent | 4 |
| 15-stress-repetition | mixed | 5 (×5 each) |

Full prompt tables: see suite files under `tests/llm/suites/`.

---

## 6. Pass / fail criteria

| Status | Condition |
|--------|-----------|
| `pass` | Response before timeout, no runtime error, non-empty response |
| `fail` | Empty response, provider error, expected tools not called, plan file missing |
| `timeout` | Exceeded `fullResponse` or `agentRun` |
| `error` | Harness-level error |

Human review fields (`humanScore`, `humanNotes`) are left blank for manual scoring in JSON.

---

## 7. Running

```bash
pnpm eval
pnpm eval -- --suite 08-agent-files
pnpm eval -- --test agent-files-01
pnpm eval -- --mode agent
pnpm eval:report
```

---

## 8. Implementation status

| Phase | Status |
|-------|--------|
| Scaffolding (config, harness, results writer, fixtures) | ✅ |
| Chat suites 01–04 | ✅ |
| Plan suites 05–07 | ✅ |
| Agent suites 08–14 | ✅ |
| Stress suite 15 + CLI filters | ✅ |
| README + spec | ✅ |

---

## 9. Edge cases

| Scenario | Handling |
|----------|----------|
| Ollama not running | Fail fast with clear message |
| Model not pulled | Fail fast with `ollama pull` hint |
| Partial run (Ctrl+C) | Incremental suite JSON remains valid |
| Dirty fixtures | Warn; `EVAL_FORCE_RESET=1` to reset |
| Parallel runs | Timestamped run IDs |

---

*Spec created: 2026-05-29 · Implemented: 2026-05-30*
