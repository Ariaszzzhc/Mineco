// electron-builder afterPack hook: ad-hoc code-sign the macOS .app.
//
// CI has no Apple Developer cert (CSC_IDENTITY_AUTO_DISCOVERY=false), so
// electron-builder skips macOS signing entirely. That leaves the bundle with
// only the linker's ad-hoc signature on the main Mach-O and NO sealed
// `_CodeSignature/CodeResources` — a BROKEN seal. `codesign --verify` then
// fails with "code has no resources but signature indicates they must be
// present", and Gatekeeper reports the quarantined app as "damaged, move to
// Trash" (the hard-error path) instead of the milder "unverified developer"
// prompt.
//
// A proper ad-hoc sign (`--sign -`) rebuilds a valid, fully-sealed signature so
// the bundle is no longer "damaged". It does NOT make a downloaded app open by
// double-click — quarantined apps still need notarization (or `xattr -dr
// com.apple.quarantine`) — but it turns the unrecoverable error into normal,
// workaround-able quarantine behavior. Real fix = Developer ID + notarization.
//
// Runs only on macOS packs. afterPack fires after asar assembly and before
// dmg/zip packaging, so the signed .app is what gets distributed.
const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);

  // `--deep` signs nested frameworks/helpers too; acceptable for ad-hoc.
  // `--force` overwrites the partial linker signature.
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], {
    stdio: "inherit",
  });

  // Fail the build loudly if the seal is still invalid, rather than shipping
  // another "damaged" bundle.
  execFileSync("codesign", ["--verify", "--deep", "--strict", appPath], {
    stdio: "inherit",
  });
};
