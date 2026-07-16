# High-level Architecture

> **Status:** ✅ **COMPLETE** — Two-tier runtime: **Svelte webview** (agent + LLM HTTP) + **Rust** (OS integration). **No Node sidecar.**

---

## Agent runtime model (current)

Spacebar Editor does **not** spawn a separate Node process for chat, tools, or provider streaming. That was an earlier design; it is **not** in the repo today (no `sidecar/` package, no harness Tauri commands).

| Responsibility | Runtime | Key modules |
|----------------|---------|-------------|
| Agent loop (multi-turn tools) | Svelte webview | `ChatPane.svelte` → `runAgentLoop()` |
| LLM HTTP / SSE | Svelte webview | `streamTurn.ts` → `anthropic.ts`, `openaiCompat.ts`, `deepseek.ts`, `glm.ts`, `kimi.ts` (`fetch`) |
| Tool policy + approval UI | Svelte webview | `toolPolicy.ts`, `ChatPane` approval strip |
| Tool execution | Svelte → Rust IPC | `toolRunner.ts` → `ipc.ts` → `commands.rs` |
| Filesystem, git, PTY, `web_fetch` | Rust | `src-tauri/src/modules/*` |

**Node.js** is used only as a **dev/build** toolchain (Vite, Vitest, Tauri CLI, icon sync scripts)—not as an application runtime for the agent.

### Former sidecar design (removed)

| Former piece | Status |
|--------------|--------|
| `sidecar/` Node package (`sidecar/dist/index.js`) | ❌ Removed — not in tree |
| Tauri spawn + JSON-line IPC (`start`, `chat`, `approve_tool`, …) | ❌ Removed |
| Harness commands (`start_harness`, `send_to_harness`, `stop_harness`, `harness:event`) | ❌ Removed from `main.rs` |
| `@mariozechner/pi-coding-agent` in sidecar | ❌ Removed — no dependency |
| Tool stubs in sidecar (no Tauri bridge) | ❌ Replaced — tools run via `toolRunner` + real IPC |

Legacy error mapping may still mention harness in `invokeSafe.ts` / `errors.ts`; that is not active architecture.

### Why this shape

- **Fewer processes** — one desktop app, no sidecar lifecycle or version skew.
- **Simpler debugging** — agent loop and streaming live in the same webview as the UI.
- **Real tools** — all 17 built-in tools invoke Rust (filesystem, git, grep, shell, etc.).
- **Trade-off** — API keys and LLM `fetch` run in the webview today ([14-security.md](14-security.md)); moving HTTP to Rust is roadmap, not a return to a Node sidecar.

---

## System Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Svelte Frontend (src/)                                                   │
│  WorkbenchShell ──┬── ChatPane (agent loop, streaming, tool approval)   │
│                   ├── CenterWorkbench (editor / terminal / preview)      │
│                   └── RightSidebar (explorer, search, git)                │
│  Stores: chat, files, workbench, settings, toolPolicy, mode, iconTheme    │
│  lib/agent/     conversation.ts, streamTurn.ts                            │
│  lib/providers/ anthropic.ts, openaiCompat.ts, deepseek.ts, glm.ts, kimi.ts  ──► fetch() to LLM APIs   │
│  lib/tools/     toolDefinitions.ts, toolRunner.ts ──► ipc.ts              │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ Tauri invoke + events (pty:data, pty:exit)
┌───────────────────────────────▼──────────────────────────────────────────┐
│  Rust Backend (src-tauri/src/modules/)                                    │
│  filesystem.rs   read/write/list/grep/find/tree/web_fetch                 │
│  git.rs          status, diff, stage, commit, log, discard, file@HEAD     │
│  pty.rs          create/write/resize/close                                  │
│  commands.rs     Tauri command handlers                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Security Boundaries

| Boundary | Current State | Status | Notes |
|----------|---------------|--------|-------|
| Tool path sandboxing | TS (`pathUtils.ts`) + Rust (`canonicalize_workspace_path`) | ✅ Complete | [33-rust-path-enforcement.md](33-rust-path-enforcement.md) |
| Secrets storage | Cloud API keys in `settings.apiKeys` (`sidebar.settings.v4`) | ✅ Complete | Avoids OS keychain permission prompts; see [14-security.md](14-security.md) |
| LLM HTTP | Webview `fetch` with keys from settings store | ✅ Working | Rust proxy deferred |
| CSP | Restrictive allowlist in `tauri.conf.json` | ✅ Complete | Anthropic, DeepSeek, GLM (Z.ai), Kimi (Moonshot), localhost |

---

## Data Flow

1. User types in chat → `ChatPane` runs the agent loop
2. `buildProviderMessages()` + `buildSystemPrompt()` (mode + workspace + custom prompt)
3. `runAgentLoop()` iterates:
   - `streamOneTurn()` → text + optional tool calls
   - If no tools → done
   - `executeToolCallsWithApproval()` → policy gates → `executeTool()` → IPC
   - Append tool results; continue
4. `filesystemSync` + `bumpGitRefresh()` after mutating tools
