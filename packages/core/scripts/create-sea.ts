import { execSync } from "node:child_process";
import { existsSync, renameSync, writeFileSync } from "node:fs";
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

// Step 1: Generate platform-aware sea-config.json, then build SEA
const configPath = join(root, "sea-config.json");
const seaConfig = {
  main: "sea-dist/mineco-core.mjs",
  output: `sea-dist/mineco-core${ext}`,
  disableExperimentalSEAWarning: true,
  useCodeCache: false,
  mainFormat: "module",
};
writeFileSync(configPath, JSON.stringify(seaConfig, null, 2));
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
} else {
  console.error(`SEA output not found at ${rawOutput}`);
  process.exit(1);
}

// Step 3: Make executable and codesign (non-Windows)
if (platform !== "win32" && existsSync(finalOutput)) {
  execSync(`chmod +x "${finalOutput}"`);

  // macOS: ad-hoc sign so Gatekeeper doesn't kill the process.
  // For distribution, replace "-" with a Developer ID certificate.
  if (platform === "darwin") {
    try {
      execSync(`codesign --force --sign - "${finalOutput}"`, {
        stdio: "inherit",
      });
      console.log("Ad-hoc codesigned");
    } catch {
      console.warn(
        "codesign failed — binary will run but may be blocked by Gatekeeper",
      );
    }
  }
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
