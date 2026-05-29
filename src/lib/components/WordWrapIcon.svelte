<script lang="ts">
  let {
    size = 15,
    dimmed = true,
  }: {
    size?: number;
    dimmed?: boolean;
  } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
  class="status-svg-icon"
  class:status-svg-icon--dimmed={dimmed}
>
  <path
    d="M3 7h7M3 12h9M3 17h5"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
  />
  <path
    d="M13 12h8M19 10l2 2-2 2M13 12l-2-2 2 2 2-2"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>

<style>
  .status-svg-icon {
    display: block;
    flex-shrink: 0;
    color: var(--foreground);
    opacity: 1;
    pointer-events: none;
    transition: opacity 0.15s ease;
  }

  .status-svg-icon--dimmed {
    opacity: 0.38;
  }
</style>
