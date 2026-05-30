<script lang="ts">
  import { onMount } from "svelte";

  let disconnected = $state(false);

  onMount(() => {
    if (!import.meta.env.DEV) return;

    const hot = import.meta.hot;
    if (!hot) return;

    const onDisconnect = () => {
      disconnected = true;
    };
    const onConnect = () => {
      disconnected = false;
    };

    hot.on("vite:ws:disconnect", onDisconnect);
    hot.on("vite:ws:connect", onConnect);

    return () => {
      hot.off("vite:ws:disconnect", onDisconnect);
      hot.off("vite:ws:connect", onConnect);
    };
  });

  function reload() {
    window.location.reload();
  }
</script>

{#if disconnected}
  <div class="dev-vite-reconnect" role="alert">
    <p>Lost connection to the dev server. The webview may look blank until you reload.</p>
    <button type="button" class="dev-vite-reconnect__btn" onclick={reload}>Reload app</button>
  </div>
{/if}

<style>
  .dev-vite-reconnect {
    position: fixed;
    inset: 0;
    z-index: 99999;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 2rem;
    background: rgba(0, 0, 0, 0.85);
    color: #f0f0f0;
    text-align: center;
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .dev-vite-reconnect__btn {
    font: inherit;
    padding: 0.5rem 1.25rem;
    border-radius: 6px;
    border: 1px solid #4dabf7;
    background: #007acc;
    color: #fff;
    cursor: pointer;
  }

  .dev-vite-reconnect__btn:hover {
    filter: brightness(1.1);
  }
</style>
