<script lang="ts">
  import SystemPromptsManager from "$lib/components/SystemPromptsManager.svelte";
</script>

<div class="prompt-panel">
  <SystemPromptsManager variant="sidebar" />
</div>

<style>
  .prompt-panel {
    display: flex;
    flex-direction: column;
    flex: 1;
    height: 100%;
    min-height: 0;
  }
</style>
