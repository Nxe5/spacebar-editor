<script lang="ts">
  import { workbench, activeWorkbenchTab, type WorkbenchTab } from "$lib/stores/workbench";
  import { activeFile } from "$lib/stores/files";
  import { normalizeFilePath } from "$lib/fsPath";
  import EditorSurface from "../editor/EditorSurface.svelte";
  import TerminalPane from "../terminal/TerminalPane.svelte";
  import PreviewPane from "../preview/PreviewPane.svelte";

  let editorPaths = $derived(
    $workbench.tabs.filter((t): t is Extract<WorkbenchTab, { kind: "editor" }> => t.kind === "editor").map((t) => t.path)
  );

  let previewUrl = $derived(
    $activeWorkbenchTab?.kind === "preview" ? $activeWorkbenchTab.url : ""
  );
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
  <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
    <EditorSurface activeTab={$activeWorkbenchTab} activeFile={$activeFile} {editorPaths} />

    {#if $activeWorkbenchTab?.kind === "terminal"}
      <div class="absolute inset-0 z-10 flex min-h-0 flex-col bg-background">
        {#key $activeWorkbenchTab.sessionId}
          <TerminalPane
            sessionId={$activeWorkbenchTab.sessionId}
            onExit={() => workbench.closeTab($activeWorkbenchTab.id)}
          />
        {/key}
      </div>
    {/if}

    {#if $activeWorkbenchTab?.kind === "preview"}
      <div class="absolute inset-0 z-10 bg-background">
        {#key previewUrl}
          <PreviewPane initialUrl={previewUrl || "http://127.0.0.1:5173"} />
        {/key}
      </div>
    {/if}
  </div>
</div>
