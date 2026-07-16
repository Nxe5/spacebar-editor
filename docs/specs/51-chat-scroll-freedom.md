# Spec 51 — Chat Scroll Freedom During Streaming

> **Status:** ✅ **Implemented**
> **Area:** Chat pane
> **Related:** `src/modules/agent/ChatPane.svelte`

---

## 1. Problem

While an agent run is streaming, the chat pane **forces the scroll position to the bottom on every update**. Scrolling up to reread earlier output immediately tosses the user back down. Long agent runs (minutes of tool calls) make earlier context effectively unreadable until the run ends.

## 2. Root Cause

Two `$effect`s in `ChatPane.svelte` unconditionally set `messagesContainer.scrollTop = scrollHeight` whenever messages, `streamingContent`, or `liveTurn` changed — with no notion of whether the user had scrolled away.

## 3. Fix — sticky-bottom auto-scroll

Standard chat UX (VS Code Copilot, Slack, terminals):

- **Pinned** (default): the view follows the stream.
- A `scroll` listener on the messages container computes distance from the bottom; scrolling further than **48 px** from the bottom **unpins** — auto-scroll stops.
- Scrolling back to within 48 px of the bottom **re-pins**.
- Sending or editing-and-resending a message always re-pins (a user action that implies "follow the new reply").

Programmatic bottom-scrolls re-enter the listener at distance 0, so pinning is self-consistent. No new settings; behavior is intrinsic.

## 4. Acceptance

- During a streaming run, scroll up: position holds while tokens keep arriving.
- Scroll back to the bottom: following resumes.
- Sending a new message from a scrolled-up position jumps to the bottom and follows.
- Idle chat behaves as before (new messages scroll into view).

## 5. Future (not in scope)

- A "jump to bottom ↓" floating affordance with unread indicator while unpinned.
- Virtualized message list for very long sessions (see [52](52-agent-run-stability.md) §6).
