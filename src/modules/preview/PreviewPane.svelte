<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { isLocalPreviewUrl } from "$lib/previewUrl";

  interface Props {
    /** When empty, show URL bar only until the user navigates. */
    initialUrl?: string;
  }

  let { initialUrl = "" }: Props = $props();

  let urlInput = $state("");
  let loadedUrl = $state("");
  let frameEl: HTMLIFrameElement | undefined = $state();

  $effect(() => {
    const raw = initialUrl.trim();
    urlInput = raw || "http://127.0.0.1:14200";
    loadedUrl = raw && isLocalPreviewUrl(raw) ? raw : "";
  });

  function reloadFrame() {
    if (!frameEl || !loadedUrl) return;
    frameEl.src = loadedUrl;
  }

  function navigate() {
    const raw = urlInput.trim();
    if (!isLocalPreviewUrl(raw)) return;
    loadedUrl = raw;
  }

  function openExternal() {
    if (!loadedUrl) return;
    window.open(loadedUrl, "_blank", "noopener,noreferrer");
  }
</script>

<div class="preview-pane flex h-full min-h-0 flex-1 flex-col gap-2 bg-background p-2">
  <div class="preview-pane__toolbar flex flex-wrap items-center gap-2 border-b border-transparent pb-2">
    <Input
      class="max-w-xl flex-1 font-mono text-xs"
      bind:value={urlInput}
      placeholder="http://127.0.0.1:14200"
      onkeydown={(e) => e.key === "Enter" && navigate()}
    />
    <Button variant="secondary" size="sm" onclick={navigate}>Go</Button>
    <Button variant="outline" size="sm" onclick={() => (urlInput = "http://127.0.0.1:3000")}>
      :3000
    </Button>
    <Button variant="outline" size="sm" onclick={() => (urlInput = "http://127.0.0.1:14200")}>
      :14200
    </Button>
    <Button variant="outline" size="sm" onclick={() => (urlInput = "http://127.0.0.1:5173")}>
      :5173
    </Button>
    <Button variant="ghost" size="sm" onclick={reloadFrame} disabled={!loadedUrl}>Reload</Button>
    <Button variant="ghost" size="sm" onclick={openExternal} disabled={!loadedUrl}>Browser</Button>
  </div>
  {#if !isLocalPreviewUrl(urlInput.trim()) && urlInput.trim().length > 0}
    <p class="text-xs text-destructive">
      Only <code class="rounded bg-muted px-1">http://localhost</code> and
      <code class="rounded bg-muted px-1">http://127.0.0.1</code> are allowed.
    </p>
  {/if}
  {#if loadedUrl}
    <iframe
      bind:this={frameEl}
      title="Preview"
      class="preview-pane__frame min-h-0 flex-1 w-full rounded-md border border-transparent bg-background"
      src={loadedUrl}
      sandbox="allow-scripts allow-same-origin allow-forms"
      referrerpolicy="no-referrer"
      allow=""
    ></iframe>
  {:else}
    <div
      class="preview-pane__empty flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground"
    >
      <p>Enter a localhost URL above and press Go.</p>
    </div>
  {/if}
</div>
