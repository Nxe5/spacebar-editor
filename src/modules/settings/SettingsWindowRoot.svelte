<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { ModeWatcher } from "mode-watcher";
  import { settings } from "$lib/stores/settings";
  import { applyWorkbenchTheme } from "$lib/workbench-theme";
  import SettingsPane from "./SettingsPane.svelte";

  function onClose() {
    void getCurrentWindow().close();
  }

  $effect(() => {
    applyWorkbenchTheme($settings.workbenchTheme);
  });
</script>

<ModeWatcher />
<SettingsPane open={true} variant="page" {onClose} />
