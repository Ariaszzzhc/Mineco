import tailwindcss from "@tailwindcss/vite";
import solid from "vite-plugin-solid";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [solid({ hot: false }), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3000",
    },
  },
});
