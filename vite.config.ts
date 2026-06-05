import path from "node:path";
import type { Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { sveltePhosphorOptimize } from "phosphor-svelte/vite";

/**
 * CodeMirror packages the editor always needs (statically imported by
 * loadCodeMirror.ts). Grouped into one eager `codemirror` chunk. Per-language
 * `lang-*`/`legacy-modes` packages and their `@lezer/*` parsers are excluded so
 * they split into on-demand chunks. Only the generic lezer runtime is core here.
 */
const CODEMIRROR_CORE = [
  "@codemirror/state",
  "@codemirror/view",
  "@codemirror/language",
  "@codemirror/commands",
  "@codemirror/search",
  "@codemirror/autocomplete",
  "@codemirror/lint",
  "@lezer/common",
  "@lezer/highlight",
  "@lezer/lr",
];

const devPort = Number(process.env.VITE_PORT ?? process.env.PORT ?? 14200);
/** Set by `tauri dev` on iOS/Android; desktop leaves this unset. */
const tauriDevHost = process.env.TAURI_DEV_HOST;

/** `@tailwindcss/vite` uses `enforce: "pre"`; Svelte must run in the same phase first. */
function preSvelte(): Plugin[] {
  return svelte().map((plugin) => ({ ...plugin, enforce: "pre" as const }));
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const deepseekApiKey =
    env.DEEPSEEK_API_KEY ?? env.deepseek_api_key ?? env.VITE_DEEPSEEK_API_KEY ?? "";
  const anthropicApiKey =
    env.ANTHROPIC_API_KEY ?? env.anthropic_api_key ?? env.VITE_ANTHROPIC_API_KEY ?? "";

  return {
  /** VS Code icon pack and other shipped static assets (`static/icon-packs/…`). */
  publicDir: path.resolve(import.meta.dirname, "static"),
  /** Svelte `pre` before Tailwind `pre` so `*.svelte?lang.css` is extracted CSS, not raw SFC source. */
  plugins: [...preSvelte(), sveltePhosphorOptimize(), ...tailwindcss()],
  define: {
    __SPACEBAR_EDITOR_ENV_DEEPSEEK_API_KEY__: JSON.stringify(deepseekApiKey),
    __SPACEBAR_EDITOR_ENV_ANTHROPIC_API_KEY__: JSON.stringify(anthropicApiKey),
  },
  clearScreen: false,
  resolve: {
    alias: {
      $lib: path.resolve(import.meta.dirname, "./src/lib"),
    },
  },
  server: {
    port: devPort,
    strictPort: true,
    /** Match Tauri devUrl; use TAURI_DEV_HOST when testing on a physical mobile device. */
    host: tauriDevHost || "127.0.0.1",
    hmr: tauriDevHost
      ? {
          protocol: "ws",
          host: tauriDevHost,
          port: devPort,
        }
      : {
          protocol: "ws",
          host: "127.0.0.1",
          port: devPort,
          clientPort: devPort,
        },
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, "index.html"),
        settings: path.resolve(import.meta.dirname, "settings.html"),
      },
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          // Language grammars (+ their lezer parsers) load on demand — leave them
          // unnamed so Vite emits a separate async chunk per language. Must be
          // checked before the core `@codemirror` rule below.
          if (
            id.includes("@codemirror/lang-") ||
            id.includes("@codemirror/legacy-modes") ||
            id.includes("codemirror-lang-")
          ) {
            return;
          }
          if (CODEMIRROR_CORE.some((pkg) => id.includes(pkg))) return "codemirror";
          if (id.includes("@xterm") || id.includes("xterm")) return "xterm";
          if (id.includes("@tauri-apps")) return "tauri";
        },
      },
    },
  },
};
});
