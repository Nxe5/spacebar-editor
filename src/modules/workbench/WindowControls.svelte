<script lang="ts">
  import { onMount } from "svelte";
  import MinusIcon from "phosphor-svelte/lib/MinusIcon";
  import SquareIcon from "phosphor-svelte/lib/SquareIcon";
  import CopyIcon from "phosphor-svelte/lib/CopyIcon";
  import XIcon from "phosphor-svelte/lib/XIcon";
  import { isTauriAvailable } from "$lib/ipc";
  import {
    closeAppWindow,
    isAppWindowMaximized,
    isMacPlatform,
    minimizeAppWindow,
    toggleMaximizeAppWindow,
  } from "$lib/windowControls";

  let maximized = $state(false);

  async function refreshMaximized() {
    maximized = await isAppWindowMaximized();
  }

  onMount(() => {
    if (!isTauriAvailable()) return;

    void refreshMaximized();

    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      void win.onResized(() => {
        void refreshMaximized();
      }).then((fn) => {
        unlisten = fn;
      });
    });

    return () => {
      unlisten?.();
    };
  });

  function onMinimize() {
    void minimizeAppWindow();
  }

  function onToggleMaximize() {
    void toggleMaximizeAppWindow().then((next) => {
      maximized = next;
    });
  }

  function onClose() {
    void closeAppWindow();
  }
</script>

{#if isTauriAvailable() && !isMacPlatform()}
  <!-- macOS uses native traffic lights (titleBarStyle: Overlay); custom controls are Windows/Linux only. -->
  <div class="window-controls" role="toolbar" aria-label="Window controls">
    <button type="button" class="window-control" title="Minimize" aria-label="Minimize" onclick={onMinimize}>
      <MinusIcon size={12} weight="bold" />
    </button>
    <button
      type="button"
      class="window-control"
      title={maximized ? "Restore" : "Maximize"}
      aria-label={maximized ? "Restore" : "Maximize"}
      onclick={onToggleMaximize}
    >
      {#if maximized}
        <CopyIcon size={11} weight="bold" />
      {:else}
        <SquareIcon size={11} weight="bold" />
      {/if}
    </button>
    <button
      type="button"
      class="window-control window-control--close"
      title="Close"
      aria-label="Close"
      onclick={onClose}
    >
      <XIcon size={12} weight="bold" />
    </button>
  </div>
{/if}

<style>
  .window-controls {
    display: flex;
    align-items: stretch;
    flex-shrink: 0;
    height: 100%;
  }

  .window-control {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 100%;
    padding: 0;
    border: none;
    border-radius: 0;
    background: transparent;
    color: var(--muted-foreground);
    cursor: default;
  }

  .window-control:hover {
    background: color-mix(in srgb, var(--accent) 65%, transparent);
    color: var(--foreground);
  }

  .window-control--close:hover {
    background: #e34671;
    color: #fff;
  }

  .window-control:focus-visible {
    outline: 1px solid var(--ring);
    outline-offset: -1px;
  }

  .window-control :global(svg) {
    flex-shrink: 0;
  }
</style>
