<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    active = false,
    title,
    icon,
    dirty = false,
    onActivate,
    onClose,
    allowMiddleClose = false,
  }: {
    active?: boolean;
    title: string;
    icon: Snippet;
    dirty?: boolean;
    onActivate: () => void;
    onClose: (e: MouseEvent) => void;
    allowMiddleClose?: boolean;
  } = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="hdr-tab"
  class:hdr-tab--active={active}
  onmousedown={(e) => {
    if (allowMiddleClose && e.button === 1) {
      e.preventDefault();
      onClose(e);
    }
  }}
>
  <button
    type="button"
    class="hdr-tab__main"
    role="tab"
    aria-selected={active}
    tabindex={active ? 0 : -1}
    onclick={onActivate}
    {title}
  >
    <span class="hdr-tab__icon">{@render icon()}</span>
    <span class="hdr-tab__label">{title}</span>
    {#if dirty}<span class="hdr-tab__dirty" aria-hidden="true">●</span>{/if}
  </button>
  <button
    type="button"
    class="hdr-tab__close"
    aria-label="Close tab"
    onclick={(e) => {
      e.stopPropagation();
      onClose(e);
    }}
  >
    ×
  </button>
</div>

<style>
  .hdr-tab {
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    flex: 0 0 auto;
    max-width: min(168px, 28vw);
    min-width: 0;
    flex-shrink: 0;
    border-radius: 4px;
    border: 1px solid transparent;
    background: var(--secondary);
    color: var(--muted-foreground);
    box-sizing: border-box;
    overflow: hidden;
  }

  .hdr-tab--active {
    background: var(--muted);
    border-color: transparent;
    color: var(--foreground);
  }

  .hdr-tab:hover:not(.hdr-tab--active) {
    background: var(--muted);
  }

  .hdr-tab__main {
    display: flex;
    min-width: 0;
    flex: 1 1 auto;
    align-items: center;
    gap: 4px;
    padding: 2px 0 2px 6px;
    border: none;
    border-radius: 0;
    background: transparent;
    color: inherit;
    font-size: 11px;
    line-height: 1.2;
    cursor: pointer;
    text-align: left;
  }

  .hdr-tab--active .hdr-tab__main {
    color: var(--foreground);
  }

  .hdr-tab__icon {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 12px;
    opacity: 0.92;
  }

  .hdr-tab__icon :global(svg) {
    width: 11px;
    height: 11px;
    flex-shrink: 0;
  }

  .hdr-tab__label {
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hdr-tab__dirty {
    flex-shrink: 0;
    font-size: 8px;
    line-height: 1;
    color: var(--primary);
  }

  .hdr-tab__close {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 16px;
    min-width: 16px;
    margin: 0;
    padding: 0;
    border: none;
    border-radius: 0;
    background: transparent;
    color: var(--muted-foreground);
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.12s ease, color 0.12s ease;
  }

  .hdr-tab:hover .hdr-tab__close,
  .hdr-tab:focus-within .hdr-tab__close {
    opacity: 1;
  }

  .hdr-tab__close:hover,
  .hdr-tab__close:focus-visible {
    color: #f48771;
    background: transparent;
  }
</style>
