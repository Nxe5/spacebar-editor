# Testing

> **Status:** ✅ **COMPLETE**

Tests target the **current webview + Rust** stack. There are **no** sidecar or harness integration tests (that process no longer exists).

---

## Test Framework

| Aspect | Detail | Status |
|--------|--------|--------|
| Runner | **Vitest** | ✅ |
| Location | `tests/unit/` | ✅ |
| Config | `vitest.config.ts` | ✅ |

---

## Commands

```bash
pnpm test                   # Run all unit tests
pnpm test:ollama            # Optional live Ollama integration
pnpm eval                   # Long-running LLM eval harness (requires Ollama)
pnpm eval:report            # Open latest eval report
```

For Ollama tests, set `RUN_OLLAMA_TESTS=1` environment variable.

---

## Test Suites

### Core Functionality

| Suite | File | Status |
|-------|------|--------|
| Tool Runner | `toolRunner.test.ts` | ✅ |
| Tool Policy | `toolPolicy.test.ts` | ✅ |
| Tool Definitions | `toolDefinitions.test.ts` | ✅ |
| Path Utils | `pathUtils.test.ts` | ✅ |
| Agent Limits | `agentLimits.test.ts` | ✅ |
| Context Budget | `contextBudget.test.ts` | ✅ |

### State Management

| Suite | File | Status |
|-------|------|--------|
| Files Store | `filesStore.test.ts` | ✅ |
| Project State | `projectState.test.ts` | ✅ |
| Project Tools | `projectTools.test.ts` | ✅ |
| Workspace | `workspace.test.ts` | ✅ |
| Workbench Editor | `workbenchEditor.test.ts` | ✅ |

### AI / Providers

| Suite | File | Status |
|-------|------|--------|
| Anthropic Provider | `providers/anthropic.test.ts` | ✅ |
| OpenAI Compat | `providers/openaiCompat.test.ts` | ✅ |
| GLM Provider | `providers/glm.test.ts` | ✅ |
| Kimi Provider | `providers/kimi.test.ts` | ✅ |
| Conversation | `conversation.test.ts` | ✅ |
| Chat Context | `chatContext.test.ts` | ✅ |
| Chat Footer Profile | `chatFooterProfile.test.ts` | ✅ |
| Provider Usage | `providerUsage.test.ts` | ✅ |
| Provider Health | `providerHealth.test.ts` | ✅ |
| Provider Server Config | `providerServerConfig.test.ts` | ✅ |
| llama.cpp Client | `llamaCppClient.test.ts` | ✅ |

### Agent Features

| Suite | File | Status |
|-------|------|--------|
| Activity | `activity.test.ts` | ✅ |
| Agent Synthesis | `agentSynthesis.test.ts` | ✅ |
| Chat Rewind | `chatRewind.test.ts` | ✅ |
| Streaming Status | `streamingStatusWord.test.ts` | ✅ |
| Text Tool Calls | `textToolCalls.test.ts` | ✅ |
| Tool Display | `toolDisplay.test.ts` | ✅ |
| Workspace Context | `workspaceContext.test.ts` | ✅ |

### UI / Appearance

| Suite | File | Status |
|-------|------|--------|
| Chat Appearance | `chatAppearance.test.ts` | ✅ |
| Workbench Theme | `workbenchTheme.test.ts` | ✅ |
| Syntax Colors | `syntaxColors.test.ts` | ✅ |
| Diff Decorations | `diffDecorations.test.ts` | ✅ |
| Mode | `mode.test.ts` | ✅ |

### Icons

| Suite | File | Status |
|-------|------|--------|
| Icon Theme | `iconTheme.test.ts` | ✅ |
| Icon Resolve | `iconResolve.test.ts` | ✅ |
| Resolve Seti | `resolveSeti.test.ts` | ✅ |
| Seti Language | `setiLanguage.test.ts` | ✅ |

### Git

| Suite | File | Status |
|-------|------|--------|
| Git Format | `gitFormat.test.ts` | ✅ |
| Tree Git Decorations | `treeGitDecorations.test.ts` | ✅ |

### Utilities

| Suite | File | Status |
|-------|------|--------|
| Filesystem Sync | `filesystemSync.test.ts` | ✅ |
| Middle Click Scroll | `middleClickScroll.test.ts` | ✅ |
| Ollama Library | `ollamaLibrary.test.ts` | ✅ |

### Integration

| Suite | File | Status |
|-------|------|--------|
| Ollama Integration | `integration/ollama.test.ts` | ✅ (optional) — calls Ollama HTTP **directly** (same as `openaiCompat.ts`), not via sidecar |
| LLM Eval Harness | `tests/llm/` | 🔶 — long-running Chat/Plan/Agent eval vs Ollama; see [31-llm-eval-harness.md](31-llm-eval-harness.md) |

### What we do not test

| Area | Reason |
|------|--------|
| Node sidecar / harness IPC | Removed from product |
| Tauri E2E (full window) | Heavy; unit + optional Ollama HTTP first |

---

## Test Patterns

### Mocking

- Provider tests mock `fetch` for HTTP calls
- Tool runner tests mock Tauri IPC
- Store tests use isolated store instances

### Assertions

- Use Vitest's `expect` API
- Snapshot testing for complex outputs
- Type assertions via TypeScript

---

## Coverage

Run with coverage:

```bash
pnpm test -- --coverage
```

---

## Adding Tests

1. Create test file in `tests/unit/`
2. Import module to test
3. Write describe/test blocks
4. Mock external dependencies
5. Run `pnpm test` to verify
