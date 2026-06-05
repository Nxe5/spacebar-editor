<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import { Compartment, type Extension } from "@codemirror/state";
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
  import { ensureLspServer, getDiagnosticsForUri } from "$lib/lsp/lspStore";
  import { applyLspDiagnostics, lspHoverExtension } from "$lib/lsp/lspCodeMirror";
  import {
    isLspEnabledForLanguage,
    getLspConfigForLanguage,
    resolvedLanguageForLsp,
  } from "$lib/lsp/lspSettings";

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
  /** Paths whose state already has its language grammar applied (grammars load async). */
  const langAppliedByPath = new Set<string>();
  const wrapCompartment = new Compartment();
  const languageCompartment = new Compartment();
  const lspHoverCompartment = new Compartment();
  /** Debounce timer for LSP didChange notifications. */
  let lspChangeTimer: ReturnType<typeof setTimeout> | null = null;
  /** Currently active LSP file URI (for change/close notifications). */
  let activeLspUri: string | null = null;
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
        langAppliedByPath.delete(key);
      }
    }
  }

  /** Destroy the live view so no buffer lingers when nothing is open (e.g. all
   *  tabs closed, or switching to a project with no files). The per-path state
   *  is saved first so reopening the file restores its cursor/scroll. */
  function teardownView() {
    if (!editorView) return;
    const tagged = (editorView as unknown as { __tinyPath?: string }).__tinyPath;
    if (tagged && props.editorPaths.includes(tagged)) {
      states.set(tagged, editorView.state);
    }
    editorView.destroy();
    editorView = null;
    activeLspUri = null;
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
          backgroundColor: "var(--editor-line-hl, rgba(255,255,255,0.04))",
        },
        ".cm-selectionBackground": {
          backgroundColor:
            "color-mix(in srgb, var(--editor-selection, #404040) 40%, transparent) !important",
        },
        ".cm-selectionMatch": {
          backgroundColor:
            "color-mix(in srgb, var(--editor-selection-match, var(--editor-selection, #404040)) 38%, transparent) !important",
        },
        ".cm-searchMatch .cm-selectionMatch": {
          backgroundColor: "transparent !important",
        },
        "&.cm-focused .cm-cursor": {
          borderLeftColor: "var(--editor-cursor, var(--editor-fg, #e4e4e4))",
        },
      },
      { dark: true }
    );
  }

  function createState(cm: CodeMirrorKit, file: OpenFile, wordWrap: boolean) {
    // Grammars load on demand; seed the compartment with one if already cached,
    // otherwise `applyLanguage` fills it in once the async import resolves.
    const langExt = cm.getLoadedLanguage(file.language);
    if (langExt != null) langAppliedByPath.add(file.path);
    else langAppliedByPath.delete(file.path);
    const diffExt = file.diffBase !== undefined
      ? [gitDiffHighlightExtension(() => file.diffBase)]
      : [];
    return cm.EditorState.create({
      doc: file.content,
      extensions: [
        ...cm.editorBaseSetup,
        languageCompartment.of(langExt != null ? [langExt] : []),
        ...diffExt,
        cm.syntaxHighlighting,
        cm.scrollPastEnd(),
        wrapExtension(wordWrap),
        lspHoverCompartment.of([]),
        cm.EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            files.updateFileContent(file.path, update.state.doc.toString());
            states.set(file.path, update.state);
            scheduleLspDidChange(file.path, update.state.doc.toString());
          }
        }),
        editorTheme(cm),
      ],
    });
  }

  /** Apply `path`'s grammar into the live view's language compartment when it resolves. */
  function applyLanguage(cm: CodeMirrorKit, path: string, language: string) {
    if (langAppliedByPath.has(path)) return;
    const cached = cm.getLoadedLanguage(language);
    if (cached != null) {
      reconfigureLanguage(path, cached);
      return;
    }
    void cm.loadLanguage(language).then((ext) => {
      if (ext != null) reconfigureLanguage(path, ext);
    });
  }

  function reconfigureLanguage(path: string, ext: Extension) {
    if (!editorView) return;
    const tagged = (editorView as unknown as { __tinyPath?: string }).__tinyPath;
    if (tagged !== path) return; // user switched files before the grammar resolved
    editorView.dispatch({ effects: languageCompartment.reconfigure(ext) });
    langAppliedByPath.add(path);
    states.set(path, editorView.state);
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

    // No file to show. If the surface is visible (no tab, or an editor tab
    // without a buffer), tear the view down so stale content can't linger.
    // When a terminal/preview tab is active the surface is hidden, so keep the
    // view alive to preserve state when the user returns to an editor tab.
    if (!activeFile) {
      if (activeTab == null || activeTab.kind === "editor") teardownView();
      return;
    }
    if (activeTab?.kind !== "editor") return;

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
    applyLanguage(kit, path, activeFile.language);
    void openLspForFile(activeFile.path, activeFile.language, activeFile.content);

    void tick().then(() => {
      editorView?.requestMeasure();
      applyGoto(path);
    });
  });

  // -------------------------------------------------------------------------
  // LSP integration
  // -------------------------------------------------------------------------

  function pathToUri(path: string): string {
    return `file://${path}`;
  }

  function scheduleLspDidChange(path: string, text: string) {
    if (!activeLspUri || activeLspUri !== pathToUri(path)) return;
    if (lspChangeTimer) clearTimeout(lspChangeTimer);
    lspChangeTimer = setTimeout(async () => {
      lspChangeTimer = null;
      const lang = resolvedLanguageForLsp(
        props.editorFile?.language ?? ""
      );
      const cfg = getLspConfigForLanguage(lang);
      if (!cfg?.enabled) return;
      const ws = $files.workspacePath;
      if (!ws) return;
      const client = await ensureLspServer(lang, ws, cfg.command, cfg.args);
      client?.didChange(activeLspUri!, text, Date.now()).catch(() => {});
    }, 400);
  }

  async function openLspForFile(path: string, language: string, content: string) {
    const lang = resolvedLanguageForLsp(language);
    if (!isLspEnabledForLanguage(lang)) return;
    const ws = $files.workspacePath;
    if (!ws) return;
    const cfg = getLspConfigForLanguage(lang);
    if (!cfg) return;

    const uri = pathToUri(path);

    // Notify previous file close if switching.
    if (activeLspUri && activeLspUri !== uri) {
      const prevLang = resolvedLanguageForLsp(language);
      const prevCfg = getLspConfigForLanguage(prevLang);
      if (prevCfg?.enabled) {
        const prevClient = await ensureLspServer(prevLang, ws, prevCfg.command, prevCfg.args).catch(() => null);
        prevClient?.didClose(activeLspUri).catch(() => {});
      }
    }
    activeLspUri = uri;

    const client = await ensureLspServer(lang, ws, cfg.command, cfg.args).catch(() => null);
    if (!client) return;

    await client.didOpen(uri, content, lang, 1).catch(() => {});

    // Apply any cached diagnostics immediately.
    if (editorView) {
      const diags = getDiagnosticsForUri(uri);
      if (diags.length) await applyLspDiagnostics(editorView, diags).catch(() => {});
    }

    // Wire up diagnostics subscription for this file.
    client.onDiagnostics = async (dUri, diags) => {
      if (dUri === uri && editorView) {
        await applyLspDiagnostics(editorView, diags).catch(() => {});
      }
    };

    // Install hover extension into the live compartment.
    const hoverExt = await lspHoverExtension(client, uri).catch(() => null);
    if (hoverExt && editorView) {
      editorView.dispatch({ effects: lspHoverCompartment.reconfigure(hoverExt) });
    }
  }

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
    window.dispatchEvent(new CustomEvent("sidebar:format-document-done"));
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
      await writeFile(null, activeFile.path, content);
      files.markSaved(activeFile.path);
      window.dispatchEvent(new CustomEvent("sidebar:editor-saved"));
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

    window.addEventListener("sidebar:format-document", onFormatDocumentEvent);
    window.addEventListener("sidebar:goto-line", onGotoLineEvent);
  });

  $effect(() => {
    if (!resizeObserver || !editorContainer) return;
    resizeObserver.observe(editorContainer);
    return () => resizeObserver?.unobserve(editorContainer);
  });

  onDestroy(() => {
    window.removeEventListener("sidebar:format-document", onFormatDocumentEvent);
    window.removeEventListener("sidebar:goto-line", onGotoLineEvent);
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
  {#if (props.editorTab == null || props.editorTab.kind === "editor") && !props.editorFile}
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
