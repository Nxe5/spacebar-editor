<script lang="ts">
  /** Official Prettier logomark (prettier/prettier-logo, MIT). */
  let {
    size = 15,
    dimmed = false,
  }: {
    size?: number;
    dimmed?: boolean;
  } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 210 210"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
  class="status-svg-icon"
  class:status-svg-icon--dimmed={dimmed}
>
  <g fill-rule="evenodd">
    <rect fill="#56B3B4" x="165" y="40" width="20" height="10" rx="5" />
    <rect fill="#EA5E5E" x="15" y="200" width="60" height="10" rx="5" />
    <rect fill="#BF85BF" x="135" y="120" width="40" height="10" rx="5" />
    <rect fill="#EA5E5E" x="75" y="120" width="50" height="10" rx="5" />
    <rect fill="#56B3B4" x="15" y="120" width="50" height="10" rx="5" />
    <rect fill="#BF85BF" x="15" y="160" width="60" height="10" rx="5" />
    <rect fill="#BF85BF" x="15" y="80" width="60" height="10" rx="5" />
    <rect fill="#F7BA3E" x="65" y="20" width="110" height="10" rx="5" />
    <rect fill="#EA5E5E" x="15" y="20" width="40" height="10" rx="5" />
    <rect fill="#F7BA3E" x="55" y="180" width="20" height="10" rx="5" />
    <rect fill="#56B3B4" x="55" y="60" width="20" height="10" rx="5" />
    <rect fill="#56B3B4" x="15" y="180" width="30" height="10" rx="5" />
    <rect fill="#F7BA3E" x="15" y="60" width="30" height="10" rx="5" />
    <rect fill="#56B3B4" x="95" y="100" width="90" height="10" rx="5" />
    <rect fill="#F7BA3E" x="45" y="100" width="40" height="10" rx="5" />
    <rect fill="#EA5E5E" x="15" y="100" width="20" height="10" rx="5" />
    <rect fill="#BF85BF" x="105" y="40" width="50" height="10" rx="5" />
    <rect fill="#56B3B4" x="15" y="40" width="80" height="10" rx="5" />
    <rect fill="#F7BA3E" x="45" y="140" width="100" height="10" rx="5" />
    <rect fill="#BF85BF" x="15" y="140" width="20" height="10" rx="5" />
    <rect fill="#EA5E5E" x="135" y="60" width="60" height="10" rx="5" />
    <rect fill="#F7BA3E" x="135" y="80" width="60" height="10" rx="5" />
    <rect fill="#56B3B4" x="15" y="0" width="130" height="10" rx="5" />
  </g>
</svg>

<style>
  .status-svg-icon {
    display: block;
    flex-shrink: 0;
    opacity: 1;
    pointer-events: none;
    transition: opacity 0.15s ease;
  }

  .status-svg-icon--dimmed {
    opacity: 0.38;
  }
</style>
