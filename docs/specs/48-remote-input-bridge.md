# Spec 48 — Remote Input Bridge (iMessage · Telegram · Discord)

> **Status:** 📋 **Draft**
> **Area:** Agent · Rust backend · Security · Settings
> **Phase:** future — Phase 0 (headless agent turn) is a prerequisite with standalone value
> **Depends on:** [08-ai-agent.md](08-ai-agent.md) · [09-tool-system.md](09-tool-system.md) · [14-security.md](14-security.md) · [45-security-hardening-and-capability-expansion.md](45-security-hardening-and-capability-expansion.md)

> **Related:** `src/modules/agent/ChatPane.svelte` · `src/lib/stores/chat.ts` · `src/lib/toolPolicy.ts` · `src-tauri/src/modules/commands.rs` · `src-tauri/tauri.conf.json`

---

## 1. Overview

Let the user send prompts to a running Spacebar Editor instance from a phone — via **Telegram**, **Discord**, or **iMessage** — and receive the agent's reply back in the same conversation. The desk stays the workstation; the phone becomes a remote composer: "kick off the test suite", "summarize what changed today", "continue the refactor and tell me when it's done".

More channels (Slack, WhatsApp, email) can follow; the design is adapter-based so each channel is an isolated module behind one internal interface.

### 1.1 Load-bearing constraint: the agent loop is UI-coupled

The agent loop (tool execution, streaming, retries — `runOneTool`, `flushParallelBatch`, etc.) currently lives **inside `ChatPane.svelte`** as component-local functions. Remote input cannot "type into the composer"; it needs a programmatic entry point. Therefore:

> **Phase 0 of this spec is extracting a headless `runAgentTurn(session, userMessage, options)` into `src/lib/agent/` with no Svelte dependencies.** `ChatPane.svelte` becomes a consumer of it.

Phase 0 has standalone value regardless of this feature (testability, future CLI/automation, eval-harness reuse) and should be reviewed as its own PR.

### 1.2 Goals

- Receive plain-text messages from allowlisted senders on connected channels and run them as agent turns against the open workspace.
- Reply with the final assistant text (not tool-call noise) in the originating channel, chunked to channel limits.
- Off by default; every channel individually enabled; hard allowlist of sender identities; visible kill switch.
- Remote turns run under a **restrictive tool-policy profile by default** (§4.2) because nobody is present to answer "ask" prompts.
- All inbound/outbound remote traffic handled in **Rust** (long-lived async tasks), not the webview — no CSP widening for chat platforms.

### 1.3 Non-Goals

- **Headless / tray / daemon operation.** The app must be running with a workspace open. If no workspace is open, the bridge auto-replies "no workspace open" and does nothing.
- Media/attachment handling (inbound images, files) — text only in v1; attachments are a listed follow-up.
- Streaming partial replies to the channel (v1 sends one final message per turn; a "working…" acknowledgment is the only intermediate signal).
- Multi-user access: this is a single-operator remote control, not a team bot. One allowlisted human per channel is the design center.
- Running the bridge as a public bot in shared servers/groups. Discord: DMs or a private server channel; Telegram: direct chat with the bot; iMessage: the operator's own handle.

---

## 2. Architecture

```
Phone ──► Telegram / Discord / iMessage
              │ (Rust adapters: long-poll / gateway ws / chat.db poll)
              ▼
   src-tauri remote::bridge (tokio tasks)
     · sender allowlist check · rate limit · audit log
              │ emit "remote:input" event
              ▼
   Webview  remoteBridge.ts (TS orchestrator)
     · resolve/create remote session (per channel)
     · runAgentTurn() under remote policy profile   ← Phase 0 module
              │ invoke("remote_send", { channel, chatRef, text })
              ▼
   Rust adapter sends reply (chunked per channel limit)
```

Division of labor:

- **Rust (`src-tauri/src/modules/remote/`)** — one module per channel plus a shared `bridge.rs`: connection lifecycle, inbound receive, allowlist filtering, rate limiting, outbound send, audit logging. Emits `remote:input { channel, senderId, chatRef, text, receivedAt }` to the webview; exposes `remote_send`, `remote_status`, `remote_start`, `remote_stop` commands. Follows the PTY/watcher pattern (spawned tasks + events).
- **TypeScript (`src/lib/remote/remoteBridge.ts`)** — session routing and the agent turn. Listens for `remote:input`, appends the user message to the channel's dedicated session, runs the turn, sends back the final text. The webview must exist anyway (it *is* the agent runtime per [03-architecture](03-architecture.md)), so no logic is duplicated in Rust.

The agent loop, providers, tool sandbox, and policy enforcement are untouched — a remote turn is an ordinary turn with a different policy profile and a different reply sink.

### 2.1 Sessions

Each enabled channel gets one dedicated, persistent chat session per workspace, auto-created on first message: title `Remote — Telegram` etc., visible as a normal tab in the chat pane (the user at the desk can watch, scroll, or take over live). Session state persists in `.sidebar/state.json` like any other session.

In-channel commands (parsed by `remoteBridge.ts`, not sent to the model):

| Command | Effect |
|---------|--------|
| `/new` | Archive current remote session, start fresh |
| `/status` | Reply with app version, workspace name, model, turn-in-progress? |
| `/stop` | Cancel the in-flight turn (maps to existing stop/abort path) |

Anything else is a user message. One turn at a time per channel; messages arriving mid-turn are queued (depth 3, overflow → auto-reply "busy, queued N").

### 2.2 Reply formatting

- Final assistant markdown, lightly adapted per channel (Telegram `parse_mode: MarkdownV2` with escaping, Discord markdown near-passthrough, iMessage plain text).
- Chunking: Telegram 4096 chars, Discord 2000, iMessage ~2000 practical; split on paragraph boundaries.
- Turn start acknowledgment: a single "⏳ working…" message (edited/replaced with the result where the platform allows: Telegram `editMessageText`, Discord edit; iMessage cannot edit → send ack only if the turn exceeds 5 s).
- Tool activity is not forwarded. Errors are: policy-denied tools, step-limit stops, and provider failures produce one honest summary line so the operator knows why a turn stopped.

---

## 3. Channel Adapters

Ship order: **Telegram → Discord → iMessage** (ascending fragility).

### 3.1 Telegram (Phase 1)

- **Transport:** Bot API long-polling `getUpdates` (reqwest, no public endpoint, no webhook, works behind NAT).
- **Setup:** user creates a bot via @BotFather, pastes the token into Settings; app replies to the first `/start` with a pairing prompt (§4.1).
- **Identity:** numeric Telegram user ID (not username — usernames are mutable).
- Simplest adapter; also the reference implementation for the adapter trait.

### 3.2 Discord (Phase 2)

- **Transport:** Gateway websocket (receive) + REST (send), via `twilight` or `serenity` crate with minimal intents (`DIRECT_MESSAGES`, `MESSAGE_CONTENT` for DMs, optionally `GUILD_MESSAGES` for one configured private channel ID).
- **Setup:** user creates an application + bot in the Discord developer portal, enables the message-content intent, pastes the token.
- **Identity:** Discord user snowflake ID.
- Heavier dependency; gateway reconnect/backoff handled by the crate.

### 3.3 iMessage (Phase 3 — macOS only)

- **Receive:** poll `~/Library/Messages/chat.db` (SQLite, read-only, WAL mode) for new rows from the allowlisted handle. Requires **Full Disk Access**, which the app must detect and walk the user through granting (System Settings deep-link + recheck).
- **Send:** `osascript` AppleScript to Messages.app (`send "…" to participant "…"`), via the existing shell plumbing in Rust.
- **Identity:** sender handle (phone/email) exactly as stored in `chat.db`.
- **Fragility disclosure (in-UI):** the `chat.db` schema and AppleScript surface are private Apple interfaces that shift across macOS releases; the adapter is versioned per macOS major and degrades to "disabled with explanation" on schema mismatch. This is why it ships last.

### 3.4 Adapter contract (Rust trait)

```rust
trait ChannelAdapter {
    fn id(&self) -> &'static str;                       // "telegram" | "discord" | "imessage"
    async fn start(&self, tx: Sender<InboundMsg>) -> Result<()>;
    async fn stop(&self);
    async fn send(&self, chat_ref: &str, text: &str) -> Result<()>;
    fn health(&self) -> AdapterHealth;                  // connected | degraded(reason) | stopped
}
```

`bridge.rs` owns the task set, restarts crashed adapters with capped backoff, and surfaces `health` to Settings and the status bar.

---

## 4. Security Model

This feature converts a local-first app into something reachable from the network, so the posture is deny-by-default everywhere. It must also be reviewed against the trust-boundary work in [Spec 45](45-security-hardening-and-capability-expansion.md).

### 4.1 Pairing & allowlist

- Every channel has an explicit **sender allowlist** (IDs per §3 identity rules). Messages from anyone else are dropped silently (no reply — don't confirm the bot exists) and audit-logged.
- First-contact pairing: when a channel is enabled with an empty allowlist, the app shows a 6-digit code in a desktop dialog; the first sender to message that exact code within 5 minutes is offered (desktop-side confirm dialog) for allowlisting. No desktop confirmation → no access. This keeps the pairing decision on the machine, not the phone.
- Bot tokens are stored with the existing API-key mechanism (`settings.apiKeys`-adjacent, never in `.sidebar/`).

### 4.2 Remote tool-policy profile

"Ask" prompts cannot be answered from the phone in v1, so remote turns run under a dedicated profile resolved at turn start:

| Profile | Behavior | Default |
|---------|----------|---------|
| **Read-only** | Read/list/grep/git-read tools allowed; every write, shell, and web tool **denied** (not "ask" — denied, with the denial reported in the reply) | ✅ default |
| **Standard** | The user's normal global/project policy, with **"ask" resolved as deny** for remote turns | opt-in |
| **Full** | Normal policy with "ask" auto-approved for remote turns | opt-in behind an explicit scary toggle ("The phone can edit files and run shell commands unattended") |

Per-channel profile selection in Settings. Workspace-trust restrictions ([Spec 45](45-security-hardening-and-capability-expansion.md)) apply on top and always win.

### 4.3 Operational controls

- **Master kill switch:** a status-bar indicator (📱 icon) is visible whenever any adapter is running; click → popover with per-channel health and a one-click "Disconnect all".
- **Rate limiting:** per channel, max 10 turns / 10 min (configurable); excess → auto-reply "rate limited".
- **Audit log:** append-only JSONL at `~/.sidebar/remote-audit.jsonl` (global, not per-project): timestamp, channel, sender ID, message hash, turn outcome, tools run/denied. Surfaced read-only in Settings.
- **Prompt-injection note:** inbound text is user input from an authenticated operator, same trust level as the local composer — but because turns run unattended, the *policy profile* (not reviewer attention) is the control. This is the argument for read-only as the default.
- **No inbound content in logs:** message bodies are hashed in the audit log; full text lives only in the chat session like any other message.

---

## 5. Settings & UI

- **Settings → Remote Input** (new page): master enable, then a card per channel — token/credentials, allowlist editor, policy profile picker, health indicator, "test message" button.
- Status bar: the 📱 indicator (§4.3) only while ≥ 1 adapter is running — invisible cost for users who never touch the feature.
- Chat pane: remote sessions get a small channel badge on the tab so a takeover at the desk is obvious.
- First-enable disclosure: one-time dialog summarizing §4 (what can reach the machine, what the profile allows, where the audit log is).

---

## 6. Implementation Phases

| Phase | Scope | Notes |
|-------|-------|-------|
| **0** | Extract headless `runAgentTurn()` from `ChatPane.svelte` into `src/lib/agent/` | Prerequisite; standalone PR; no behavior change |
| **1** | `bridge.rs` + adapter trait + **Telegram** adapter; `remoteBridge.ts` orchestrator; sessions, commands, pairing, allowlist, read-only profile, kill switch, audit log; Settings page | The vertical slice — everything in §2–5 minus other channels |
| **2** | **Discord** adapter | Adapter-only work if Phase 1 abstractions hold |
| **3** | **iMessage** adapter (macOS) + Full Disk Access onboarding | Fragility disclosure; may slip independently |
| **4+** | Remote "ask" approval (inline approve/deny buttons on Telegram/Discord), attachments, streaming replies, more channels (Slack, WhatsApp, email) | Each item unlocks relaxing a v1 restriction |

Phase 4's remote approval buttons are the designed path to make the **Standard** profile fully usable (ask → phone button instead of auto-deny); the v1 profile table is written so that upgrade is additive.

---

## 7. Testing

- **Phase 0:** the extraction is validated by the existing unit suite plus new headless-turn tests (turn with mocked provider + tools, no DOM) — this is the main testability payoff.
- **Unit (TS):** command parsing (`/new`, `/status`, `/stop`), chunking per channel limit, policy-profile resolution (read-only denies writes; standard resolves ask→deny), queue depth behavior.
- **Unit (Rust):** allowlist filtering, rate limiter, pairing-code expiry, audit-log record shape.
- **Integration (gated, like `RUN_OLLAMA_TESTS`):** `RUN_TELEGRAM_TESTS=1` against a real bot token — round-trip message → turn → reply.
- **Manual acceptance per channel:** pairing flow, non-allowlisted sender silently dropped, kill switch mid-turn, reply chunking on a long answer, `/stop` cancels a running turn.

---

## 8. Open Questions

1. **Multi-window / multiple workspaces:** v1 binds the bridge to the focused/most-recent window's workspace; is a channel→workspace pinning UI needed sooner?
2. **Telegram/Discord outages & token revocation:** adapter health surfaces it, but should the app notify the phone-side user proactively on reconnect?
3. **Audit log rotation:** size cap / retention for `remote-audit.jsonl`.
4. **iMessage send without AppleScript** (Shortcuts CLI?) if Apple further locks down `osascript` targeting Messages.
