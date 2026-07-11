<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { isLocalPreviewUrl } from "$lib/previewUrl";
  import { untrack } from "svelte";
  import { settings } from "$lib/stores/settings";
  import ArrowLeftIcon from "phosphor-svelte/lib/ArrowLeftIcon";
  import ArrowRightIcon from "phosphor-svelte/lib/ArrowRightIcon";
  import ArrowClockwiseIcon from "phosphor-svelte/lib/ArrowClockwiseIcon";
  import CursorIcon from "phosphor-svelte/lib/CursorIcon";
  import { toast } from "svelte-sonner";

  interface Props {
    /** When empty, show URL bar only until the user navigates. */
    initialUrl?: string;
  }

  let { initialUrl = "" }: Props = $props();

  let urlInput = $state("");
  let loadedUrl = $state("");
  let frameEl: HTMLIFrameElement | undefined = $state();
  let inspecting = $state(false);
  let lastHovered: Element | null = null;

  let highlightColor = $derived($settings.inspectorHighlightColor || "#ff6b8b");

  $effect(() => {
    const raw = initialUrl.trim();
    urlInput = raw || "";
    loadedUrl = raw && isLocalPreviewUrl(raw) ? raw : "";
  });

  $effect(() => {
    void loadedUrl; // depend only on loadedUrl — use untrack for inspecting to avoid feedback loop
    if (untrack(() => inspecting)) stopInspecting();
  });

  function reloadFrame() {
    if (!frameEl || !loadedUrl) return;
    frameEl.src = loadedUrl;
  }

  function goBack() {
    try { frameEl?.contentWindow?.history.back(); } catch { /* cross-origin */ }
  }

  function goForward() {
    try { frameEl?.contentWindow?.history.forward(); } catch { /* cross-origin */ }
  }

  function navigate() {
    const raw = urlInput.trim();
    if (!isLocalPreviewUrl(raw)) return;
    if (inspecting) stopInspecting();
    loadedUrl = raw;
  }

  function toggleInspect() {
    if (inspecting) {
      stopInspecting();
    } else {
      startInspecting();
    }
  }

  function startInspecting() {
    if (!frameEl || !loadedUrl) {
      toast.info("Load a page first.");
      return;
    }
    let doc: Document | null = null;
    try {
      doc = frameEl.contentDocument;
    } catch {
      toast.error("Cannot inspect cross-origin pages.");
      return;
    }
    if (!doc || !doc.body) {
      toast.error("Page not ready — try after it loads.");
      return;
    }
    inspecting = true;
    injectStyle(doc, highlightColor);
    doc.addEventListener("mouseover", onHover, true);
    doc.addEventListener("mouseout", onOut, true);
    doc.addEventListener("click", onPick, true);
    doc.addEventListener("keydown", onEsc, true);
  }

  function stopInspecting() {
    inspecting = false;
    try {
      const doc = frameEl?.contentDocument;
      if (!doc) return;
      doc.getElementById("__sb_insp_style")?.remove();
      doc.removeEventListener("mouseover", onHover, true);
      doc.removeEventListener("mouseout", onOut, true);
      doc.removeEventListener("click", onPick, true);
      doc.removeEventListener("keydown", onEsc, true);
      if (lastHovered) {
        (lastHovered as HTMLElement).style.removeProperty("outline");
        (lastHovered as HTMLElement).style.removeProperty("outline-offset");
        lastHovered = null;
      }
    } catch { /* cross-origin */ }
  }

  function injectStyle(doc: Document, color: string) {
    doc.getElementById("__sb_insp_style")?.remove();
    const s = doc.createElement("style");
    s.id = "__sb_insp_style";
    s.textContent = `* { cursor: crosshair !important; } .__sb_hover { outline: 2px solid ${color} !important; outline-offset: 1px !important; }`;
    (doc.head ?? doc.documentElement).appendChild(s);
  }

  function onHover(e: Event) {
    if (lastHovered) lastHovered.classList.remove("__sb_hover");
    lastHovered = e.target as Element;
    lastHovered?.classList.add("__sb_hover");
  }

  function onOut(e: Event) {
    (e.target as Element)?.classList.remove("__sb_hover");
    if (lastHovered === e.target) lastHovered = null;
  }

  function onEsc(e: Event) {
    if ((e as KeyboardEvent).key === "Escape") stopInspecting();
  }

  function onPick(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    const el = e.target as HTMLElement;
    if (!el) { stopInspecting(); return; }

    const tag = el.tagName.toLowerCase();
    const classes = el.className && typeof el.className === "string"
      ? el.className.trim().split(/\s+/).filter(c => c && c !== "__sb_hover")
      : [];
    const cls = classes.length ? "." + classes.join(".") : "";
    const role = el.getAttribute("role") ? ` [role="${el.getAttribute("role")}"]` : "";
    const text = el.textContent?.trim().slice(0, 80) ?? "";
    const rect = el.getBoundingClientRect();
    const path = buildSelector(el);

    const msg = `[Selected element: ${tag}${cls}${role}
  Text: ${text ? `"${text}"` : "(none)"}
  Path: ${path}
  Position: top=${Math.round(rect.top)}px, left=${Math.round(rect.left)}px, ${Math.round(rect.width)}×${Math.round(rect.height)}px]`;

    window.dispatchEvent(new CustomEvent("spacebar:element-selected", { detail: { text: msg } }));
    stopInspecting();
  }

  function buildSelector(el: Element): string {
    const parts: string[] = [];
    let cur: Element | null = el;
    for (let i = 0; i < 5 && cur && cur.tagName !== "BODY" && cur.tagName !== "HTML"; i++) {
      let part = cur.tagName.toLowerCase();
      if (cur.id) { part += `#${cur.id}`; parts.unshift(part); break; }
      const cls = typeof cur.className === "string" && cur.className.trim()
        ? "." + cur.className.trim().split(/\s+/).slice(0, 2).join(".")
        : "";
      parts.unshift(part + cls);
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  }
</script>

<div class="preview-pane flex h-full min-h-0 flex-1 flex-col gap-2 bg-background p-2">
  <div class="preview-pane__toolbar flex flex-wrap items-center gap-1 border-b border-transparent pb-2">
    <!-- Back / Forward / Reload -->
    <Button variant="ghost" size="icon-sm" onclick={goBack} title="Go back" disabled={!loadedUrl} class="nav-btn preview-toolbar-btn">
      <ArrowLeftIcon size={14} />
    </Button>
    <Button variant="ghost" size="icon-sm" onclick={goForward} title="Go forward" disabled={!loadedUrl} class="nav-btn preview-toolbar-btn">
      <ArrowRightIcon size={14} />
    </Button>
    <Button variant="ghost" size="icon-sm" onclick={reloadFrame} title="Reload" disabled={!loadedUrl} class="nav-btn preview-toolbar-btn">
      <ArrowClockwiseIcon size={14} />
    </Button>

    <!-- URL bar -->
    <Input
      class="max-w-xl flex-1 font-mono text-xs"
      bind:value={urlInput}
      placeholder="http://127.0.0.1:3000"
      onkeydown={(e) => e.key === "Enter" && navigate()}
    />
    <Button variant="secondary" size="sm" onclick={navigate} class="preview-toolbar-btn">Go</Button>
    <Button variant="outline" size="sm" onclick={() => { urlInput = "http://127.0.0.1:3000"; navigate(); }} class="preview-toolbar-btn">:3000</Button>
    <Button variant="outline" size="sm" onclick={() => { urlInput = "http://127.0.0.1:14200"; navigate(); }} class="preview-toolbar-btn">:14200</Button>

    <!-- Spacer -->
    <span class="flex-1"></span>

    <!-- Select element -->
    <Button
      variant={inspecting ? "default" : "outline"}
      size="sm"
      onclick={toggleInspect}
      title={inspecting ? "Stop selecting (Esc)" : "Select an element to add to chat"}
      aria-pressed={inspecting}
      class="preview-toolbar-btn gap-1.5"
    >
      <CursorIcon size={14} />
      {inspecting ? "Stop" : "Select element"}
    </Button>
  </div>

  {#if !isLocalPreviewUrl(urlInput.trim()) && urlInput.trim().length > 0}
    <p class="text-xs text-destructive">
      Only <code class="rounded bg-muted px-1">http://localhost</code> and
      <code class="rounded bg-muted px-1">http://127.0.0.1</code> are allowed.
    </p>
  {/if}

  {#if loadedUrl}
    <div class="relative min-h-0 flex-1">
      <iframe
        bind:this={frameEl}
        title="Preview"
        class="preview-pane__frame h-full w-full rounded-md border border-transparent bg-background"
        src={loadedUrl}
        referrerpolicy="no-referrer"
      ></iframe>
      {#if inspecting}
        <div
          class="inspect-overlay"
          aria-hidden="true"
          style="border-color: {highlightColor};"
        >
          <span class="inspect-hint" style="background: {highlightColor};">
            Click an element · Esc to cancel
          </span>
        </div>
      {/if}
    </div>
  {:else}
    <div
      class="preview-pane__empty flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground"
    >
      <p>Enter a localhost URL above and press Go.</p>
    </div>
  {/if}
</div>

<style>
  .nav-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    flex-shrink: 0;
  }

  /* Browser preview toolbar — stronger hover/press than app-wide buttons. */
  .preview-pane__toolbar :global(.preview-toolbar-btn) {
    transition:
      background-color var(--motion-fast, 140ms),
      color var(--motion-fast, 140ms),
      border-color var(--motion-fast, 140ms),
      transform var(--motion-fast, 140ms);
  }

  .preview-pane__toolbar :global(.preview-toolbar-btn:hover:not(:disabled)) {
    background: color-mix(in srgb, var(--foreground) 14%, transparent) !important;
    color: var(--foreground) !important;
    border-color: color-mix(in srgb, var(--foreground) 28%, var(--border)) !important;
  }

  .preview-pane__toolbar :global(.preview-toolbar-btn:active:not(:disabled)) {
    background: color-mix(in srgb, var(--foreground) 22%, transparent) !important;
    transform: translateY(1px);
  }

  .preview-pane__toolbar :global(.preview-toolbar-btn[aria-pressed="true"]) {
    background: color-mix(in srgb, var(--primary) 88%, var(--foreground)) !important;
    color: var(--primary-foreground) !important;
  }

  .preview-pane__toolbar :global(.preview-toolbar-btn[aria-pressed="true"]:hover:not(:disabled)) {
    background: color-mix(in srgb, var(--primary) 78%, var(--foreground)) !important;
  }

  .inspect-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    border: 2px solid;
    border-radius: 6px;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 8px;
  }

  .inspect-hint {
    color: #000;
    font-size: 11px;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: 4px;
  }
</style>
