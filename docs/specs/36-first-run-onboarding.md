# Spec 36 — First-Run / Onboarding

> **Status:** ✅ Implemented (custom scope) — welcome screen with "Open project" button + up to 8 recent projects; CLI file-open mode (`spacebar <file>` opens the file with all panes collapsed, `spacebar <dir>` opens as workspace); `add_recent_project` / `get_recent_projects` Rust commands; `layoutOverride` store for one-shot panel collapse.
>
> **v0.1.6 refactor:** CLI launch handling moved out of `FileTree.svelte` (which only mounts after a workspace is open) into `src/lib/launch/initLaunchArgs.ts`, invoked once from `WorkbenchShell.onMount`. `handleLaunchArgs()` opens the parent directory as the workspace for a file and applies `MICRO_EDITOR_LAYOUT` (`src/lib/launch/microEditorLayout.ts` — chat, tabs, explorer, and bottom panel all collapsed). See [04-entry-points.md](04-entry-points.md).
> **Area:** UX · Settings · Providers
> **Phase:** B — Enhancement
> **Depends on:** [05-workbench.md](05-workbench.md) · [08-ai-agent.md](08-ai-agent.md) · [07-workspace.md](07-workspace.md)

---

## 1. Design Approach

Spacebar Editor has no onboarding wizard or modal walkthrough. Empty states are the onboarding. Every state where the user cannot yet use the app has a single clear call-to-action that unblocks them. This keeps the UI clean for users who know what they are doing and still guides new users.

Three empty states map to three sequential blockers:

1. **No workspace open** — user cannot do anything useful
2. **Workspace open, no model configured** — user can browse files but not chat
3. **Model configured, not reachable** — user has done everything but the connection is broken

These states are addressed independently. A user who already has a workspace and a working model sees none of this.

---

## 2. Trigger

The first-run condition is detected by checking for the settings key in localStorage:

```typescript
const isFirstRun = !localStorage.getItem('sidebar.settings.v4')
```

If the key is absent, this is a new install or the user has cleared their storage. If the key exists (even partially populated), it is not first run.

First-run detection is used only for the first-send hint (§6). The three empty states are shown to any user in that state, regardless of whether it is their first run. A returning user who has cleared their settings or moved to a new machine will see the same empty states.

---

## 3. Empty State 1 — No Workspace Open

### 3.1 Trigger

The workspace path store is null or empty and no folder is open.

### 3.2 UI

The center workbench panel (where the editor and terminal live) shows:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                                                         │
│                   [folder icon — large]                 │
│                                                         │
│            Open a project folder to get started         │
│                                                         │
│               [ Open folder ]                           │
│                                                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- The folder icon is the same icon used in the existing toolbar folder button, displayed at 64px
- "Open a project folder to get started" is the subtitle text, `font-size: 14px`, muted color
- "Open folder" button triggers the same OS folder picker as the existing toolbar button (`open_folder` IPC command)
- This empty state replaces the editor area; the sidebar and chat pane are not affected

### 3.3 Implementation

In `WorkbenchShell.svelte`, when `$workspacePath` is null and no tabs are open, mount the empty state component instead of the tab content area.

New component: `src/modules/workbench/WorkspaceEmptyState.svelte`

---

## 4. Empty State 2 — No Model Configured

### 4.1 Trigger

A workspace is open but no provider has any configured and enabled model. This is determined by checking all six model arrays (Ollama, llama.cpp, Anthropic, DeepSeek, GLM, Kimi) for non-empty entries.

### 4.2 UI

The chat pane (where the message list and composer live) shows an empty state in place of the message list:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                   [model/chip icon]                     │
│                                                         │
│             Configure a model to start chatting         │
│                                                         │
│               [ Open Settings ]                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- "Open Settings" opens the Settings window on the Providers section (`providers-ollama` by default)
- The composer is still visible below this state — the user can type, but sending is disabled with the tooltip "No model configured"
- If the user opens Settings and configures a model, the chat pane updates immediately (reactive on the model list store)

### 4.3 Implementation

In `ChatPane.svelte`, when `$activeModel` is null and `$workspacePath` is non-null, render the no-model empty state in the message list area.

---

## 5. Empty State 3 — Model Not Reachable

### 5.1 Trigger

A model is configured but health checks are failing. This uses the existing `providerHealth.ts` module, which already tracks provider connectivity status.

### 5.2 UI

This state does not replace any content — the user can still use the app (they might switch models). Instead, the chat footer's provider health indicator changes:

- The provider health dot in the status bar turns **red**
- Hovering shows a tooltip with the error:

```
┌──────────────────────────────────────────────────────┐
│  Ollama is not reachable                             │
│  http://localhost:11434 — connection refused         │
│                                                      │
│  Make sure Ollama is running:                        │
│  ollama serve                                        │
│                                                      │
│  → Open Settings                                     │
└──────────────────────────────────────────────────────┘
```

- "Open Settings" links to the relevant provider settings section
- The tooltip is shown on hover of the red health indicator (existing hover behavior, extended with error detail)
- If the user sends a message while the model is unreachable, the send attempt fails with an inline error in the chat: "Could not reach [provider] — check your connection in Settings"

### 5.3 Provider-Specific Messages

| Provider | Example tooltip |
|----------|----------------|
| Ollama | "Ollama is not reachable at localhost:11434. Make sure Ollama is running: `ollama serve`" |
| llama.cpp | "llama.cpp server is not reachable at localhost:8080. Make sure llama-server is running." |
| Anthropic | "Anthropic API key is invalid or missing. Check Settings → Providers." |
| DeepSeek | "DeepSeek API is not reachable. Check your API key in Settings → Providers." |

### 5.4 Implementation

Extend `providerHealth.ts` to include an `errorMessage` field alongside the boolean `isHealthy`:

```typescript
interface ProviderHealthStatus {
  isHealthy: boolean
  errorMessage: string | null
  lastChecked: Date | null
}
```

The tooltip in `ChatPane.svelte` (or the status bar component) reads `errorMessage` and renders it.

---

## 6. First-Send Hint

### 6.1 Trigger

On the user's **first message send** where:
- The app detects it is likely a first run (`isFirstRun` flag, §2)
- The current mode is **Chat** (tools disabled)

### 6.2 UI

After the assistant responds to the first message, a one-time dismissible hint appears below the response:

```
┌─────────────────────────────────────────────────────────┐
│  💡  Switch to Agent mode to let the AI read and write   │
│      files in your project.                   [Got it]  │
└─────────────────────────────────────────────────────────┘
```

- "Got it" dismisses the hint permanently (stored in localStorage: `sidebar.hints.agentModeHint = 'dismissed'`)
- The hint is not shown again after dismissal, even on subsequent launches
- The hint is not shown if the user is already in Plan or Agent mode
- The hint is not shown if `isFirstRun` is false (existing users who know the modes)

### 6.3 Implementation

In `ChatPane.svelte`, after appending the first assistant message: check `isFirstRun && currentMode === 'chat' && !hintDismissed`. If true, append a `hint` marker to the message list that renders the hint block.

The hint dismissal state is stored separately from the main settings blob so it is not affected by settings reset.

---

## 7. Files to Change

| File | Change |
|------|--------|
| `src/modules/workbench/WorkbenchShell.svelte` | Mount `WorkspaceEmptyState` when no workspace open |
| `src/modules/workbench/WorkspaceEmptyState.svelte` | New — no-workspace empty state |
| `src/modules/agent/ChatPane.svelte` | No-model empty state in message list; first-send hint logic; send-failure inline error when model unreachable |
| `src/lib/providerHealth.ts` | Add `errorMessage` field to `ProviderHealthStatus`; extend per-provider error messages |

---

*Spec created: 2026-06-01*
