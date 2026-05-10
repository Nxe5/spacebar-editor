<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";

  interface Props {
    /** Safe localhost preview URL */
    initialUrl?: string;
  }

  let { initialUrl = "http://127.0.0.1:5173" }: Props = $props();

  let urlInput = $state("");
  let loadedUrl = $state("");
  let frameEl: HTMLIFrameElement | undefined = $state();

  $effect(() => {
    urlInput = initialUrl;
  });

  function reloadFrame() {
    if (!frameEl || !loadedUrl) return;
    frameEl.src = loadedUrl;
  }

  function isAllowed(urlStr: string): boolean {
    let u: URL;
    try {
      u = new URL(urlStr.trim());
    } catch {
      return false;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1";
  }

  function navigate() {
    const raw = urlInput.trim();
    if (!isAllowed(raw)) return;
    loadedUrl = raw;
  }

  function openExternal() {
    if (!loadedUrl) return;
    window.open(loadedUrl, "_blank", "noopener,noreferrer");
  }
</script>

<div class="flex h-full min-h-0 flex-1 flex-col gap-2 bg-background p-2">
  <div class="flex flex-wrap items-center gap-2 border-b border-transparent pb-2">
    <Input class="max-w-xl flex-1 font-mono text-xs" bind:value={urlInput} placeholder="http://127.0.0.1:5173" onkeydown={(e) => e.key === "Enter" && navigate()} />
    <Button variant="secondary" size="sm" onclick={navigate}>Go</Button>
    <Button variant="outline" size="sm" onclick={() => (urlInput = "http://127.0.0.1:3000")}> :3000 </Button>
    <Button variant="outline" size="sm" onclick={() => (urlInput = "http://127.0.0.1:5173")}> :5173 </Button>
    <Button variant="ghost" size="sm" onclick={() => loadedUrl && (loadedUrl = loadedUrl)}>Reload</Button>
    <Button variant="ghost" size="sm" onclick={openExternal} disabled={!loadedUrl}>Browser</Button>
  </div>
  {#if !isAllowed(urlInput.trim()) && urlInput.trim().length > 0}
    <p class="text-xs text-destructive">Only <code class="rounded bg-muted px-1">http://localhost</code> and <code class="rounded bg-muted px-1">http://127.0.0.1</code> are allowed.</p>
  {/if}
  {#if loadedUrl}
    <iframe
      bind:this={frameEl}
      title="Preview"
      class="min-h-0 flex-1 w-full rounded-md border border-transparent bg-background"
      src={loadedUrl}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
    ></iframe>
  {:else}
    <div class="flex flex-1 items-center justify-center text-sm text-muted-foreground">Enter a localhost URL and press Go.</div>
  {/if}
</div>
