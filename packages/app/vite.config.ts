import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid({ hot: false }), tailwindcss()],
  build: {
    cssCodeSplit: false,
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: ["solid-js", "solid-js/store", "solid-js/web"],
    },
  },
});
