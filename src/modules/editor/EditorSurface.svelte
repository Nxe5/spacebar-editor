<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import type { OpenFile } from "$lib/stores/files";
  import type { WorkbenchTab } from "$lib/stores/workbench";
  import { files } from "$lib/stores/files";
  import { writeFile } from "$lib/ipc";

  interface Props {
    activeTab: WorkbenchTab | null;
    activeFile: OpenFile | null;
    editorPaths: string[];
  }

  let { activeTab, activeFile, editorPaths }: Props = $props();

  let editorContainer: HTMLDivElement | undefined = $state();
  let editorView: import("@codemirror/view").EditorView | null = null;
  const states = new Map<string, import("@codemirror/state").EditorState>();

  let EditorState: typeof import("@codemirror/state").EditorState;
  let EditorViewCtor: typeof import("@codemirror/view").EditorView;
  let scrollPastEnd: typeof import("@codemirror/view").scrollPastEnd;
  let basicSetup: typeof import("codemirror").basicSetup;
  let languageExtensions: Record<string, unknown> = {};
  let cmReady = $state(false);

  function pruneStates() {
    const allowed = new Set(editorPaths);
    for (const key of [...states.keys()]) {
      if (!allowed.has(key)) states.delete(key);
    }
  }

  function editorTheme() {
    return EditorViewCtor.theme(
      {
        "&": {
          height: "100%",
          minHeight: "0",
          maxHeight: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--editor-bg, #1e1e1e)",
          color: "var(--editor-fg, #d4d4d4)",
        },
        ".cm-scroller": {
          flex: "1 1 0",
          minHeight: "0",
          overflowX: "auto",
          overflowY: "auto",
        },
        ".cm-content": {
          fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
          fontSize: "14px",
        },
        ".cm-gutters": {
          backgroundColor: "var(--editor-bg, #1e1e1e)",
          color: "var(--editor-gutter-fg, #858585)",
          border: "none",
        },
        ".cm-activeLineGutter": {
          backgroundColor: "var(--editor-line-hl, #2a2d2e)",
        },
        ".cm-activeLine": {
          backgroundColor: "var(--editor-line-hl, #2a2d2e)",
        },
        ".cm-selectionBackground": {
          backgroundColor: "var(--editor-selection, #264f78) !important",
        },
        "&.cm-focused .cm-cursor": {
          borderLeftColor: "var(--editor-fg, #d4d4d4)",
        },
      },
      { dark: true }
    );
  }

  function listenerFor(path: string) {
    return EditorViewCtor.updateListener.of((update: import("@codemirror/view").ViewUpdate) => {
      if (update.docChanged) {
        files.updateFileContent(path, update.state.doc.toString());
        states.set(path, update.state);
      }
    });
  }

  function createState(file: OpenFile) {
    const langExt = languageExtensions[file.language];
    const lang = langExt != null ? [langExt as import("@codemirror/state").Extension] : [];
    return EditorState.create({
      doc: file.content,
      extensions: [basicSetup, scrollPastEnd!(), ...lang, listenerFor(file.path), editorTheme()],
    });
  }

  $effect(() => {
    editorPaths;
    pruneStates();
  });

  /** `cmReady` must be in the dependency graph: CodeMirror loads async, so `EditorViewCtor` alone does not retrigger this effect. */
  $effect(() => {
    if (!cmReady || !editorContainer || !EditorViewCtor) return;
    if (activeTab?.kind !== "editor" || !activeFile) return;

    const path = activeFile.path;

    if (editorView) {
      const tagged = (editorView as unknown as { __tinyPath?: string }).__tinyPath;
      if (tagged && tagged !== path) {
        states.set(tagged, editorView.state);
      }
    }

    let nextState = states.get(path);
    if (!nextState) {
      nextState = createState(activeFile);
      states.set(path, nextState);
    }

    if (!editorView) {
      editorView = new EditorViewCtor({
        state: nextState,
        parent: editorContainer,
      });
    } else {
      editorView.setState(nextState);
    }
    (editorView as unknown as { __tinyPath?: string }).__tinyPath = path;

    void tick().then(() => {
      editorView?.requestMeasure();
    });
  });

  async function saveActive() {
    if (activeTab?.kind !== "editor" || !activeFile || !editorView) return;
    try {
      const content = editorView.state.doc.toString();
      await writeFile(activeFile.path, content);
      files.markSaved(activeFile.path);
    } catch (e) {
      console.error(e);
    }
  }

  function onGlobalKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      void saveActive();
    }
  }

  onMount(async () => {
    const [stateModule, viewModule, setupModule, jsModule, htmlModule, cssModule, jsonModule, mdModule, rustModule, pythonModule] =
      await Promise.all([
        import("@codemirror/state"),
        import("@codemirror/view"),
        import("codemirror"),
        import("@codemirror/lang-javascript"),
        import("@codemirror/lang-html"),
        import("@codemirror/lang-css"),
        import("@codemirror/lang-json"),
        import("@codemirror/lang-markdown"),
        import("@codemirror/lang-rust"),
        import("@codemirror/lang-python"),
      ]);

    EditorState = stateModule.EditorState;
    EditorViewCtor = viewModule.EditorView;
    scrollPastEnd = viewModule.scrollPastEnd;
    basicSetup = setupModule.basicSetup;

    languageExtensions = {
      javascript: jsModule.javascript(),
      typescript: jsModule.javascript({ typescript: true }),
      html: htmlModule.html(),
      css: cssModule.css(),
      json: jsonModule.json(),
      markdown: mdModule.markdown(),
      rust: rustModule.rust(),
      python: pythonModule.python(),
    };
    cmReady = true;
  });

  onDestroy(() => {
    editorView?.destroy();
    editorView = null;
  });
</script>

<svelte:window onkeydown={onGlobalKeydown} />

<!-- Only hide when another workbench tab kind is explicitly active (null = show editor area). -->
<div
  class="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
  class:hidden={activeTab != null && activeTab.kind !== "editor"}
>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden" bind:this={editorContainer}></div>
  {#if !activeFile}
    <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-muted-foreground">
      <div class="opacity-30">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      </div>
      <p class="text-sm">No file open</p>
      <p class="text-xs">Select a file from the explorer</p>
    </div>
  {/if}
</div>
