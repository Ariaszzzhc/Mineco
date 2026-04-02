import solid from "vite-plugin-solid";
import { defineProject } from "vitest/config";

export default defineProject({
  plugins: [solid({ hot: false })],
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "happy-dom",
  },
});
