import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid({ hot: false }), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3000",
    },
  },
});
