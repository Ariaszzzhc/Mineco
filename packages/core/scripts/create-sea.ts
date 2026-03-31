import { execSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const seaDir = join(root, "sea-dist");
const platform = process.platform;
const ext = platform === "win32" ? ".exe" : "";

// Verify bundle exists
const bundlePath = join(seaDir, "mineco-core.mjs");
if (!existsSync(bundlePath)) {
  console.error("Bundle not found. Run `pnpm build:sea` first.");
  process.exit(1);
}

// Step 1: Generate SEA directly using --build-sea (Node.js v25+)
const configPath = join(root, "sea-config.json");
console.log(`Generating SEA from ${configPath}...`);
execSync(`node --build-sea "${configPath}"`, {
  stdio: "inherit",
  cwd: root,
});
console.log("SEA executable created");

// Step 2: Rename to include target triple for Tauri sidecar convention
const rawOutput = join(seaDir, `mineco-core${ext}`);
const targetTriple = getTargetTriple();
const finalOutput = join(seaDir, `mineco-core-${targetTriple}${ext}`);

if (existsSync(rawOutput)) {
  renameSync(rawOutput, finalOutput);
  console.log(`Renamed to: mineco-core-${targetTriple}${ext}`);
}

// Step 3: Make executable (non-Windows)
if (platform !== "win32" && existsSync(finalOutput)) {
  execSync(`chmod +x "${finalOutput}"`);
}

function getTargetTriple(): string {
  const arch = process.arch;
  if (platform === "win32") return "x86_64-pc-windows-msvc";
  if (platform === "darwin") {
    return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  }
  return arch === "arm64"
    ? "aarch64-unknown-linux-gnu"
    : "x86_64-unknown-linux-gnu";
}
