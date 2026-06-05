# Spec 38 — Parallel Tool Execution

> **Status:** ✅ Implemented — parallel batch execution with Promise.all chunked by maxConcurrentTools; isReadOnlyTool classification; settings UI.
> **Area:** Agent Loop · Tool Execution · Settings
> **Phase:** B — Enhancement
> **Depends on:** [08-ai-agent.md](08-ai-agent.md) · [09-tool-system.md](09-tool-system.md) · [30-agent-context-and-model-settings.md](30-agent-context-and-model-settings.md)

---

## 1. Problem Statement

When a model emits multiple tool calls in a single turn (e.g. three `read_file` calls on independent files), Spacebar Editor currently executes them sequentially via `executeToolCallsWithApproval` in `ChatPane.svelte`. Sequential execution is safe but slow — each call waits for the previous one to complete before starting, even when there is no dependency between them.

For read-heavy agent runs (code review, multi-file analysis), parallelizing independent reads can cut tool execution time significantly.

---

## 2. Two Distinct Settings

This feature involves two separate settings that are easy to conflate:

| Setting | Location | Controls |
|---------|----------|---------|
| **Per-model `parallelToolCalls`** | Settings → Providers → [model] gear | Whether the model *emits* multiple tool calls in a single turn (Spec 30, §3.2) |
| **Global `parallelExecution`** + **`maxConcurrentTools`** | Settings → General → Tools | Whether the *runtime* executes those calls concurrently |

Both settings must be true (or effectively enabled) for actual parallel execution to occur:
- Model emits multiple calls per turn (`parallelToolCalls: true`)
- Runtime executes them concurrently (`parallelExecution: true`)

A user may want to keep `parallelToolCalls` enabled (so the model *can* emit multiple calls) but run them sequentially (safer, easier to debug). Both combinations are valid.

---

## 3. New Settings

### 3.1 `AgentLimits` Changes

Add two fields to `AgentLimits` in `src/lib/agentLimits.ts`:

```typescript
interface AgentLimits {
  maxAgentSteps: number          // existing
  maxToolCallsPerRun: number     // existing
  maxToolsPerTurn: number        // existing
  parallelExecution: boolean     // new — default: false
  maxConcurrentTools: number     // new — default: 4
}
```

Defaults:
- `parallelExecution: false` — off by default for safety; users opt in
- `maxConcurrentTools: 4` — range 1–16; 1 is effectively sequential (same as disabled)

### 3.2 Settings UI

In Settings → General, under a new "Tools" subsection:

```
┌─ Tools ──────────────────────────────────────────────────────┐
│                                                               │
│  Parallel tool execution                         [toggle]    │
│  Run independent tool calls concurrently.                    │
│  Read-only tools (read_file, grep, etc.) run in parallel.   │
│  Write tools always run sequentially.                        │
│                                                               │
│  Max concurrent tools                    [ 4  ↑↓ ]  (1–16)  │
│  Maximum tool calls to run at once.                          │
│  Ignored when parallel execution is off.                     │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

The `Max concurrent tools` field is disabled (grayed out) when `parallelExecution` is false.

---

## 4. Tool Classification

### 4.1 Read-Only Tools (safe to parallelize)

These tools have no side effects — they only read state:

| Tool | Reason safe |
|------|-------------|
| `read_file` | Read-only filesystem |
| `grep` | Read-only search |
| `get_file_tree` | Read-only |
| `list_dir` | Read-only |
| `get_git_log` | Read-only git |
| `get_git_diff` | Read-only git |
| `get_git_status` | Read-only git |
| `web_fetch` | Network read (no local writes) |

### 4.2 Write Tools (always sequential)

These tools modify state and must run sequentially to prevent race conditions:

| Tool | Reason sequential |
|------|------------------|
| `write_file` | Filesystem write |
| `create_file` | Filesystem write |
| `delete_file` | Filesystem mutation |
| `rename_file` | Filesystem mutation |
| `run_shell` | May have arbitrary side effects |
| `run_tests` | May modify state, ports, processes |
| `run_script` | May have arbitrary side effects |
| `git_stage` | Modifies git index |
| `git_unstage` | Modifies git index |
| `git_commit` | Modifies git history |
| `git_discard` | Modifies workspace files |

Write tools execute sequentially **regardless of the `parallelExecution` setting**. The setting only affects read-only tools.

---

## 5. Execution Model

### 5.1 Batching Strategy

When `parallelExecution` is true and a model turn produces multiple tool calls:

1. **Classify** each tool call as read-only or write
2. **Group** consecutive read-only calls into parallel batches; each write call is its own sequential batch
3. **Execute** in order:
   - Read-only batch: `Promise.all` up to `maxConcurrentTools` calls at once
   - Write tool: `await` single call
   - Next read-only batch: `Promise.all`, etc.

Example: model emits `[read_file, read_file, write_file, read_file]`

```
Batch 1 (parallel): [read_file, read_file]  → run concurrently
Batch 2 (write):    [write_file]            → await
Batch 3 (parallel): [read_file]             → runs alone (no benefit, still correct)
```

If `maxConcurrentTools` is 2 and the model emits 5 read calls: the first 2 run concurrently, then the next 2, then the last 1.

### 5.2 Chunking for maxConcurrentTools

```typescript
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

// Run a read-only batch:
const chunks = chunkArray(readOnlyBatch, maxConcurrentTools)
for (const chunk of chunks) {
  const results = await Promise.all(chunk.map(call => executeSingleTool(call)))
  // append results
}
```

### 5.3 Tool Approval in Parallel Batches

If any tool in a parallel batch requires user approval (policy = `ask`), the entire batch pauses. Approval is shown for all pending-approval tools at once in the existing approval UI. The user approves or denies them in aggregate (or individually, if the UI allows). Once all approvals are resolved, the batch continues.

Tools denied by policy are returned immediately as denial errors without pausing the batch.

**Approval UI change:** when multiple tools are pending approval simultaneously, the approval UI stacks them or shows them as a list rather than one-at-a-time. Detailed approval UI design is deferred to implementation; the key invariant is that no tool executes until its approval is granted.

### 5.4 Result Order

Tool results are appended to the message history **in the original tool call order** regardless of execution order. If `read_file B` finishes before `read_file A` (A started first), the results are still inserted as A, B in the history. This preserves deterministic history for the model regardless of execution timing.

---

## 6. Implementation

### 6.1 `executeToolCallsWithApproval` Rewrite

The current sequential loop in `ChatPane.svelte`:

```typescript
// Current (sequential)
for (const call of toolCalls) {
  const result = await executeOneTool(call)
  results.push(result)
}
```

Replacement (parallel-aware):

```typescript
async function executeToolCallsWithApproval(
  toolCalls: ToolCall[],
  limits: AgentLimits,
): Promise<ToolResult[]> {
  if (!limits.parallelExecution) {
    // Sequential path — unchanged behavior
    return executeSequentially(toolCalls)
  }

  const batches = buildExecutionBatches(toolCalls, limits.maxConcurrentTools)
  const results: ToolResult[] = new Array(toolCalls.length)

  for (const batch of batches) {
    if (batch.type === 'sequential') {
      // Write tool — await
      results[batch.index] = await executeSingleTool(batch.call)
    } else {
      // Read-only parallel chunk
      const chunkResults = await Promise.all(
        batch.calls.map(({ call, index }) =>
          executeSingleTool(call).then(result => ({ result, index }))
        )
      )
      for (const { result, index } of chunkResults) {
        results[index] = result
      }
    }
  }

  return results
}
```

### 6.2 Tool Classification

```typescript
import { READ_ONLY_TOOLS } from './tools/toolDefinitions'

export const READ_ONLY_TOOL_NAMES = new Set<string>(READ_ONLY_TOOLS)

export function isReadOnlyTool(toolName: string): boolean {
  return READ_ONLY_TOOL_NAMES.has(toolName)
}
```

### 6.3 `agentLimits.ts`

Add the two new fields with defaults:

```typescript
export const DEFAULT_AGENT_LIMITS: AgentLimits = {
  maxAgentSteps: 0,
  maxToolCallsPerRun: 0,
  maxToolsPerTurn: 0,
  parallelExecution: false,
  maxConcurrentTools: 4,
}
```

---

## 7. ToolCallCard UI During Parallel Execution

When multiple tools run concurrently, their `ToolCallCard` components should show `status: 'running'` simultaneously. Currently cards are shown sequentially. No change is needed to the card component itself — the existing `running` state handles this. The cards appear in the tool call list in order of emission, not order of completion; their status updates independently as they complete.

---

## 8. Files to Change

| File | Change |
|------|--------|
| `src/lib/agentLimits.ts` | Add `parallelExecution: boolean`, `maxConcurrentTools: number` to `AgentLimits` and defaults |
| `src/modules/agent/ChatPane.svelte` | Rewrite `executeToolCallsWithApproval` to support parallel batching; handle batch approval UI |
| `src/modules/settings/SettingsPane.svelte` | Add General → Tools subsection with parallel execution toggle and max concurrent input |

---

*Spec created: 2026-06-01*
