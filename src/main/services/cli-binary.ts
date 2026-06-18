/**
 * Claude CLI binary provisioning — on-demand download instead of bundling.
 *
 * The Claude Agent SDK spawns a self-contained **native** executable
 * (`claude` / `claude.exe`, ~235 MB, a Bun-compiled standalone). It ships as a
 * per-platform npm optional dependency (`@anthropic-ai/claude-agent-sdk-<variant>`)
 * and, when present, is what the SDK runs directly — NO `node` from PATH is
 * involved (the SDK only prefixes `node` when the executable is a `.js` script).
 *
 * Bundling all 8 variants (~2 GB) into the installer is wasteful, so instead we
 * EXCLUDE them from packaging and fetch the one matching the host the first time
 * an engine session opens, caching it under `~/.mineco/.bin/<version>/`. The
 * session passes the resolved path to the SDK via `options.pathToClaudeCodeExecutable`,
 * which bypasses the SDK's own resolver (the one that throws "Reinstall without
 * --omit=optional" when the optional package is absent).
 *
 * Provisioning is fully self-verifying and dependency-free:
 *   1. Resolve the installed SDK's version + bundled `manifest.json` (the version
 *      and the optional package version are pinned lockstep, so the JS version IS
 *      the tarball version).
 *   2. Fetch the platform package's registry metadata for `dist.tarball` +
 *      `dist.integrity` (sha512 over the compressed tarball).
 *   3. Stream-download the tarball, verifying its sha512 as bytes arrive.
 *   4. Extract ONLY `package/<binary>` with a pure-Node gunzip + ustar parser
 *      (memory-safe: the body streams straight to disk).
 *   5. Verify the extracted binary's sha256 + size against `manifest.json`
 *      (independent of npm — this is the strong, version-locked check).
 *   6. `chmod 0o755` on unix, then atomically rename into place.
 */

import crypto from "node:crypto";
import { createReadStream, createWriteStream, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { Readable, Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Progress callback phases for a binary provisioning run. */
export interface CliBinaryProgress {
  phase: "check" | "metadata" | "download" | "extract" | "verify" | "ready";
  /** Compressed bytes received so far (download phase). */
  received?: number;
  /** Total compressed bytes, when the server reports Content-Length. */
  total?: number;
}

/** A single platform entry from the SDK's `manifest.json`. */
interface ManifestPlatform {
  binary: string;
  checksum: string;
  size: number;
}

interface SdkInfo {
  /** npm version of the installed SDK (= the platform tarball version). */
  version: string;
  /** Per-platform binary descriptors keyed by `<platform>-<arch>[-musl]`. */
  platforms: Record<string, ManifestPlatform>;
}

// ---------------------------------------------------------------------------
// Platform resolution
// ---------------------------------------------------------------------------

/**
 * Detects musl (Alpine) vs glibc on linux, dependency-free — mirrors the SDK's
 * own check (`process.report.getReport().header.glibcVersionRuntime` is a
 * version string on glibc, absent on musl). Only meaningful on linux.
 */
function isMuslLinux(): boolean {
  if (process.platform !== "linux") return false;
  const report =
    typeof process.report?.getReport === "function"
      ? (process.report.getReport() as {
          header?: { glibcVersionRuntime?: string };
        })
      : null;
  return report != null && report.header?.glibcVersionRuntime === undefined;
}

/**
 * The `<platform>-<arch>[-musl]` variant key for the current host — the suffix
 * of both the optional package name and the `manifest.json` platform key.
 * Throws on an unsupported platform/arch (the SDK ships no binary for it).
 */
function currentVariant(): string {
  const { platform, arch } = process;
  if (platform === "win32" && arch === "x64") return "win32-x64";
  if (platform === "win32" && arch === "arm64") return "win32-arm64";
  if (platform === "darwin" && arch === "x64") return "darwin-x64";
  if (platform === "darwin" && arch === "arm64") return "darwin-arm64";
  if (platform === "linux" && (arch === "x64" || arch === "arm64")) {
    return `linux-${arch}${isMuslLinux() ? "-musl" : ""}`;
  }
  throw new Error(
    `Unsupported platform for the Claude engine: ${platform}/${arch}. ` +
      "Prebuilt binaries exist only for win32-x64, win32-arm64, darwin-x64, " +
      "darwin-arm64, linux-x64(+musl), linux-arm64(+musl).",
  );
}

// ---------------------------------------------------------------------------
// SDK introspection (version + manifest)
// ---------------------------------------------------------------------------

let sdkInfoCache: SdkInfo | null = null;

/**
 * Reads the installed SDK's `package.json` (version) and `manifest.json`
 * (per-platform checksums). The SDK's `exports` map hides `./package.json`, so
 * we resolve the package's main entry and read sibling files directly. Cached.
 */
function sdkInfo(): SdkInfo {
  if (sdkInfoCache) return sdkInfoCache;
  const main = require.resolve("@anthropic-ai/claude-agent-sdk"); // -> sdk.mjs
  const dir = path.dirname(main);
  const pkg = JSON.parse(
    readFileSync(path.join(dir, "package.json"), "utf8"),
  ) as { version: string };
  const manifest = JSON.parse(
    readFileSync(path.join(dir, "manifest.json"), "utf8"),
  ) as { platforms: Record<string, ManifestPlatform> };
  sdkInfoCache = { version: pkg.version, platforms: manifest.platforms };
  return sdkInfoCache;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Cache root for downloaded engine binaries: `~/.mineco/.bin/`. */
function binRoot(): string {
  return path.join(os.homedir(), ".mineco", ".bin");
}

/** The cached binary path for a given SDK version: `~/.mineco/.bin/<version>/<binary>`. */
function binaryPath(version: string, binary: string): string {
  return path.join(binRoot(), version, binary);
}

// ---------------------------------------------------------------------------
// Tar extraction (pure-Node ustar parser; streams one member to disk)
// ---------------------------------------------------------------------------

/** Reads a NUL-terminated string field from a tar header block. */
function readStr(buf: Buffer, off: number, len: number): string {
  let end = off;
  while (end < off + len && buf[end] !== 0) end++;
  return buf.toString("utf8", off, end);
}

/** Parses an octal-ASCII numeric field (the tar `size`), stopping at NUL/space. */
function parseOctal(buf: Buffer, off: number, len: number): number {
  let s = "";
  for (let i = off; i < off + len; i++) {
    const c = buf[i];
    if (c === 0 || c === 0x20) break;
    s += String.fromCharCode(c);
  }
  return s.length ? parseInt(s, 8) : 0;
}

/**
 * A `Writable` sink that walks a decompressed tar octet stream as a 512-byte
 * block state machine and streams ONE member's body to `out`. Memory-safe: only
 * a sub-512-byte header remainder is ever held; body bytes go straight to disk
 * with backpressure honored. Does NOT early-abort — the full stream must drain
 * so the caller can finish hashing the tarball.
 */
class SingleMemberSink extends Writable {
  private pending: Buffer = Buffer.alloc(0);
  private state: "header" | "body" | "skip" | "done" = "header";
  private remaining = 0; // body bytes left for the current member
  private pad = 0; // zero-padding bytes to the next 512 boundary
  found = false;
  private readonly want: string;
  private readonly out: Writable;
  /** Hard cap on the wanted member's body (the manifest's expected size). A tar
   * header declaring more is a hostile/corrupt archive — fail fast before
   * writing gigabytes (the post-drain size check would be far too late). */
  private readonly maxBytes: number;

  constructor(want: string, out: Writable, maxBytes: number) {
    super();
    this.want = want;
    this.out = out;
    this.maxBytes = maxBytes;
    // `out` is written to manually (not a pipeline stage), so adopt its errors:
    // surface them as a sink failure so `pipeline()` rejects and cleans up,
    // instead of an unhandled 'error' crashing the process.
    out.on("error", (e) => {
      if (!this.destroyed) this.destroy(e);
    });
  }

  /** Flush + close the owned output file when the tar stream ends normally. */
  override _final(cb: (err?: Error | null) => void): void {
    this.out.end(() => cb());
  }

  /** Tear down the owned output file if the pipeline destroys us (error/abort). */
  override _destroy(err: Error | null, cb: (err?: Error | null) => void): void {
    this.out.destroy(err ?? undefined);
    cb(err);
  }

  override _write(
    chunk: Buffer,
    _enc: BufferEncoding,
    cb: (err?: Error | null) => void,
  ): void {
    this.pending = this.pending.length
      ? Buffer.concat([this.pending, chunk])
      : chunk;
    let backpressured = false;
    try {
      loop: for (;;) {
        switch (this.state) {
          case "header": {
            if (this.pending.length < 512) break loop; // await full header
            const hdr = this.pending.subarray(0, 512);
            if (hdr.every((b) => b === 0)) {
              this.state = "done"; // end-of-archive zero blocks
              break loop;
            }
            const name = readStr(hdr, 0, 100);
            const size = parseOctal(hdr, 124, 12);
            const prefix = readStr(hdr, 345, 155);
            const full = prefix ? `${prefix}/${name}` : name;
            this.pending = this.pending.subarray(512);
            this.remaining = size;
            this.pad = (512 - (size % 512)) % 512;
            const wanted = !this.found && full === this.want;
            if (wanted && size > this.maxBytes) {
              throw new Error(
                `Tar member ${full} declares ${size} bytes, exceeds expected ${this.maxBytes}`,
              );
            }
            this.state = wanted ? "body" : "skip";
            break;
          }
          case "body": {
            if (this.remaining > 0) {
              const take = Math.min(this.remaining, this.pending.length);
              if (take > 0) {
                // Copy to detach from the shared gunzip backing buffer.
                if (
                  !this.out.write(Buffer.from(this.pending.subarray(0, take)))
                )
                  backpressured = true;
                this.pending = this.pending.subarray(take);
                this.remaining -= take;
              }
              if (this.remaining > 0) break loop; // member spans chunks
            }
            const drop = Math.min(this.pad, this.pending.length);
            this.pending = this.pending.subarray(drop);
            this.pad -= drop;
            if (this.pad > 0) break loop;
            this.found = true;
            this.state = "skip"; // keep draining (tail members + tarball hash)
            this.remaining = 0;
            break;
          }
          case "skip": {
            const avail = this.pending.length;
            const rcut = Math.min(this.remaining, avail);
            this.remaining -= rcut;
            const pcut = Math.min(this.pad, avail - rcut);
            this.pad -= pcut;
            this.pending = this.pending.subarray(rcut + pcut);
            if (this.remaining + this.pad > 0) break loop; // spans chunks
            this.state = "header";
            break;
          }
          default:
            this.pending = Buffer.alloc(0); // "done": discard the rest
            break loop;
        }
      }
    } catch (e) {
      cb(e as Error);
      return;
    }
    if (backpressured) this.out.once("drain", () => cb());
    else cb();
  }
}

// ---------------------------------------------------------------------------
// Download + verify
// ---------------------------------------------------------------------------

/** Strips a trailing slash so we can template registry URLs uniformly. */
function registryBase(): string {
  const r =
    process.env.MINECO_CLI_REGISTRY ||
    process.env.npm_config_registry ||
    "https://registry.npmjs.org";
  return r.replace(/\/+$/, "");
}

/**
 * Auth headers for a request to `urlStr`, when a token is configured AND the
 * URL's host matches the registry host (so a token is never leaked to a
 * third-party host a `dist.tarball` redirect might point at). Supports private /
 * proxy registries common in corporate setups.
 */
function authHeaders(urlStr: string): Record<string, string> {
  const token =
    process.env.MINECO_CLI_REGISTRY_TOKEN || process.env.NODE_AUTH_TOKEN;
  if (!token) return {};
  try {
    if (new URL(urlStr).host !== new URL(registryBase()).host) return {};
  } catch {
    return {};
  }
  return { Authorization: `Bearer ${token}` };
}

/** Adds a hint when the registry rejected us for auth reasons. */
function registryError(what: string, status: number, url: string): Error {
  const hint =
    status === 401 || status === 403
      ? " (registry requires auth — set MINECO_CLI_REGISTRY_TOKEN / NODE_AUTH_TOKEN)"
      : "";
  return new Error(`${what} ${status} for ${url}${hint}`);
}

/** Fetches the platform package's per-version dist metadata from the registry. */
async function fetchDist(
  variant: string,
  version: string,
): Promise<{ tarball: string; integrity?: string }> {
  const url = `${registryBase()}/@anthropic-ai/claude-agent-sdk-${variant}/${version}`;
  const res = await fetch(url, { headers: authHeaders(url) });
  if (!res.ok) {
    throw registryError("Registry metadata", res.status, url);
  }
  const doc = (await res.json()) as {
    dist?: { tarball?: string; integrity?: string };
  };
  const tarball = doc.dist?.tarball;
  if (!tarball) throw new Error(`No dist.tarball in registry metadata: ${url}`);
  return { tarball, integrity: doc.dist?.integrity };
}

/** sha256 (hex) of a file, streamed. */
async function sha256File(file: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

/**
 * Downloads `tarball`, verifies its sha512 against `integrity`, extracts
 * `member` to `dest` (streaming), and verifies the result against `expect`.
 */
async function downloadExtractVerify(
  tarball: string,
  integrity: string | undefined,
  member: string,
  dest: string,
  expect: ManifestPlatform,
  onProgress?: (p: CliBinaryProgress) => void,
): Promise<void> {
  const res = await fetch(tarball, {
    redirect: "follow",
    headers: authHeaders(tarball),
  });
  if (!res.ok || !res.body) {
    throw registryError("Download", res.status, tarball);
  }
  const total = Number(res.headers.get("content-length")) || undefined;

  // Temp lives in the SAME dir as dest (so the final rename is same-volume /
  // atomic) and is unique per process to avoid concurrent-writer collisions.
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp-${process.pid}`;

  try {
    const out = createWriteStream(tmp);
    const sink = new SingleMemberSink(member, out, expect.size);

    // Tap the compressed stream to hash (sha512) + report progress on the raw
    // tarball bytes, before they are gunzipped. A Transform (not a 'data'
    // listener) keeps gunzip's backpressure intact so nothing buffers up.
    const hash = crypto.createHash("sha512");
    let received = 0;
    const tap = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        hash.update(chunk);
        received += chunk.length;
        onProgress?.({ phase: "download", received, total });
        cb(null, chunk);
      },
    });
    const body = Readable.fromWeb(
      res.body as Parameters<typeof Readable.fromWeb>[0],
    );

    onProgress?.({ phase: "download", received: 0, total });
    // The sink owns `out` (flushes it in `_final`, destroys it in `_destroy`),
    // so a write error rejects this pipeline and `out` is always released.
    await pipeline(body, tap, createGunzip(), sink);

    if (!sink.found) throw new Error(`Member not found in tarball: ${member}`);

    // (a) tarball integrity (sha512) — catches a corrupt/MITM'd download.
    if (integrity) {
      const got = `sha512-${hash.digest("base64")}`;
      if (got !== integrity) {
        throw new Error(
          `Tarball integrity mismatch.\n  expected ${integrity}\n  got      ${got}`,
        );
      }
    }

    // (b) binary checksum (sha256) + size — the strong, version-locked check.
    onProgress?.({ phase: "verify" });
    const stat = await fs.stat(tmp);
    if (stat.size !== expect.size) {
      throw new Error(
        `Binary size mismatch: expected ${expect.size}, got ${stat.size}`,
      );
    }
    const sha = await sha256File(tmp);
    if (sha !== expect.checksum) {
      throw new Error(
        `Binary checksum mismatch.\n  expected ${expect.checksum}\n  got      ${sha}`,
      );
    }

    if (process.platform !== "win32") await fs.chmod(tmp, 0o755);
    await fs.rename(tmp, dest); // atomic publish
  } catch (err) {
    // Any failure (pipeline reject, verify mismatch, rename) must not leave a
    // partial ~235 MB temp file behind.
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Paths whose sha256 we've already verified this process (so repeated turns
 * don't re-hash 235 MB every time). */
const verified = new Set<string>();

/**
 * Validates a cached binary. Cheap pre-check first (existence + exact size),
 * then — once per process — a full sha256 against the manifest, so a same-size
 * corrupted / tampered / bit-rotted cache file is caught before we hand it to
 * the SDK to spawn. A mismatch deletes the file and reports a miss.
 */
async function isCached(
  dest: string,
  expect: ManifestPlatform,
): Promise<boolean> {
  if (verified.has(dest)) return true;
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(dest);
  } catch {
    return false;
  }
  if (!stat.isFile() || stat.size !== expect.size) return false;
  if ((await sha256File(dest)) !== expect.checksum) {
    await fs.rm(dest, { force: true }).catch(() => {});
    return false;
  }
  verified.add(dest);
  return true;
}

/** De-dupes concurrent provisioning of the same version (first turn races). */
const inflight = new Map<string, Promise<string>>();

/**
 * Ensures the native Claude CLI binary for this host + the installed SDK version
 * exists under `~/.mineco/.bin/`, downloading and verifying it on first use.
 * Returns the absolute path to pass as `options.pathToClaudeCodeExecutable`.
 * Concurrent calls for the same version share one download.
 */
export async function ensureClaudeCli(
  onProgress?: (p: CliBinaryProgress) => void,
): Promise<string> {
  const { version, platforms } = sdkInfo();
  const variant = currentVariant();
  const expect = platforms[variant];
  if (!expect) {
    throw new Error(`No manifest entry for variant ${variant}@${version}`);
  }
  const dest = binaryPath(version, expect.binary);

  onProgress?.({ phase: "check" });
  if (await isCached(dest, expect)) {
    onProgress?.({ phase: "ready" });
    return dest;
  }

  const existing = inflight.get(dest);
  if (existing) return existing;

  const run = (async () => {
    onProgress?.({ phase: "metadata" });
    const { tarball, integrity } = await fetchDist(variant, version);
    onProgress?.({ phase: "extract" });
    await downloadExtractVerify(
      tarball,
      integrity,
      `package/${expect.binary}`,
      dest,
      expect,
      onProgress,
    );
    verified.add(dest); // just sha256-verified before the atomic rename
    onProgress?.({ phase: "ready" });
    return dest;
  })();

  inflight.set(dest, run);
  try {
    return await run;
  } finally {
    inflight.delete(dest);
  }
}
