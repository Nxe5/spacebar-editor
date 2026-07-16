<script lang="ts">
  import { workbench, activeWorkbenchTab, activeEditorFile, type WorkbenchTab } from "$lib/stores/workbench";
  import { files } from "$lib/stores/files";
  import { normalizeFilePath } from "$lib/fsPath";
  import { readFile, getLanguageFromPath, isTauriAvailable } from "$lib/ipc";
  import EditorSurface from "../editor/EditorSurface.svelte";
  import TerminalPane from "../terminal/TerminalPane.svelte";
  import PreviewPane from "../preview/PreviewPane.svelte";

  /** Load buffer when a tab exists but the files store lost sync (e.g. after hydration race). */
  $effect(() => {
    const tab = $activeWorkbenchTab;
    if (tab?.kind !== "editor" || !isTauriAvailable()) return;

    const key = normalizeFilePath(tab.path);
    const open = $files.openFiles.find((f) => normalizeFilePath(f.path) === key);
    if (open) return;

    let cancelled = false;
    void readFile(null, key)
      .then((content) => {
        if (cancelled) return;
        workbench.openEditorFile({
          path: key,
          name: key.split("/").pop() ?? key,
          content,
          isDirty: false,
          language: getLanguageFromPath(key),
        });
      })
      .catch((e) => console.error("Failed to load editor file:", e));

    return () => {
      cancelled = true;
    };
  });

  let editorPaths = $derived(
    $workbench.tabs
      .filter((t): t is Extract<WorkbenchTab, { kind: "editor" }> => t.kind === "editor")
      .map((t) => normalizeFilePath(t.path))
  );

  let terminalTabs = $derived(
    $workbench.tabs.filter(
      (t): t is Extract<WorkbenchTab, { kind: "terminal" }> => t.kind === "terminal"
    )
  );

  let previewUrl = $derived(
    $activeWorkbenchTab?.kind === "preview" ? $activeWorkbenchTab.url : ""
  );

  let previewPaneKey = $derived(
    $activeWorkbenchTab?.kind === "preview" ? $activeWorkbenchTab.id : "none"
  );
</script>

<div class="center-workbench flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
  <div class="center-workbench__main relative min-h-0 flex-1 overflow-hidden">
    <EditorSurface
      {editorPaths}
      editorTab={$activeWorkbenchTab}
      editorFile={$activeEditorFile}
    />

    {#each terminalTabs as tab (tab.id)}
      <div
        class="absolute inset-0 z-10 flex min-h-0 flex-col bg-background"
        style:display={$activeWorkbenchTab?.id === tab.id ? undefined : "none"}
      >
        <TerminalPane
          sessionId={tab.sessionId}
          active={$activeWorkbenchTab?.id === tab.id}
          onExit={() => workbench.closeTab(tab.id)}
        />
      </div>
    {/each}

    {#if $activeWorkbenchTab?.kind === "preview"}
      <div class="absolute inset-0 z-10 bg-background">
        {#key previewPaneKey}
          <PreviewPane initialUrl={previewUrl} />
        {/key}
      </div>
    {/if}
  </div>
</div>

<style>
  .center-workbench,
  .center-workbench__main {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .center-workbench__main :global(.editor-surface) {
    flex: 1 1 0;
    min-height: 0;
  }
</style>
