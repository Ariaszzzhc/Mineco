import { execSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, renameSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";

/**
 * Build script for @mineco/mineco (Tauri desktop + CLI).
 *
 * Turbo's `^build` ensures @mineco/core, @mineco/app, @mineco/agent,
 * and @mineco/provider are already built before this runs.
 *
 * This script handles only the steps turbo can't:
 *   1. Build core as Single Executable Archive (SEA)
 *   2. Copy SEA binary to Tauri sidecar location
 *   3. Build Tauri app (bundles desktop binary + sidecar + SPA resources)
 *   4. Assemble runnable app + installers into <root>/out/
 */

const ROOT = join(import.meta.dirname, "../../..");
const OUT_DIR = join(ROOT, "out");
const TAURI_DIR = join(ROOT, "packages/mineco/src-tauri");

function run(cmd: string): void {
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

// Step 1: Build core SEA (requires core `build` to have run first — guaranteed by turbo)
run("pnpm --filter @mineco/core sea");

// Step 2: Copy SEA binary to Tauri sidecar location
const targetTriple = getTargetTriple();
const ext = process.platform === "win32" ? ".exe" : "";
const seaSource = join(ROOT, `packages/core/sea-dist/mineco-core-${targetTriple}${ext}`);
const binariesDir = join(TAURI_DIR, "binaries");
mkdirSync(binariesDir, { recursive: true });
const seaDest = join(binariesDir, `mineco-core-${targetTriple}${ext}`);
copyFileSync(seaSource, seaDest);
console.log(`Copied SEA: ${seaDest}`);

// Step 3: Build Tauri app
run("pnpm --filter @mineco/mineco tauri build");

// Step 4: Assemble output into <root>/out/
//
// out/
// ├── app/                          # Runnable app (can launch directly)
// │   ├── mineco.exe                # Main Tauri binary
// │   ├── mineco-core-{triple}.exe  # Sidecar
// │   └── resources/
// │       └── web/                  # SPA for web mode
// └── installers/                   # Distributable packages
//     ├── mineco_0.2.0_x64-setup.exe
//     └── ...

const appDir = join(OUT_DIR, "app");
const installersDir = join(OUT_DIR, "installers");
mkdirSync(appDir, { recursive: true });
mkdirSync(installersDir, { recursive: true });

const releaseDir = join(TAURI_DIR, "target/release");
const bundleDir = join(releaseDir, "bundle");

// 4a: Move main binary
const productName = `mineco${ext}`;
const releaseBin = join(releaseDir, productName);
if (statSync(releaseBin, { throwIfNoEntry: false })?.isFile()) {
  renameSync(releaseBin, join(appDir, productName));
  console.log(`  app/${productName}`);
}

// 4b: Move sidecar binary (strip target triple — Tauri runtime expects bare name)
const sidecarBuildName = `mineco-core-${targetTriple}${ext}`;
const sidecarRuntimeName = `mineco-core${ext}`;
const sidecarSrc = join(binariesDir, sidecarBuildName);
if (statSync(sidecarSrc, { throwIfNoEntry: false })?.isFile()) {
  renameSync(sidecarSrc, join(appDir, sidecarRuntimeName));
  console.log(`  app/${sidecarRuntimeName}`);
}

// 4c: Copy SPA resources for web mode
const spaSource = join(ROOT, "packages/app/dist");
const spaDestDir = join(appDir, "resources/web");
if (statSync(spaSource, { throwIfNoEntry: false })?.isDirectory()) {
  cpSync(spaSource, spaDestDir, { recursive: true });
  console.log("  app/resources/web/");
}

// 4d: Move installer artifacts
function moveInstallers(dir: string): void {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return;

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isFile()) {
      renameSync(fullPath, join(installersDir, basename(fullPath)));
      console.log(`  installers/${basename(fullPath)}`);
    } else if (stat.isDirectory()) {
      moveInstallers(fullPath);
    }
  }
}

console.log(`\nAssembled output in ${OUT_DIR}:`);
moveInstallers(bundleDir);

console.log("\nBuild complete!");
