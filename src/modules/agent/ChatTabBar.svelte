<script lang="ts">
  import { chat } from "$lib/stores/chat";
  import { isTauriAvailable, sendToHarness } from "$lib/ipc";
  import ShellTabBubble from "../workbench/ShellTabBubble.svelte";
  import MessageSquare from "@lucide/svelte/icons/message-square";
  import Plus from "@lucide/svelte/icons/plus";

  let tabScroll: HTMLDivElement;

  function newChat() {
    chat.newSession();
    if (isTauriAvailable()) {
      sendToHarness("clear", {}).catch(() => {});
    }
  }

  $effect(() => {
    if (tabScroll && $chat.activeSessionId) {
      const el = tabScroll.querySelector(`[data-session="${$chat.activeSessionId}"]`);
      el?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  });
</script>

<div class="chat-tab-bar-root">
  <div class="tabs-scroll" bind:this={tabScroll} role="tablist" aria-label="Chat sessions">
    {#each $chat.sessions as session (session.id)}
      <div class="hdr-tab-slot" data-session={session.id}>
        <ShellTabBubble
          title={session.title}
          active={session.id === $chat.activeSessionId}
          allowMiddleClose
          onActivate={() => chat.setActiveSession(session.id)}
          onClose={() => chat.closeSession(session.id)}
        >
          {#snippet icon()}
            <MessageSquare />
          {/snippet}
        </ShellTabBubble>
      </div>
    {/each}
  </div>
  <button type="button" class="hdr-tab-aux-btn" onclick={newChat} title="New chat" aria-label="New chat">
    <Plus />
  </button>
</div>

<style>
  .chat-tab-bar-root {
    display: flex;
    align-items: center;
    gap: 4px;
    box-sizing: border-box;
    height: 100%;
    min-height: 0;
    min-width: 0;
    padding: 0 3px 0 1px;
    border: none;
    outline: none;
    box-shadow: none;
  }

  .tabs-scroll {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 4px;
    overflow-x: auto;
    overflow-y: hidden;
    min-width: 0;
    scrollbar-width: thin;
  }

  .hdr-tab-slot {
    flex: 0 0 auto;
  }

  .hdr-tab-aux-btn {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: 9999px;
    background: var(--secondary);
    color: var(--muted-foreground);
    cursor: pointer;
  }

  .hdr-tab-aux-btn:hover {
    background: var(--muted);
    color: var(--foreground);
  }

  .hdr-tab-aux-btn :global(svg) {
    width: 12px;
    height: 12px;
  }

  .hdr-tab-aux-btn:focus-visible {
    outline: 1px solid var(--ring);
    outline-offset: 2px;
  }
</style>
