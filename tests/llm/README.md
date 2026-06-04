# LLM Eval Harness

Long-running eval suite that exercises **Chat**, **Plan**, and **Agent** modes against a real Ollama model. Runs outside the Tauri desktop shell via `tsx`.

**Spec:** [docs/specs/31-llm-eval-harness.md](../../docs/specs/31-llm-eval-harness.md)

## Prerequisites

- Ollama running locally (`http://localhost:11434`)
- Target model pulled (default: `qwen3.6-27B-GGUF:UD-Q2_K_XL`)
- `rg` (ripgrep) on PATH for grep tests (falls back to Node scan if missing)

## Commands

```bash
# Full run (45–90 min on large models)
pnpm eval

# Gemma 4 12B profile (long timeouts, text_fallback)
pnpm eval:gemma-smoke          # quick subset
pnpm eval:gemma               # full run with profile
pnpm eval:gemma-tools         # tool-calling suite only
pnpm eval:gemma-build         # landing pages & project builds (slow)
pnpm eval:gemma-landing       # single coffee-shop landing page test

# Single suite
pnpm eval -- --suite 08-agent-files

# Single test
pnpm eval -- --test agent-files-01

# Filter by mode or tag
pnpm eval -- --mode agent
pnpm eval -- --tag gemma

# View latest markdown report
pnpm eval:report
```

| `18-gemma-weakness-probe` | weakness |
| `19-gemma-project-build` | project-build (landing pages, static sites) |

### Suite 19 — project builds

Realistic “make a project” tasks with **artifact verification** (files on disk, HTML structure, CSS, cross-links). Expect **15–60+ min per test** on Gemma 12B.

```bash
pnpm eval:gemma-build          # all 6 build tests
pnpm eval:gemma-landing        # coffee shop landing only
pnpm eval:gemma -- --test build-landing-02
```

See [profiles/README.md](./profiles/README.md) for Gemma 12B setup and interpreting `analysis.md`.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `EVAL_PROFILE` | — | Model profile: `gemma-12b` (timeouts, settings, smoke list) |
| `EVAL_MODEL` | profile or `qwen3.6-27B-GGUF:UD-Q2_K_XL` | Ollama model name |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama base URL |
| `EVAL_FORCE_RESET` | — | Set to `1` to reset dirty fixtures |

## Architecture

| Layer | Implementation |
|-------|----------------|
| Provider | `streamOneTurn` → Ollama via `openaiCompat` (same path as the app) |
| Agent loop | Simplified harness loop in `run-test.ts` (text tool fallback for Ollama) |
| File tools | **Node** `eval-tool-runner.ts` — not Tauri/Rust (harness runs headless) |
| Results | Streamed to `tests/llm/results/<run-id>/` as each test completes |

## Results

Each run writes:

```
tests/llm/results/<run-id>/
  summary.json
  report.md
  analysis.json
  analysis.md
  suites/
    01-chat-basic.json
    ...
```

`results/` is gitignored. Review `report.md` for human-readable output; `analysis.md` for category scores and recommended settings. Edit suite JSON to add `humanScore` / `humanNotes`.

## Fixtures

Baseline files live in `fixtures/baseline/` (committed). Each run copies them into `fixtures/workspace/` (gitignored) and resets agent-created files.
