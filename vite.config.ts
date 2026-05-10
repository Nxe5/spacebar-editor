import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const devPort = Number(process.env.VITE_PORT ?? process.env.PORT ?? 14200);

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  clearScreen: false,
  resolve: {
    alias: {
      $lib: path.resolve(import.meta.dirname, "./src/lib"),
    },
  },
  server: {
    port: devPort,
    strictPort: true,
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
});
