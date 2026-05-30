<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import { Compartment } from "@codemirror/state";
  import { EditorView } from "@codemirror/view";
  import type { OpenFile } from "$lib/stores/files";
  import type { WorkbenchTab } from "$lib/stores/workbench";
  import { files } from "$lib/stores/files";
  import { settings } from "$lib/stores/settings";
  import { syntaxTheme } from "$lib/stores/syntaxTheme";
  import { writeFile } from "$lib/ipc";
  import { loadCodeMirror, type CodeMirrorKit } from "$lib/editor/loadCodeMirror";
  import { gitDiffHighlightExtension } from "$lib/editor/diffDecorations";
  import { formatWithPrettier } from "$lib/editor/formatDocument";
  import { EditorState } from "@codemirror/state";

  interface Props {
    editorTab: WorkbenchTab | null;
    editorFile: OpenFile | null;
    editorPaths: string[];
  }

  let props: Props = $props();

  let editorContainer: HTMLDivElement | undefined = $state();
  let editorView: EditorView | null = null;
  const states = new Map<string, EditorState>();
  /** Tracks wrap mode used when each path's EditorState was built. */
  const stateWrapByPath = new Map<string, boolean>();
  const wrapCompartment = new Compartment();
  let kit: CodeMirrorKit | null = $state(null);
  let resizeObserver: ResizeObserver | null = null;
  /** 1-indexed line to scroll to once the matching path becomes active. */
  const pendingGotoByPath = new Map<string, number>();

  function applyGoto(path: string) {
    const line = pendingGotoByPath.get(path);
    if (line == null || !editorView) return;
    pendingGotoByPath.delete(path);
    const doc = editorView.state.doc;
    const clamped = Math.min(Math.max(line, 1), doc.lines);
    const pos = doc.line(clamped).from;
    editorView.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: "center" }),
    });
    editorView.focus();
  }

  function onGotoLineEvent(e: Event) {
    const detail = (e as CustomEvent<{ path: string; line: number }>).detail;
    if (!detail?.path || typeof detail.line !== "number") return;
    const path = detail.path;
    pendingGotoByPath.set(path, detail.line);
    const tagged = (editorView as unknown as { __tinyPath?: string })?.__tinyPath;
    if (tagged === path) void tick().then(() => applyGoto(path));
  }

  function pruneStates(paths: string[]) {
    const allowed = new Set(paths);
    for (const key of [...states.keys()]) {
      if (!allowed.has(key)) {
        states.delete(key);
        stateWrapByPath.delete(key);
      }
    }
  }

  function wrapExtension(enabled: boolean) {
    return wrapCompartment.of(enabled ? EditorView.lineWrapping : []);
  }

  function editorTheme(cm: CodeMirrorKit) {
    return cm.EditorView.theme(
      {
        "&": {
          height: "100%",
          minHeight: "0",
          maxHeight: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--editor-bg, #181818)",
        },
        ".cm-scroller": {
          height: "100%",
          overflow: "auto",
        },
        ".cm-content": {
          fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
          fontSize: "14px",
        },
        "&.cm-lineWrapping .cm-line": {
          whiteSpace: "break-spaces",
          wordBreak: "break-word",
        },
        ".cm-gutters": {
          backgroundColor: "var(--editor-bg, #181818)",
          color: "var(--editor-gutter-fg, #a0a0a0)",
          border: "none",
        },
        ".cm-activeLineGutter": {
          backgroundColor: "var(--editor-line-hl, #262626)",
        },
        ".cm-activeLine": {
          backgroundColor: "var(--editor-line-hl, #262626)",
        },
        ".cm-selectionBackground": {
          backgroundColor: "var(--editor-selection, #404040) !important",
        },
        "&.cm-focused .cm-cursor": {
          borderLeftColor: "var(--editor-cursor, var(--editor-fg, #e4e4e4))",
        },
      },
      { dark: true }
    );
  }

  function createState(cm: CodeMirrorKit, file: OpenFile, wordWrap: boolean) {
    const langExt = cm.languageExtensions[file.language];
    const lang = langExt != null ? [langExt] : [];
    const diffMode = file.diffBase !== undefined;
    const diffExt = diffMode
      ? [
          gitDiffHighlightExtension(() => file.diffBase),
          EditorState.readOnly.of(true),
        ]
      : [];
    return cm.EditorState.create({
      doc: file.content,
      extensions: [
        ...cm.editorBaseSetup,
        ...lang,
        ...diffExt,
        cm.syntaxHighlighting,
        cm.scrollPastEnd(),
        wrapExtension(wordWrap),
        cm.EditorView.updateListener.of((update) => {
          if (update.docChanged && !diffMode) {
            files.updateFileContent(file.path, update.state.doc.toString());
            states.set(file.path, update.state);
          }
        }),
        editorTheme(cm),
      ],
    });
  }

  function reconfigureWrap(enabled: boolean) {
    if (!editorView) return;
    editorView.dispatch({
      effects: wrapCompartment.reconfigure(enabled ? EditorView.lineWrapping : []),
    });
  }

  /** Re-highlight when syntax colors change in Settings (CSS vars update on :root). */
  $effect(() => {
    void $syntaxTheme;
    if (editorView) {
      editorView.requestMeasure();
    }
  });

  $effect(() => {
    reconfigureWrap($settings.editor.wordWrap);
  });

  $effect(() => {
    pruneStates(props.editorPaths);
  });

  $effect(() => {
    if (!kit || !editorContainer) return;
    const activeTab = props.editorTab;
    const activeFile = props.editorFile;
    if (activeTab?.kind !== "editor" || !activeFile) return;

    const path = activeFile.path;
    const wordWrap = $settings.editor.wordWrap;

    if (editorView) {
      const tagged = (editorView as unknown as { __tinyPath?: string }).__tinyPath;
      if (tagged && tagged !== path) {
        states.set(tagged, editorView.state);
      }
    }

    let nextState = states.get(path);
    const wrapStale = stateWrapByPath.get(path) !== wordWrap;
    if (!nextState || nextState.doc.toString() !== activeFile.content || wrapStale) {
      nextState = createState(kit, activeFile, wordWrap);
      states.set(path, nextState);
      stateWrapByPath.set(path, wordWrap);
    }

    if (!editorView) {
      editorView = new kit.EditorView({
        state: nextState,
        parent: editorContainer,
      });
    } else {
      editorView.setState(nextState);
    }
    (editorView as unknown as { __tinyPath?: string }).__tinyPath = path;
    reconfigureWrap(wordWrap);

    void tick().then(() => {
      editorView?.requestMeasure();
      applyGoto(path);
    });
  });

  function relayoutEditor() {
    if (!editorView || !editorContainer) return;
    const h = editorContainer.clientHeight;
    if (h > 0) {
      editorView.scrollDOM.style.minHeight = `${h}px`;
    }
    editorView.requestMeasure();
  }

  $effect(() => {
    if (props.editorTab?.kind === "editor" && editorView) {
      void tick().then(() => relayoutEditor());
    }
  });

  async function formatActiveBuffer(): Promise<boolean> {
    const activeFile = props.editorFile;
    if (!editorView || !activeFile || activeFile.diffBase !== undefined) return false;
    const content = editorView.state.doc.toString();
    const formatted = await formatWithPrettier(content, activeFile.path);
    if (formatted === null || formatted === content) return formatted !== null;
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: formatted },
    });
    files.updateFileContent(activeFile.path, formatted);
    states.set(activeFile.path, editorView.state);
    window.dispatchEvent(new CustomEvent("tinyllama:format-document-done"));
    return true;
  }

  async function saveActive() {
    const activeTab = props.editorTab;
    const activeFile = props.editorFile;
    if (activeTab?.kind !== "editor" || !activeFile || !editorView) return;
    try {
      if ($settings.editor.formatOnSave && activeFile.diffBase === undefined) {
        await formatActiveBuffer();
      }
      const content = editorView.state.doc.toString();
      await writeFile(activeFile.path, content);
      files.markSaved(activeFile.path);
      window.dispatchEvent(new CustomEvent("tinyllama:editor-saved"));
    } catch (e) {
      console.error(e);
    }
  }

  function onGlobalKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      void saveActive();
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "F") {
      e.preventDefault();
      void formatActiveBuffer();
    }
  }

  function onFormatDocumentEvent() {
    void formatActiveBuffer();
  }

  onMount(() => {
    void loadCodeMirror().then((loaded) => {
      kit = loaded;
    });

    resizeObserver = new ResizeObserver(() => {
      relayoutEditor();
    });

    window.addEventListener("tinyllama:format-document", onFormatDocumentEvent);
    window.addEventListener("tinyllama:goto-line", onGotoLineEvent);
  });

  $effect(() => {
    if (!resizeObserver || !editorContainer) return;
    resizeObserver.observe(editorContainer);
    return () => resizeObserver?.unobserve(editorContainer);
  });

  onDestroy(() => {
    window.removeEventListener("tinyllama:format-document", onFormatDocumentEvent);
    window.removeEventListener("tinyllama:goto-line", onGotoLineEvent);
    resizeObserver?.disconnect();
    resizeObserver = null;
    editorView?.destroy();
    editorView = null;
  });
</script>

<svelte:window onkeydown={onGlobalKeydown} />

<div
  class="editor-surface"
  class:editor-surface--hidden={props.editorTab != null && props.editorTab.kind !== "editor"}
  data-testid="editor-surface"
>
  <div class="editor-surface__cm" bind:this={editorContainer} data-testid="editor-cm-host"></div>
  {#if props.editorTab?.kind === "editor" && !props.editorFile}
    <div class="editor-surface__empty pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-muted-foreground">
      <p class="text-sm">No file open</p>
      <p class="text-xs">Select a file from the explorer</p>
    </div>
  {:else if props.editorTab?.kind === "editor" && props.editorFile && !kit}
    <div class="editor-surface__empty pointer-events-none absolute inset-0 flex items-center justify-center text-muted-foreground">
      <p class="text-sm">Loading editor…</p>
    </div>
  {/if}
</div>

<style>
  .editor-surface {
    position: relative;
    flex: 1 1 0;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    background: var(--editor-bg, #1e1e1e);
  }

  .editor-surface--hidden {
    visibility: hidden;
    position: absolute;
    inset: 0;
    width: 0;
    height: 0;
    overflow: hidden;
    pointer-events: none;
    flex: none;
  }

  .editor-surface__cm {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }

  .editor-surface__cm :global(.cm-editor) {
    height: 100%;
  }

  .editor-surface__cm :global(.cm-scroller) {
    height: 100%;
    font-family: "JetBrains Mono", "Fira Code", ui-monospace, monospace;
  }
</style>
