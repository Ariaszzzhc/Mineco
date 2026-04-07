import { readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { build, type Plugin } from "esbuild";

const root = join(import.meta.dirname, "..");
const migrationsDir = join(root, "src/db/migrations");

/**
 * esbuild plugin that replaces the dynamic file-based migration provider
 * with a static one that imports all migrations at build time.
 * This makes the SEA bundle self-contained — no need for a migrations/ directory
 * next to the executable.
 */
const staticMigrationsPlugin: Plugin = {
  name: "static-migrations",
  setup(build) {
    const providerPath = resolve(root, "src/db/migration-provider.ts");

    build.onResolve({ filter: /migration-provider/ }, (args) => {
      const resolved = resolve(args.resolveDir, args.path);
      // Only intercept the import from migrator, and only if it resolves to our file
      if (
        resolved === providerPath ||
        resolved === providerPath.replace(/\.ts$/, "") ||
        resolved === providerPath.replace(/\.ts$/, ".js")
      ) {
        return { path: providerPath, namespace: "static-migrations" };
      }
      return null;
    });

    build.onLoad({ filter: /.*/, namespace: "static-migrations" }, async () => {
      const files = readdirSync(migrationsDir).filter((f) =>
        /\.(ts|js)$/.test(f),
      );

      const imports: string[] = [];
      const entries: string[] = [];

      for (const file of files) {
        const name = basename(file, file.includes(".ts") ? ".ts" : ".js");
        const safeId = `m_${name.replace(/-/g, "_")}`;
        imports.push(
          `import * as ${safeId} from "./src/db/migrations/${name}.js";`,
        );
        entries.push(`  "${name}": ${safeId},`);
      }

      const contents = `
import { type Migration, type MigrationProvider } from "kysely";

${imports.join("\n")}

class StaticMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return {
${entries.join("\n")}
    };
  }
}

export function getMigrationProvider(): MigrationProvider {
  return new StaticMigrationProvider();
}
`;

      return { contents, loader: "ts", resolveDir: root };
    });
  },
};

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
  plugins: [staticMigrationsPlugin],
});

console.log("SEA bundle created: sea-dist/mineco-core.mjs");
