import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import electron from "vite-plugin-electron/simple";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    svelte(),
    electron({
      main: {
        entry: "electron/main.ts",
        vite: {
          build: {
            rolldownOptions: {
              // Both Agent SDKs spawn a CLI subprocess and resolve their own
              // bundled assets at runtime — keep them external and load from
              // node_modules instead of bundling them into main.js.
              external: ["@anthropic-ai/claude-agent-sdk", "@openai/codex-sdk"],
            },
          },
        },
      },
      preload: {
        input: "electron/preload.ts",
        vite: {
          build: {
            // Emit a CommonJS preload (`.cjs`) so it loads under the default
            // sandbox without the ESM-preload constraints.
            rolldownOptions: {
              output: { entryFileNames: "[name].cjs" },
            },
          },
        },
      },
    }),
  ],
});
