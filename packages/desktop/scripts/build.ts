import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../..");

function run(cmd: string) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: ROOT });
}

function getTargetTriple(): string {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === "win32") return "x86_64-pc-windows-msvc";
  if (platform === "darwin") {
    return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  }
  return arch === "arm64" ? "aarch64-unknown-linux-gnu" : "x86_64-unknown-linux-gnu";
}

// Step 1: Build workspace dependencies
run("pnpm --filter @mineco/provider build");
run("pnpm --filter @mineco/agent build");

// Step 2: Build core SEA
run("pnpm --filter @mineco/core build:sea");
run("pnpm --filter @mineco/core create:sea");

// Step 3: Copy SEA binary to Tauri sidecar location
const targetTriple = getTargetTriple();
const ext = process.platform === "win32" ? ".exe" : "";
const seaSource = join(ROOT, `packages/core/sea-dist/mineco-core-${targetTriple}${ext}`);
const binariesDir = join(ROOT, "packages/desktop/src-tauri/binaries");
mkdirSync(binariesDir, { recursive: true });
const seaDest = join(binariesDir, `mineco-core-${targetTriple}${ext}`);
copyFileSync(seaSource, seaDest);
console.log(`Copied SEA: ${seaDest}`);

// Step 4: Build frontend
run("pnpm --filter @mineco/app build");

// Step 5: Build Tauri app
run("pnpm --filter @mineco/desktop tauri build");

console.log("Build complete!");
