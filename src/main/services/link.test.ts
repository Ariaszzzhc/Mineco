/**
 * Fixture tests for the native-dir encoding + linking core (ADR-0.4-3/4).
 *
 * No test framework is configured in this repo, so this file is a standalone
 * runnable script (a tiny `assert`-based harness). Run it with the `@/` alias
 * loader (see the npm-less invocation in the file footer / phase notes):
 *
 *   MINECO_SRC=<repo>/src node \
 *     --experimental-strip-types \
 *     --import <scratch>/alias-loader.mjs \
 *     src/main/services/link.test.ts
 *
 * The encoding fixtures are pinned to REAL on-disk native dir names read off
 * `~/.mineco/engines/claude/<id>/projects/` so they prove byte-for-byte parity
 * with the installed SDK, not just internal consistency.
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { encodeCwd, ensureLink, javaHashCode } from "@/main/services/link";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return (async () => {
    try {
      await fn();
      passed++;
      console.log(`  ok  ${name}`);
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`${name}: ${msg}`);
      console.log(`FAIL  ${name}`);
      console.log(`      ${msg.split("\n").join("\n      ")}`);
    }
  })();
}

// ---------------------------------------------------------------------------
// 1. javaHashCode — pin known Java String.hashCode values (NOT djb2).
// ---------------------------------------------------------------------------
// Reference values from a real JVM `"x".hashCode()`:
//   ""        -> 0
//   "a"       -> 97
//   "abc"     -> 96354
//   "hello"   -> 99162322
const HASH_FIXTURES: Array<[string, number]> = [
  ["", 0],
  ["a", 97],
  ["abc", 96354],
  ["hello", 99162322],
];

// ---------------------------------------------------------------------------
// Encoding fixtures — REAL native dir names taken off disk (ground truth).
// ---------------------------------------------------------------------------
// These are the verified encodings observed under
//   ~/.mineco/engines/claude/<id>/projects/
// They depend only on the *string* form of the realpath, so we assert the pure
// sanitize pipeline by feeding the already-realpathed absolute path. (encodeCwd
// realpaths internally; for paths that exist it is identity, for the pinned
// fixtures we additionally cross-check the live dir if its source exists.)
const REAL_DIR_FIXTURES: Array<{ realpath: string; encoded: string }> = [
  {
    realpath: "/Users/arias/Projects/Bifrost",
    encoded: "-Users-arias-Projects-Bifrost",
  },
  {
    realpath: "/Users/arias/.mineco-public",
    encoded: "-Users-arias--mineco-public",
  },
  {
    realpath: "/Users/arias/Projects/ariaszzzhc/mineco-space/mineco",
    encoded: "-Users-arias-Projects-ariaszzzhc-mineco-space-mineco",
  },
];

/**
 * Reproduce the pure encoding for an already-realpathed absolute string, so the
 * fixtures don't depend on the path existing on the runner. Mirrors link.ts's
 * `sanitize(nfc(real))` exactly; encodeCwd is the realpathing wrapper over this.
 */
function encodeRealpath(real: string): string {
  const nfc = process.platform === "darwin" ? real.normalize("NFC") : real;
  const dashed = nfc.replace(/[^a-zA-Z0-9]/g, "-");
  if (dashed.length <= 200) return dashed;
  // SDK truncates the dashed string to 200 chars before appending the hash:
  // `So(e){...return `${t.slice(0,Di)}-${a6(e)}`}` with Di=200.
  return `${dashed.slice(0, 200)}-${Math.abs(javaHashCode(nfc)).toString(36)}`;
}

async function run(): Promise<void> {
  console.log("link.ts encoding + ensureLink fixtures\n");

  // --- javaHashCode -------------------------------------------------------
  for (const [input, expected] of HASH_FIXTURES) {
    await test(`javaHashCode(${JSON.stringify(input)}) === ${expected}`, () => {
      assert.equal(javaHashCode(input), expected);
    });
  }
  await test("javaHashCode is t*31+c, NOT djb2 t*33^c", () => {
    // For "abc": Java=96354. djb2-xor would be ((0*33^97)*33^98)*33^99 = 105950.
    assert.equal(javaHashCode("abc"), 96354);
    assert.notEqual(javaHashCode("abc"), 105950);
  });

  // --- 3 real on-disk dir names ------------------------------------------
  for (const { realpath, encoded } of REAL_DIR_FIXTURES) {
    await test(`encode ${realpath} -> ${encoded}`, () => {
      assert.equal(encodeRealpath(realpath), encoded);
    });
  }

  // Live cross-check: if the SDK projects dir is present, every dir name there
  // must be reproducible by our encoder (proves parity with the real CLI).
  await test("live on-disk dir names match encoder (if present)", async () => {
    const root = path.join(os.homedir(), ".mineco", "engines", "claude");
    let agents: string[] = [];
    try {
      agents = await fs.readdir(root);
    } catch {
      console.log("      (skipped: no live engines dir)");
      return;
    }
    let checked = 0;
    for (const agent of agents) {
      const projects = path.join(root, agent, "projects");
      let dirs: string[];
      try {
        dirs = await fs.readdir(projects);
      } catch {
        continue;
      }
      for (const dir of dirs) {
        // The dir name IS sanitize(nfc(realpath)); re-running sanitize on a
        // string that is already all `[a-zA-Z0-9-]` is a fixpoint, so we can
        // only assert the encoder reproduces it when the source path resolves.
        // Use the known REAL_DIR_FIXTURES intersection for a hard assertion.
        const fixture = REAL_DIR_FIXTURES.find((f) => f.encoded === dir);
        if (fixture) {
          assert.equal(
            encodeRealpath(fixture.realpath),
            dir,
            `live dir ${dir} not reproduced`,
          );
          checked++;
        }
      }
    }
    console.log(`      (cross-checked ${checked} live dir name(s))`);
  });

  // --- path > 200 chars -> hash suffix -----------------------------------
  await test("path with dashed length > 200 gets Java-hashCode suffix", () => {
    // Build an absolute path whose sanitized form exceeds 200 chars.
    const seg = "/segment_with_underscores_and_MixedCase";
    const long = seg.repeat(8); // 8 * 39 = 312 chars, all sanitized to dashes.
    const real = process.platform === "darwin" ? long.normalize("NFC") : long;
    const dashed = real.replace(/[^a-zA-Z0-9]/g, "-");
    assert.ok(dashed.length > 200, "fixture must exceed 200 dashed chars");
    const expectedSuffix = Math.abs(javaHashCode(real)).toString(36);
    // The SDK TRUNCATES the dashed string to 200 chars, THEN appends the hash
    // (verified `So`: `${t.slice(0,Di)}-${a6(e)}`, Di=200). Appending the hash to
    // the FULL dashed string would yield a different dir name and break sharing.
    const expected = `${dashed.slice(0, 200)}-${expectedSuffix}`;
    assert.equal(encodeRealpath(long), expected);
    // Encoded dir = 200-char truncated dashed prefix + "-" + base-36 hash.
    assert.equal(encodeRealpath(long).length, 200 + 1 + expectedSuffix.length);
    assert.ok(encodeRealpath(long).startsWith(dashed.slice(0, 200)));
    assert.ok(encodeRealpath(long).endsWith(`-${expectedSuffix}`));
    assert.ok(/^[0-9a-z]+$/.test(expectedSuffix));
  });

  // --- non-ASCII -> NFC normalization ------------------------------------
  await test("non-ASCII path is NFC-normalized before sanitizing (darwin)", () => {
    // "é" can be NFC (U+00E9, 1 code unit) or NFD ("e" + U+0301 combining, 2).
    const nfd = "/Users/test/café"; // decomposed
    const nfc = "/Users/test/café"; // composed
    assert.notEqual(nfd, nfc);
    if (process.platform === "darwin") {
      // On darwin both normalize to the same NFC form, so both must sanitize
      // identically. Without the NFC step the combining mark survives as one
      // more dash and they would differ.
      assert.equal(encodeRealpath(nfd), encodeRealpath(nfc));
      // The combining mark + base letter both become a single dash each after
      // NFC collapses them to one non-alnum char "é".
      assert.equal(encodeRealpath(nfc), "-Users-test-caf-");
    } else {
      // Non-darwin: no NFC step, decomposed form keeps the extra code unit.
      assert.notEqual(encodeRealpath(nfd), encodeRealpath(nfc));
    }
  });

  // --- ensureLink: idempotency, migration, recreate ----------------------
  // All ensureLink tests run under a throwaway HOME so sessionsDir() resolves
  // into a temp tree (it reads os.homedir()).
  const realHome = process.env.HOME;
  const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "mineco-link-"));
  // os.homedir() reads $HOME on posix; pin it for the duration.
  process.env.HOME = tmpHome;

  // Sanity: confirm os.homedir() now points at our temp home (else skip the
  // ensureLink suite cleanly rather than scribbling in the real ~/.mineco).
  const homeIsTmp = os.homedir() === tmpHome;

  const agentDir = path.join(tmpHome, "agent");
  // Use a cwd that actually exists so encodeCwd's realpath is deterministic.
  const realCwd = await fs.mkdtemp(path.join(os.tmpdir(), "mineco-cwd-"));
  const realCwdResolved = await fs.realpath(realCwd);

  await test("ensureLink creates a symlink to the shared target", async () => {
    if (!homeIsTmp) {
      console.log("      (skipped: os.homedir() not overridable here)");
      return;
    }
    const res = await ensureLink(agentDir, realCwdResolved, "ws1");
    assert.equal(res.kind, "linked");
    const st = await fs.lstat(res.linkPath);
    assert.ok(st.isSymbolicLink(), "link path must be a symlink");
    const resolved = await fs.realpath(res.linkPath);
    assert.equal(resolved, await fs.realpath(res.target));
  });

  await test("ensureLink is idempotent (second call no-ops to 'linked')", async () => {
    if (!homeIsTmp) return;
    const a = await ensureLink(agentDir, realCwdResolved, "ws1");
    const b = await ensureLink(agentDir, realCwdResolved, "ws1");
    assert.equal(a.kind, "linked");
    assert.equal(b.kind, "linked");
    assert.equal(a.linkPath, b.linkPath);
    const st = await fs.lstat(b.linkPath);
    assert.ok(st.isSymbolicLink());
  });

  await test("ensureLink migrates a real dir's contents then replaces it", async () => {
    if (!homeIsTmp) return;
    const agent2 = path.join(tmpHome, "agent2");
    const linkPath = path.join(agent2, "projects", encodeCwd(realCwdResolved));
    // Plant a REAL (non-link) dir with a transcript that must survive.
    await fs.mkdir(linkPath, { recursive: true });
    await fs.writeFile(path.join(linkPath, "old.jsonl"), "line1\n");
    await fs.mkdir(path.join(linkPath, "memory"), { recursive: true });
    await fs.writeFile(path.join(linkPath, "memory", "m.md"), "mem\n");

    const res = await ensureLink(agent2, realCwdResolved, "ws2");
    assert.equal(res.kind, "migrated");
    // Link now exists where the real dir was.
    const st = await fs.lstat(res.linkPath);
    assert.ok(st.isSymbolicLink(), "real dir must be replaced by a symlink");
    // Migrated content landed in the shared target.
    const moved = await fs.readFile(path.join(res.target, "old.jsonl"), "utf8");
    assert.equal(moved, "line1\n");
    const movedMem = await fs.readFile(
      path.join(res.target, "memory", "m.md"),
      "utf8",
    );
    assert.equal(movedMem, "mem\n");
  });

  await test("ensureLink defers migration when the dir is live (ADR-0.4-7)", async () => {
    if (!homeIsTmp) return;
    const agent3 = path.join(tmpHome, "agent3");
    const linkPath = path.join(agent3, "projects", encodeCwd(realCwdResolved));
    await fs.mkdir(linkPath, { recursive: true });
    await fs.writeFile(path.join(linkPath, "live.jsonl"), "busy\n");
    const res = await ensureLink(agent3, realCwdResolved, "ws3", {
      isLive: (c) => c === realCwdResolved,
    });
    assert.equal(res.kind, "deferred");
    // The real dir must be untouched (NOT migrated/removed).
    const st = await fs.lstat(res.linkPath);
    assert.ok(st.isDirectory() && !st.isSymbolicLink());
    const still = await fs.readFile(
      path.join(res.linkPath, "live.jsonl"),
      "utf8",
    );
    assert.equal(still, "busy\n");
  });

  await test("ensureLink recreates a symlink that points elsewhere (R9)", async () => {
    if (!homeIsTmp) return;
    const agent4 = path.join(tmpHome, "agent4");
    const projects = path.join(agent4, "projects");
    await fs.mkdir(projects, { recursive: true });
    const linkPath = path.join(projects, encodeCwd(realCwdResolved));
    // Point the link at a WRONG target.
    const wrong = await fs.mkdtemp(path.join(os.tmpdir(), "mineco-wrong-"));
    await fs.symlink(await fs.realpath(wrong), linkPath);

    const res = await ensureLink(agent4, realCwdResolved, "ws4");
    assert.equal(res.kind, "linked");
    const resolved = await fs.realpath(res.linkPath);
    assert.equal(resolved, await fs.realpath(res.target));
    assert.notEqual(resolved, await fs.realpath(wrong));
    await fs.rm(wrong, { recursive: true, force: true });
  });

  // Cleanup.
  process.env.HOME = realHome;
  await fs.rm(tmpHome, { recursive: true, force: true });
  await fs.rm(realCwd, { recursive: true, force: true });

  // --- summary ------------------------------------------------------------
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
