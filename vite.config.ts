import { fileURLToPath, URL } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import electron from "vite-plugin-electron/simple";

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  plugins: [
    tailwindcss(),
    svelte(),
    electron({
      main: {
        entry: "src/main/index.ts",
        vite: {
          build: {
            rolldownOptions: {
              // The Claude Agent SDK spawns a CLI subprocess and resolves its
              // own bundled assets at runtime — keep it external and load from
              // node_modules instead of bundling it into main.js.
              // electron-updater must also stay external: it reads its own
              // `app-update.yml` from the packaged resources and pulls in Node
              // deps (js-yaml, lzma, etc.) that don't survive bundling.
              external: ["@anthropic-ai/claude-agent-sdk", "electron-updater"],
              // Entry source was renamed main.ts -> index.ts; hardcode the
              // output name so dist-electron/main.js (and package.json "main")
              // stay unchanged — zero behavior change.
              output: { entryFileNames: "main.js" },
            },
          },
        },
      },
      preload: {
        input: "src/preload/index.ts",
        vite: {
          build: {
            // Emit a CommonJS preload (`.cjs`) so it loads under the default
            // sandbox without the ESM-preload constraints. Hardcode the name
            // (source is now index.ts) so the output stays dist-electron/preload.cjs.
            rolldownOptions: {
              output: { entryFileNames: "preload.cjs" },
            },
          },
        },
      },
    }),
  ],
});
