import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const appSrc = fileURLToPath(new URL("../app/src", import.meta.url));

export default defineConfig({
  plugins: [solid({ hot: false }), tailwindcss()],
  resolve: {
    alias: {
      "@mineco/app": appSrc,
    },
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3000",
    },
  },
});
