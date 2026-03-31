import { defineProject } from "vitest/config";
import solid from "vite-plugin-solid";

export default defineProject({
  plugins: [solid({ hot: false })],
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    environment: "happy-dom",
  },
});
