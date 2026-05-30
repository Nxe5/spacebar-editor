import path from "node:path";
import type { Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { sveltePhosphorOptimize } from "phosphor-svelte/vite";

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
    __TINYLLAMA_ENV_DEEPSEEK_API_KEY__: JSON.stringify(deepseekApiKey),
    __TINYLLAMA_ENV_ANTHROPIC_API_KEY__: JSON.stringify(anthropicApiKey),
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
          if (id.includes("@codemirror") || id.includes("codemirror")) return "codemirror";
          if (id.includes("@xterm") || id.includes("xterm")) return "xterm";
          if (id.includes("@tauri-apps")) return "tauri";
        },
      },
    },
  },
};
});
