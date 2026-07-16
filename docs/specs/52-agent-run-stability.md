# Spec 52 — Agent Run Stability: Freezes, Crash-to-Welcome, Tool-Call Caps

> **Status:** ✅ **Implemented** (mitigations) · §6 future work open
> **Area:** Chat pane · Agent loop · Workspace lifecycle
> **Related:** `src/modules/agent/ChatPane.svelte` · `src/lib/chat/renderMarkdown.ts` · `src/lib/agentLimits.ts` · `src/lib/crashRestore.ts` · [32-agent-error-recovery.md](32-agent-error-recovery.md) · [34-context-overflow-warnings.md](34-context-overflow-warnings.md)

---

## 1. Reported Symptoms

During large agent tasks (reported with Kimi K3; much less with Kimi K2.7 Code):

1. The UI **freezes** while the chat is streaming (recovers, but seconds-long stalls).
2. The app occasionally **"crashes" back to the welcome screen**, as if no folder had been selected.
3. Runs stop mid-task, suspected **tool-call limit** — exploration-heavy requests issue many `ls`/`grep`-style calls.

## 2. Diagnosis

### 2.1 Freezes — quadratic streaming re-render
Every streamed token triggered a state write, and `ChatMarkdown.svelte` re-parses the **entire accumulated reply** through `marked` on each change (`renderChatMarkdown` is synchronous, on the UI thread). Cost per turn is O(n²) in reply length. Long-thinking models (Kimi K3 emits large `reasoning_content` streams; K2.7 Code emits little) push this into visible multi-second stalls — matching the model-dependence in the report.

### 2.2 Crash-to-welcome — webview process death, no session restore
There is **no app-level request timeout** in any provider (`openaiCompat.ts`, `anthropic.ts` — abort is user-initiated only), so "timeout while thinking" is not the mechanism. The observed behavior matches the **WKWebView content process being killed** (memory pressure from §2.1's giant strings/DOM plus long runs) — Tauri reloads the page, the app boots fresh, and since the workspace is only chosen interactively, the user lands on the welcome screen. The "freeze but no crash" cases are §2.1; the "crash" cases are the same pathology hitting the process limit.

### 2.3 Run stops — conservative default caps
Defaults were 24 steps / 80 tool calls (cloud) and 40 / 120 (local). A single exploration request legitimately spends dozens of read-only calls, so real tasks hit the cap. Worse, defaults are **saved into settings**, so earlier users keep old caps even after defaults change.

## 3. Fixes Shipped

| # | Fix | File |
|---|-----|------|
| 1 | **Stream render batching:** token deltas coalesce and flush at most every 80 ms (~12 fps); flushed immediately on turn end/tool call, discarded on reset/abort so stale text can't resurrect | `ChatPane.svelte` |
| 2 | **Markdown parse cap:** replies over 300 KB render as escaped `<pre>` text instead of a full parse | `renderMarkdown.ts` |
| 3 | **Crash restore:** the active workspace is recorded in `localStorage` with a clean-exit marker set on `beforeunload`. Boot after an *unclean* reload reopens the workspace (through the normal lock/trust path). Marker is consumed on read — one attempt, no crash loops | `crashRestore.ts`, `projectState.ts`, `WorkbenchShell.svelte` |
| 4 | **Raised caps:** defaults now **100 steps / 300 tool calls** for both cloud and local. Saved settings that exactly match superseded defaults (24/80, 40/120 with per-turn 0) are migrated up; any customized values are preserved. `0` still means unlimited; continue-after-cap UX from spec [32](32-agent-error-recovery.md) is unchanged | `agentLimits.ts` |

## 4. Acceptance

- Stream a multi-thousand-token reply with visible thinking: UI stays interactive; final text identical to unthrottled behavior.
- Force-reload the webview mid-session (dev): project reopens with tabs/chat restored from `.sidebar/state.json`; a second forced crash *during* restore lands on welcome (no loop).
- Graceful quit and relaunch: welcome screen as before (no surprise auto-open).
- A run issuing > 80 read-only calls proceeds without hitting the cap; users with saved 24/80 get 100/300 after upgrade.

## 5. Explicitly Not Done

- No provider request timeout was added — long thinking is legitimate; abort remains user-controlled (Stop button).
- No cap on thinking-stream size (only the render-side parse cap).

## 6. Future Work

- **Virtualized message list** — DOM growth is unbounded in long sessions; the remaining memory-pressure vector for §2.2.
- Thinking-content ring buffer (keep last N KB live, archive the rest) for extreme reasoning streams.
- Telemetry hook (opt-in) to confirm webview-crash frequency post-fix.
- Investigate Kimi K3 tool-calling reliability vs K2.7 Code in the eval harness (`tests/llm/`) — model-specific failure shapes belong in fixtures, not anecdotes.
