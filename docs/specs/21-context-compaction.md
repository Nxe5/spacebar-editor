# Spec 21 — Context Compaction

> **Status:** ❌ Not started  
> **Area:** Agent Loop · Persistence · Settings  
> **Phase:** B — Trust and reliability  
> **Depends on:** [08-ai-agent.md](08-ai-agent.md) (agent loop) · [06-state-management.md](06-state-management.md) (persistence) · [09-tool-system.md](09-tool-system.md) (tools) · [19-planning-system.md](19-planning-system.md) (active plan in summary)

> **Related:** [17-roadmap.md](17-roadmap.md) · Existing meter/budget: `src/lib/contextBudget.ts`, `src/lib/chatContext.ts`

---

## 1. Overview

As sessions grow — especially during multi-step agent runs — the message history approaches the model's context window limit. For Ollama and llama.cpp, the context window is fixed at server configuration time. For Anthropic, it is a hard API limit. In both cases, exceeding it produces truncated or garbled responses with no clear error surfaced to the user.

This spec introduces **context compaction**: a summarize-and-rehydrate strategy that preserves session intent and progress while dramatically reducing token usage. Compaction can trigger automatically at a **user-configurable threshold** or manually via a button in the chat panel.

### Goals

- Sessions remain usable past the context window limit without losing task continuity
- The original user intent is always preserved across compaction boundaries
- Active plan file state is embedded in the compacted context (when [19-planning-system.md](19-planning-system.md) is implemented)
- Compaction is transparent — the user can see when it happened and trigger it manually
- **Auto-compaction is opt-in** (toggle in Settings); the manual **Compact** control is always available when there is enough history
- **Compaction threshold percent** is editable in Settings (not hard-coded)

### Non-Goals

- Sliding window / oldest-message dropping (silently loses original intent — explicitly rejected)
- Per-message importance scoring or semantic ranking
- Compaction of tool call XML/JSON envelopes (semantic results are preserved in summary prose instead)
- Cross-session compaction or global memory
- Automatic context window detection from Ollama/llama.cpp server (user-configured; optional future)
- **Separate models per role in v1** — Settings UI may expose model picks for chat / compaction / autocomplete, but all calls use the active chat model until wired

---

## 2. Strategy: Summarize-and-Rehydrate

When compaction triggers, the model itself writes a structured summary of the session. That summary replaces the full message history as a synthetic context document at the top of a fresh message array. The last N raw turns are appended after it to preserve immediate conversational context.

This approach is chosen over a sliding window because:

- It preserves the **original user intent** (priority #1) explicitly in the summary header
- It embeds the **active plan file state** (priority #2) verbatim when `activePlanPath` is set
- It captures **semantic results of tool calls** (priority #3) without the full JSON/XML envelope bloat
- It keeps **recent turns** (priority #4) as raw messages after the summary

The summary is produced by a separate model call before history is cleared. It is not assembled by application code — the model's own understanding of what matters is more reliable than heuristic extraction.

---

## 3. Compaction Payload Format

The summary written by the model follows this fixed structure:

```markdown
## Session Context (compacted at 85% context)

### Original Task
<The user's original goal in 1-3 sentences — verbatim or close paraphrase>

### Active Plan
File: plans/2026-05-29-refactor-auth.md
Status: in_progress
Open tasks:
- [ ] Migrate src/api/routes/user.ts
- [ ] Remove src/auth/legacy.ts
- [ ] Update tests

(Write "No active plan." if none exists)

### What Was Done
- Audited all legacy.ts imports (23 files affected)
- Implemented src/auth/jwt.ts — equivalent interface confirmed
- Migrated src/api/routes/admin.ts successfully
- Ran tests: 47 pass, 2 failing (test/auth/session.test.ts lines 88, 102)

### Current State
Working on src/api/routes/user.ts migration. The non-standard session shape
on line 44 needs to match the pattern used in admin.ts (see jwt.ts:87).

### Files Modified This Session
- src/auth/jwt.ts (created)
- src/api/routes/admin.ts (migrated)
```

### 3.1 Section Definitions

| Section | Content | Source |
|---------|---------|--------|
| `### Original Task` | User's first message or task description, 1–3 sentences | Model paraphrase of `messages[0]` |
| `### Active Plan` | Open tasks verbatim from the plan file + status | Read from `activePlanPath` before compaction |
| `### What Was Done` | Bullet list of concrete actions: files created/modified, commands run, decisions made | Model summary of tool results in history |
| `### Current State` | 1–2 sentences: what is actively in progress and any critical context | Model assessment |
| `### Files Modified This Session` | File paths touched, one per line | Model extraction from tool call history |

The header line should include the **actual threshold** at compaction time (e.g. `compacted at 87% context`), not a fixed `85%` string.

### 3.2 Synthetic Conversation Wrapper

After the summary is written, it is inserted as a synthetic exchange at the top of the new message array:

```
[user]      [Session context — compacted to free space]\n\n<summary>
[assistant] Understood. Continuing from the compacted context.
[...last N raw turns appended here]
```

The synthetic assistant acknowledgment is required. Without it, some models treat a bare user context document as a fresh start and disregard it. The phrase should not be altered — it is a functional prompt, not display text.

---

## 4. Token Estimation

For triggering compaction, reuse the existing token estimation path where possible (`countTokens` / `estimateProviderMessagesTokens` in `src/lib/contextBudget.ts` and `src/lib/chatContext.ts`). Do not introduce a second incompatible estimator unless profiling shows the existing path is too slow for the meter.

A character-based fallback is acceptable only for quick UI hints when tokenization is unavailable:

```typescript
function estimateTokensFallback(text: string): number {
  return Math.ceil(text.length / 3.5);
}
```

The `3.5` characters-per-token ratio is a conservative estimate for code-heavy sessions. Prefer **erring early** (trigger slightly before the hard limit) over erring late.

### 4.1 Context Window Size

The context window is sourced from provider configuration — same resolution as the chat footer meter today:

```typescript
// Existing: resolveModelContextWindow() in src/lib/contextBudget.ts
function getContextWindowSize(source: ContextWindowSource): number {
  return resolveModelContextWindow(source);
}
```

| Backend | Source |
|---------|--------|
| Ollama | `ollamaModels[].contextWindow` / server template `num_ctx` |
| llama.cpp | Model row `contextWindow` / server template |
| Anthropic | `anthropicContextBudget` capped by model max |

Fallback when unset: **8192** for local providers (matches current footer behavior), not unlimited.

### 4.2 Threshold Calculation

```typescript
function shouldCompact(
  messages: ProviderMessage[],
  contextWindow: number,
  threshold: number // 0.5–0.95 from settings
): boolean {
  if (contextWindow <= 0) return false;
  const used = estimateProviderMessagesTokens(messages);
  return used / contextWindow >= threshold;
}
```

When `contextWindow` is unknown (`0` or unset), auto-compaction must **not** run; manual compact remains available with a meter warning (§8.2).

---

## 5. Implementation

### 5.1 Compaction Call

Before clearing history, a separate model call produces the summary. Only a slice of the current history is sent — sending the full history defeats the purpose.

```typescript
async function compactHistory(
  messages: Message[],
  activePlanPath: string | undefined,
  provider: Provider
): Promise<string> {
  const contextSlice = [messages[0], ...messages.slice(-20)];

  const planContent = activePlanPath ? await readFile(activePlanPath) : null;

  const summaryPrompt = `
You are compacting a coding session to free context space.
Produce a structured summary following this exact format:
...
`.trim();

  // v1: always uses active chat model (see §6.3 model roles)
  const response = await callModel(provider, [{ role: 'user', content: summaryPrompt }]);
  return response.content;
}
```

### 5.2 History Replacement

```typescript
async function triggerCompaction(
  session: ChatSession,
  keepRecentTurns: number
): Promise<void> {
  const summary = await compactHistory(
    session.messages,
    session.activePlanPath,
    session.provider
  );

  const recentTurns = session.messages.slice(-keepRecentTurns);

  session.messages = [
    {
      role: 'user',
      content: `[Session context — compacted to free space]\n\n${summary}`,
    },
    {
      role: 'assistant',
      content: 'Understood. Continuing from the compacted context.',
    },
    ...recentTurns,
  ];

  session.compactedAt = new Date().toISOString();
  session.compactionCount = (session.compactionCount ?? 0) + 1;

  await persistSession(session);
}
```

`compactionCount` is stored on the session for debugging and for the UI indicator (§7.2).

### 5.3 Trigger Logic

Check before each agent turn in `ChatPane.svelte` (or `streamTurn.ts` preflight):

```typescript
// Settings (defaults in §6.1)
if (settings.agent.autoCompact && shouldCompact(messages, contextWindow, settings.agent.compactThreshold)) {
  await triggerCompaction(session, settings.agent.compactKeepRecentTurns);
  showCompactionNotice();
}
// Then proceed with the agent turn on the new history
```

`showCompactionNotice()` displays an inline notice in the chat panel (§7.3). It does not block the agent loop — compaction completes, then the turn proceeds.

### 5.4 Manual Trigger

The manual **Compact** button in the chat footer calls `triggerCompaction()` directly — same function, no separate code path. Always available when `messages.length` exceeds the minimum (§11). Works even when `autoCompact` is **off**.

---

## 6. Settings

Extend agent-related settings in `tinyllama.settings.v3` (alongside `agentLimits` today). Suggested shape:

```typescript
interface AgentCompactionSettings {
  /** When true, compact automatically before a turn when threshold is reached. */
  autoCompact: boolean;
  /** Fraction of context window (0.5–0.95) that triggers auto-compaction. Default 0.85. */
  compactThreshold: number;
  /** Raw messages kept after compaction (message count, not turn pairs). Default 6. */
  compactKeepRecentTurns: number;
}

interface ModelRoleOverrides {
  /** Model id for main chat/agent turns. null = use global selectedModel. */
  chat: string | null;
  /** Model id for compaction summary call. null = use chat model (v1 behavior). */
  compaction: string | null;
  /** Model id for future inline autocomplete. null = use chat model. */
  autocomplete: string | null;
}

interface SettingsState {
  // ...
  agentCompaction: AgentCompactionSettings;
  modelRoles: ModelRoleOverrides;
}
```

Persist under `agent` or a dedicated `agentCompaction` key — implementer should match `src/lib/stores/settings.ts` conventions.

### 6.1 Default Values and Rationale

| Setting | Default | Rationale |
|---------|---------|-----------|
| `autoCompact` | `false` | Opt-in — users should understand compaction before it runs automatically |
| `compactThreshold` | `0.85` | Leaves headroom for the compaction call plus one more agent turn |
| `compactKeepRecentTurns` | `6` | Enough immediate conversational context without inflating the new history |

### 6.2 Settings UI (Agent section)

Under **Settings → Agent** → **Context compaction**:

```
Context compaction
─────────────────────────────────────────────
☐ Enable automatic compaction

When context reaches   [ 85 ] % of the model window
                       (slider or number input, 50–95)

Keep last   [ 6 ]   messages after compacting
            (range 2–20)

[ Compact now ]  (optional test button in settings — defer if redundant with chat footer)
```

| Control | Behavior |
|---------|----------|
| **Enable automatic compaction** | Binds `autoCompact`; when off, only manual **Compact** in chat runs compaction |
| **Threshold %** | Binds `compactThreshold`; live-updates meter warning band (optional); clamp 50–95 |
| **Keep last N messages** | Binds `compactKeepRecentTurns` |

Validation:

- Below **50%** is wasteful (repeated compaction on half-full context).
- Above **95%** risks the compaction call exceeding the limit before it completes.

### 6.3 Model roles (UI only in v1 — not wired)

Under **Settings → Agent** → **Models by role** (or a subsection of Providers):

```
Models by role
─────────────────────────────────────────────
Chat (agent)     [ same as active model ▼ ]   (disabled or read-only in v1)
Compaction       [ same as active model ▼ ]   (disabled in v1)
Autocomplete     [ same as active model ▼ ]   (disabled in v1)

All roles currently use the active chat model. Per-role overrides
will apply to compaction, autocomplete, and chat independently in a
future release.
```

| Role | v1 behavior | Future |
|------|-------------|--------|
| **Chat** | `settings.selectedModel` + active backend | Optional override |
| **Compaction** | Same as chat | Dedicated smaller/cheaper model allowed |
| **Autocomplete** | Same as chat (feature not built) | Fast local model for inline complete |

Store `modelRoles` in settings JSON so wiring later does not require a migration. Dropdowns may show the current `selectedModel` label but **must not** change runtime behavior until explicitly implemented in `compactHistory()` and future autocomplete.

---

## 7. UI Components

### 7.1 Context Meter (existing — extend)

The existing context meter in the chat footer gains a **Compact** control:

```
[████████░░] 73%   [⟳ Compact]
```

| Behavior | Detail |
|----------|--------|
| Always visible | When the session has enough messages to compact (§11) |
| Disabled | While compaction in progress (spinner on button) |
| Meter colors | Amber ≥ 75%, red ≥ 90% (independent of user's compaction threshold) |
| Threshold hint | Optional subtitle when `autoCompact` on: *"Auto-compact at 85%"* from settings |

### 7.2 Compaction Count Indicator

When a session has been compacted one or more times, show a subtle indicator in the chat header:

```
Chat  ·  ⟳ ×2
```

Tooltip:

```
This session has been compacted 2 times.
Original history is not recoverable.
Last compacted: 2026-05-29 14:32
Auto-compact: on at 85%
```

### 7.3 Inline Compaction Notice

When compaction triggers (auto or manual), show a non-message divider in the activity feed / message list:

```
───── Context compacted — session summary preserved ─────
```

UI-only element derived from `compactedAt` — not stored as a chat message. Makes the boundary visible so users are not confused by apparent history loss.

> ✅ **Implemented (divider only):** the synthetic summary message produced by `buildCompactedMessages()` now carries a `compactionBoundary: true` flag (`src/lib/stores/chat.ts` `Message`, threaded through `ChatLikeMessage` in `src/lib/agent/activity.ts`). `ChatPane.svelte` renders a `.compaction-divider` (`───── Context compacted — session summary preserved ─────`) in place of the synthetic user bubble. The rest of §15 (context-budget meter colors, per-model context auto-detection) remains spec-only.

---

## 8. Ollama / llama.cpp Specifics

### 8.1 Context Overflow Error Handling

When a session exceeds the server's context window without compaction, Ollama and llama.cpp may return truncated or garbled output with no clear error.

Heuristic: if a response is under 10 tokens and the context meter is above **90%**, surface:

```
Response may be truncated — context window appears full.
Use ⟳ Compact to continue this session.
```

Last-resort path for users without auto-compact enabled.

### 8.2 Unknown Context Window

If `contextWindow` cannot be resolved:

- Meter shows `?` or similar rather than a reliable percentage
- **Auto-compaction does not trigger**
- Manual **Compact** remains available
- Meter hint: *"Set context window in Settings to enable auto-compact threshold"*

### 8.3 Context Window Discovery (Optional, Future)

Ollama `GET /api/show` exposes `context_length`. Deferred from v1 — manual configuration is sufficient.

---

## 9. State Changes

Extend `ChatSession` in `.tinyllama/state.json` (via `src/lib/stores/chat.ts` / `src/lib/projectState.ts`):

```typescript
interface ChatSession {
  // ... existing fields ...
  compactedAt?: string;       // ISO datetime of most recent compaction
  compactionCount?: number;   // total compactions in this session
  activePlanPath?: string;    // from spec 19 — used when building summary
}
```

No changes to project-level state. Compaction is session-scoped.

---

## 10. Implementation Plan

### Phase 1 — Core compaction (no auto-trigger)

- [ ] `estimateTokens` / threshold helpers in `src/lib/contextCompaction.ts` (or extend `contextBudget.ts`)
- [ ] `compactHistory()` — model call producing structured summary
- [ ] `triggerCompaction()` — history replacement + `persistCurrentProjectState`
- [ ] Manual **⟳ Compact** button in chat footer
- [ ] Inline compaction divider in chat / activity feed
- [ ] Replace `contextBudgetStopMessage` "compaction is not available yet" when Phase 1 ships

**Deliverable:** Compaction on demand. Settings for threshold/auto saved but auto path not wired yet.

### Phase 2 — Auto-compaction + settings UI

- [ ] `autoCompact`, `compactThreshold`, `compactKeepRecentTurns` in settings store + persistence
- [ ] Settings UI: **toggle**, **editable threshold %**, **keep recent N**
- [ ] `shouldCompact()` in agent loop preflight
- [ ] Auto-trigger with inline notice
- [ ] Compaction count indicator in chat header
- [ ] Settings UI: **Models by role** subsection (disabled dropdowns, `modelRoles` persisted)

**Deliverable:** Full user control over auto-compact and threshold.

### Phase 3 — Overflow recovery

- [ ] Truncated-response heuristic near context limit
- [ ] Recovery message with link to **Compact**
- [ ] Unknown context window warning in meter
- [ ] Wire `modelRoles.compaction` when product is ready (optional follow-up)

**Deliverable:** Graceful degradation when limit hit without compaction.

---

## 11. Edge Cases and Failure Modes

| Scenario | Handling |
|----------|----------|
| Compaction model call fails | Abort; history unchanged; chat error: *"Compaction failed — history unchanged."* |
| Session has only 1–2 messages | No-op; **Compact** disabled — *"Not enough history to compact"* |
| Compaction call exceeds context | Harder slice: first message + last 10 turns; if still too large, instruct user to start new session |
| `activePlanPath` file missing | `### Active Plan`: *"Plan file not found at compaction time."* |
| Compaction mid-agent-run | Queue after current tool/stream completes; compact before next model call |
| Double-click **Compact** | Debounce / 2s lock after completion |
| Summary too large | Cap prompt at 8k chars; truncate `### What Was Done` if response > ~4k tokens |
| `autoCompact` on but threshold invalid | Clamp threshold on save; never persist outside 50–95 |

---

## 12. What Not To Do

**Do not use a sliding window.** Dropping the oldest N messages silently discards the original user intent.

**Do not compact on every agent run.** A 10% full context does not need compaction.

**Do not discard tool results entirely.** Preserve semantic results in `### What Was Done`; drop envelope bloat.

**Do not compact without persisting first.** Call project state persist before resuming the agent loop.

**Do not wire model role dropdowns in v1** without implementing `resolveModelForRole('compaction')` — UI-only is acceptable; lying dropdowns are not.

---

## 13. Out of Scope (Future)

- Automatic context window detection from Ollama `/api/show`
- Per-message importance scoring
- Exportable session summaries
- Compaction undo (original history not recoverable by design)
- Cross-session memory
- **Autocomplete** feature (model role reserved in settings only)

---

## 14. Acceptance Criteria

1. User can enable/disable **automatic compaction** in Settings → Agent.
2. User can set **threshold %** (50–95); auto-compact runs only when `used/window ≥ threshold` and toggle is on.
3. User can always trigger **Compact** manually from the chat footer when history is sufficient.
4. After compaction, session continues with synthetic summary + recent raw messages; `compactionCount` increments.
5. Settings show **Models by role** with compaction/autocomplete/chat rows; all use chat model until a later release wires overrides.

---

## 15. Enhancement Addenda (from `extension.md` §7)

> **Status:** ❌ Not started — hardening on top of the core compaction spec above.
> These extend §7 (UI) and §4 (token budget); they do not change the compaction strategy.

### 15.1 Visual Compaction Divider (extends §7.3)

§7.3 specifies an inline notice derived from `compactedAt`. This addendum makes it **anchored and informative**:

- Render a horizontal divider in the transcript **at the message index where compaction occurred**, not just a floating notice:

  ```
  ─────────── Context compacted · 847 turns summarized ───────────
  ```

- Style: muted, non-intrusive.
- **Clicking** the divider reveals the retained compaction summary (tooltip or expandable) so users can verify what was kept.

**State change:** add `compactionMessageIndex?: number` to the session (alongside `compactedAt` / `compactionCount` from §9) so the divider anchors to the correct position even as new messages append.

**Files:** `src/lib/stores/chat.ts` (store index), `src/modules/agent/ChatPane.svelte` (divider in message list renderer).

### 15.2 Context Budget Visualization (extends §7.1)

The footer meter (§7.1) gains richer feedback in the **status bar**:

- Show `used / total` token count on hover, e.g. `12,847 / 32,768`.
- Color gradient green → amber → red as usage climbs.
- At **80%**: amber with tooltip *"Context nearly full — compaction recommended."*
- At **95%**: red with an auto-prompt to compact (does not auto-run unless `autoCompact` is on).

**Files:** `src/modules/workbench/StatusBar.svelte`, `src/lib/contextBudget.ts`.

### 15.3 Per-Model Context Window Auto-Detection (resolves §4.1 / §8.3 deferral)

§8.3 deferred context-window discovery. This addendum specifies it as an opt-in resolver so a user who pulls a 128k model is not budgeted at 8k:

- On model selection, query the active server for the model's context length when available:
  - **Ollama:** `GET /api/show` → `context_length`.
  - **llama.cpp:** `/props` (or `/health`) server metadata.
- Store as **`detectedContextWindow`** on the model entry.
- `contextBudget.ts` resolution order becomes: `detectedContextWindow ?? settings contextWindow ?? 8192`.
- Feeds [27-local-model-ux.md](27-local-model-ux.md) `ModelCapabilities.contextWindow`.

**Files:** `src/lib/ollamaClient.ts`, `src/lib/llamaCppClient.ts`, `src/lib/contextBudget.ts`, model entry in `src/lib/stores/settings.ts`.

### 15.4 Addendum Acceptance Criteria

1. After compaction, a labeled divider appears at the compaction point and reveals the summary on click.
2. The status-bar meter shows `used / total` on hover and shifts color at 80% / 95%.
3. Selecting an Ollama model with a known context length budgets against that length, not the 8k fallback.

---

*Spec created: 2026-05-29 · Addenda added: 2026-05-30 (`extension.md` §7) · Target: Phase B — pre-private beta*
