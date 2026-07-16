<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import "@xterm/xterm/css/xterm.css";
  import { Terminal, type ITheme } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import { WebglAddon } from "@xterm/addon-webgl";
  import {
    isTauriAvailable,
    listenPtyData,
    listenPtyExit,
    ptyResize,
    ptyWrite,
  } from "$lib/ipc";
  import { settings } from "$lib/stores/settings";

  interface Props {
    sessionId: string;
    onExit?: () => void;
    /** Whether this pane is the visible tab. Panes stay mounted (buffer intact) when inactive. */
    active?: boolean;
  }

  let { sessionId, onExit, active = true }: Props = $props();

  let rootEl: HTMLDivElement | undefined = $state();
  let term: Terminal | null = null;
  let fit: FitAddon | null = null;
  let webgl: WebglAddon | null = null;
  let unData: (() => void) | null = null;
  let unExit: (() => void) | null = null;
  let observer: ResizeObserver | null = null;

  function readCssVar(name: string, fallback: string): string {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function buildXtermTheme(): ITheme {
    const bg = readCssVar("--editor-bg", "#1e1e1e");
    const fg = readCssVar("--editor-fg", "#d4d4d4");
    return {
      background: bg,
      foreground: fg,
      cursor: fg,
      cursorAccent: bg,
      selectionBackground: readCssVar("--editor-selection", "rgba(38, 79, 120, 0.45)"),
      black: readCssVar("--terminal-ansi-black", "#3c3c3c"),
      red: readCssVar("--terminal-ansi-red", "#f14c4c"),
      green: readCssVar("--terminal-ansi-green", "#89d185"),
      yellow: readCssVar("--terminal-ansi-yellow", "#dcdcaa"),
      blue: readCssVar("--terminal-ansi-blue", "#569cd6"),
      magenta: readCssVar("--terminal-ansi-magenta", "#c586c0"),
      cyan: readCssVar("--terminal-ansi-cyan", "#4ec9b0"),
      white: readCssVar("--terminal-ansi-white", "#d4d4d4"),
      brightBlack: readCssVar("--muted-foreground", "#858585"),
      brightRed: readCssVar("--terminal-ansi-red", "#f14c4c"),
      brightGreen: readCssVar("--terminal-ansi-green", "#89d185"),
      brightYellow: readCssVar("--terminal-ansi-yellow", "#dcdcaa"),
      brightBlue: readCssVar("--terminal-ansi-blue", "#569cd6"),
      brightMagenta: readCssVar("--terminal-ansi-magenta", "#c586c0"),
      brightCyan: readCssVar("--terminal-ansi-cyan", "#4ec9b0"),
      brightWhite: readCssVar("--foreground", "#ffffff"),
    };
  }

  function teardown() {
    observer?.disconnect();
    observer = null;
    unData?.();
    unData = null;
    unExit?.();
    unExit = null;
    webgl?.dispose();
    webgl = null;
    term?.dispose();
    term = null;
    fit = null;
  }

  /** GPU-rendered cells avoid the DOM renderer's glyph-overlap artifacts under
   *  heavy TUI redraw (e.g. Claude Code). One attempt per mount; context loss
   *  or missing WebGL falls back to the DOM renderer. */
  function tryWebgl(t: Terminal): WebglAddon | null {
    try {
      const addon = new WebglAddon();
      addon.onContextLoss(() => {
        addon.dispose();
        if (webgl === addon) webgl = null;
      });
      t.loadAddon(addon);
      return addon;
    } catch {
      return null;
    }
  }

  function syncPtySize() {
    if (!fit || !term) return;
    fit.fit();
    const dims = fit.proposeDimensions();
    if (dims) void ptyResize(sessionId, dims.cols, dims.rows);
  }

  onMount(async () => {
    await tick();
    if (!isTauriAvailable() || !rootEl) return;

    // xterm measures glyph cell size once at open(); if the preferred font is
    // still loading, stale metrics cause overlapping text. Wait for fonts
    // (bounded, in case the promise never settles).
    const fontsReady = await Promise.race([
      (document.fonts?.ready ?? Promise.resolve()).then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1500)),
    ]);
    if (!rootEl) return;

    term = new Terminal({
      fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
      fontSize: 13,
      theme: buildXtermTheme(),
      scrollback: 5000,
      smoothScrollDuration: 120,
    });

    fit = new FitAddon();
    term.loadAddon(fit);
    term.open(rootEl);
    webgl = tryWebgl(term);
    syncPtySize();
    term.focus();

    // If open() won the race against a slow font load, force a glyph
    // re-measure once the fonts actually arrive (assigning a font option is
    // what triggers xterm's char-size service).
    if (!fontsReady) {
      void document.fonts?.ready.then(() => {
        if (!term) return;
        const fs = term.options.fontSize ?? 13;
        term.options.fontSize = fs + 1;
        term.options.fontSize = fs;
        syncPtySize();
      });
    }

    term.onData((data) => {
      void ptyWrite(sessionId, data);
    });

    unData = await listenPtyData(({ id, data }) => {
      if (id === sessionId) term?.write(data);
    });

    unExit = await listenPtyExit(({ id }) => {
      if (id === sessionId) onExit?.();
    });

    observer = new ResizeObserver(() => {
      if (active) syncPtySize();
    });
    observer.observe(rootEl);
  });

  // Re-fit and refocus when switching back to a pane that was hidden — its
  // container may have been resized (or never sized) while display:none.
  $effect(() => {
    if (active && term && fit) {
      syncPtySize();
      term.focus();
    }
  });

  $effect(() => {
    void $settings.workbenchTheme;
    if (!term) return;
    term.options.theme = buildXtermTheme();
    term.refresh(0, term.rows - 1);
  });

  onDestroy(() => {
    teardown();
  });
</script>

<div class="flex h-full min-h-0 flex-1 flex-col bg-background">
  {#if !isTauriAvailable()}
    <div class="p-4 text-sm text-muted-foreground">Terminal requires Tauri (run <code class="rounded bg-muted px-1">pnpm tauri dev</code>).</div>
  {:else}
    <div class="min-h-0 flex-1 overflow-hidden px-1 pt-1" bind:this={rootEl}></div>
  {/if}
</div>
