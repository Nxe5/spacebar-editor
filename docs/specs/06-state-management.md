# State Management

> **Status:** ✅ **COMPLETE**

---

## Store Overview

| Store | Location | Persistence | Status |
|-------|----------|-------------|--------|
| `settings` | `src/lib/stores/settings.ts` | `localStorage` (v4) | ✅ |
| `files` | `src/lib/stores/files.ts` | Runtime only | ✅ |
| `chat` | `src/lib/stores/chat.ts` | `.sidebar/state.json` | ✅ |
| `workbench` | `src/lib/stores/workbench.ts` | `localStorage` + per-project | ✅ |
| `toolPolicy` | `src/lib/stores/toolPolicy.ts` | `localStorage` (v2) | ✅ |
| `currentMode` | `src/lib/stores/mode.ts` | Runtime only | ✅ |
| `iconTheme` | `src/lib/stores/iconTheme.ts` | `localStorage` (v2) | ✅ |
| `providerUsage` | `src/lib/stores/providerUsage.ts` | `localStorage` (v1) | ✅ |
| `syntaxTheme` | `src/lib/stores/syntaxTheme.ts` | `localStorage` | ✅ |
| `systemPrompt` | `src/lib/stores/systemPrompt.ts` | `.sidebar/prompt.md` | ✅ |

---

## Settings Store (`sidebar.settings.v4`)

| Field | Type | Description | Status |
|-------|------|-------------|--------|
| `apiKeys.anthropic`, `apiKeys.deepseek`, `apiKeys.glm`, `apiKeys.kimi`, `apiKeys.openai` | `string` | Cloud API keys (OpenAI reserved) | ✅ |
| `chatBackend` | `"anthropic"` \| `"deepseek"` \| `"glm"` \| `"kimi"` \| `"ollama"` \| `"llamacpp"` | Active backend | ✅ |
| `ollamaEndpoint`, `llamacppEndpoint`, `llamacppApiKey` | `string` | Local server URLs/key | ✅ |
| `selectedModel`, `ollamaModels`, `llamacppModels`, `anthropicModels`, `deepseekModels`, `glmModels`, `kimiModels` | `string`, `ModelConfig[]` | Active + discovered | ✅ |
| `providerModelDefaults` | `ProviderModelDefaultsMap` | Per-provider defaults for context window, tool call format, verbosity | ✅ |
| `anthropicExtendedThinking` | `boolean` | Claude extended thinking | ✅ |
| `anthropicContextBudget` | `number | null` | Optional cap | ✅ |
| `workbenchTheme` | `WorkbenchThemeId` | Theme id | ✅ |
| `webFetchAllowedHosts` | `string[]` | Hostname allowlist | ✅ |
| `agentLimits` | `AgentLimits` | `maxAgentSteps`, `maxToolCallsPerRun`, `maxToolsPerTurn` | ✅ |
| `ollamaServerTemplate`, `llamacppServerTemplate` | `*ServerTemplate` | Server config templates | ✅ |

---

## Files Store

| Field | Type | Description | Status |
|-------|------|-------------|--------|
| `tree` | `FileEntry[]` | Explorer tree | ✅ |
| `openFiles` | `OpenFile[]` | Buffers: path, content, isDirty, language, diffBase | ✅ |
| `activeFilePath` | `string | null` | Canonical path | ✅ |
| `workspacePath` | `string | null` | Project root | ✅ |

Paths normalized via `normalizeFilePath` (`src/lib/fsPath.ts`).

---

## Workbench Store (`sidebar.workbench.v1`)

- Editor / terminal / preview tabs
- Editor tab ids: `editor:<path>`
- Persisted **globally** in localStorage (terminal/preview not in per-project state)

---

## Chat Store

| Field | Description | Status |
|-------|-------------|--------|
| `sessions` | Open chat tabs | ✅ |
| `history` | Closed session history (max 80) | ✅ |
| `activeSessionId` | Current session | ✅ |
| `isStreaming` | Streaming flag | ✅ |
| `currentToolCall` | In-progress tool card | ✅ |

---

## Tool Policy Store (`sidebar.toolPolicy.v2`)

- Global rules + merge with `.sidebar/tools.json` via `effectiveToolPolicy`
- Settings UI edits global policy; project file on disk

---

## Provider Usage Store (`sidebar.providerUsage.v1`)

Monthly input/output token totals per provider id (from API `usage` on responses). Used in cloud provider chat footers (Anthropic, DeepSeek, GLM, Kimi).

---

## Project State (`.sidebar/state.json`)

Managed by `src/lib/projectState.ts`:

| Field | Description | Status |
|-------|-------------|--------|
| `sessions` | Chat sessions | ✅ |
| `history` | Chat history | ✅ |
| `activeSessionId` | Active chat tab | ✅ |
| `tabs` | Editor tab list | ✅ |
| `activeTabId` | Active editor tab | ✅ |

Hydrated on folder open; saved on switch and debounced on changes.
