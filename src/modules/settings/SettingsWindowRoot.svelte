<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { ModeWatcher } from "mode-watcher";
  import { settings } from "$lib/stores/settings";
  import { applyWorkbenchTheme, normalizeWorkbenchTheme } from "$lib/workbench-theme";
  import { syntaxTheme } from "$lib/stores/syntaxTheme";
  import { editorChrome } from "$lib/stores/editorChrome";
  import { explorerAppearance } from "$lib/stores/explorerAppearance";
  import { chatAppearance } from "$lib/stores/chatAppearance";
  import { contextAppearance } from "$lib/stores/contextAppearance";
  import { workbenchChrome } from "$lib/stores/workbenchChrome";
  import WindowControls from "../workbench/WindowControls.svelte";
  import SettingsPane from "./SettingsPane.svelte";

  syntaxTheme.init();
  editorChrome.init();
  explorerAppearance.init();
  chatAppearance.init();
  try {
    contextAppearance.init();
  } catch (e) {
    console.error("[settings-window] contextAppearance init failed:", e);
  }
  workbenchChrome.init();

  function onClose() {
    void getCurrentWindow().close();
  }

  $effect(() => {
    applyWorkbenchTheme(normalizeWorkbenchTheme($settings.workbenchTheme));
  });
</script>

<ModeWatcher defaultMode="dark" darkClassNames={[]} lightClassNames={[]} />

<div class="settings-window flex h-screen flex-col overflow-hidden bg-background text-foreground">
  <header class="settings-titlebar">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="settings-titlebar__drag"
      data-tauri-drag-region
    >
      <span class="settings-titlebar__title" data-tauri-drag-region>Settings</span>
    </div>
    <WindowControls />
  </header>
  <div class="min-h-0 flex-1 overflow-hidden">
    <SettingsPane open={true} variant="page" {onClose} />
  </div>
</div>

<style>
  .settings-titlebar {
    display: flex;
    align-items: stretch;
    flex-shrink: 0;
    height: var(--workbench-titlebar-height);
    min-height: var(--workbench-titlebar-height);
    border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    background: color-mix(in srgb, var(--surface, var(--card)) 88%, var(--background) 12%);
  }

  .settings-titlebar__drag {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    padding: 0 12px;
    user-select: none;
  }

  .settings-titlebar__title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--muted-foreground);
  }
</style>
