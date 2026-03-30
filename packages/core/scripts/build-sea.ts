import { build } from "esbuild";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");

await build({
  entryPoints: [join(root, "src/index.ts")],
  bundle: true,
  platform: "node",
  target: "node25",
  format: "esm",
  outfile: join(root, "sea-dist/mineco-core.mjs"),
  external: ["node:*"],
  minify: false,
  keepNames: true,
  sourcemap: "inline",
});

console.log("SEA bundle created: sea-dist/mineco-core.mjs");
