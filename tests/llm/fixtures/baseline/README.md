# Eval Fixture Workspace

Small TypeScript project used by the LLM eval harness. Reset from `tests/llm/fixtures/baseline/` before each run.

## Layout

- `sample.ts` — utility functions with exports
- `sample.json` — config fixture
- `buggy.ts` — intentionally broken code for fix tests
- `lib/helpers.ts` — imports Node `fs` for grep tests
- `src/` — mini app structure for local-project evals
