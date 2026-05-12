#!/usr/bin/env node
// Standalone test harness for scripts/prerender-templates.mjs.
//
// Runs without vitest because vitest is scoped to src/**. Invoke with:
//   node scripts/__tests__/prerender-templates.test.mjs
//
// Covers the partial-completion contract added alongside this file:
//   - one slug fails → other slugs still render
//   - exit code is 0 when ≥1 page succeeds
//   - exit code is 1 only when 0 pages succeed
//   - prerender-failed.json sidecar lists each failure with elapsedMs

import assert from "node:assert/strict";

import { runPrerender } from "../prerender-templates.mjs";

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ok  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  FAIL ${name}`);
    console.error(e?.stack || e);
    failed++;
  }
}

// Captured sidecar payload — replaces the disk write so the test stays hermetic.
function makeSidecarSpy() {
  const calls = [];
  return {
    calls,
    write: async (entries) => {
      calls.push(entries);
    },
  };
}

// Render stub: succeed for every slug except the ones in `failingSlugs`.
// Simulates the bali-7-days timeout behaviour by sleeping a bit then throwing.
function makeRenderStub(failingSlugs, { failMs = 5, okMs = 1 } = {}) {
  return async (slug) => {
    const startedAt = Date.now();
    if (failingSlugs.includes(slug)) {
      await new Promise((r) => setTimeout(r, failMs));
      throw new Error(`waiting for function failed: timeout ${failMs}ms exceeded`);
    }
    await new Promise((r) => setTimeout(r, okMs));
    return {
      slug,
      ok: true,
      bytes: 12345,
      elapsedMs: Date.now() - startedAt,
    };
  };
}

console.log("prerender-templates.mjs — partial-completion contract");

await test("one slug fails, others succeed → exit 0", async () => {
  const sidecar = makeSidecarSpy();
  const slugs = ["tulum-5-days", "bali-7-days", "kyoto-3-days", "lisbon-4-days"];
  const outcome = await runPrerender({
    slugs,
    concurrency: 2,
    renderSlug: makeRenderStub(["bali-7-days"]),
    writeFailedSidecar: sidecar.write,
  });

  assert.equal(outcome.exitCode, 0, "exit code should be 0 when at least one page succeeds");
  assert.equal(outcome.succeeded.length, 3, "three slugs should have succeeded");
  assert.equal(outcome.failed.length, 1, "exactly one slug should have failed");
  assert.equal(outcome.failed[0].slug, "bali-7-days");
});

await test("sidecar written with failure entries (slug, error, elapsedMs)", async () => {
  const sidecar = makeSidecarSpy();
  await runPrerender({
    slugs: ["a", "b", "c"],
    concurrency: 3,
    renderSlug: makeRenderStub(["b"]),
    writeFailedSidecar: sidecar.write,
  });

  assert.equal(sidecar.calls.length, 1, "sidecar should be written exactly once");
  const entries = sidecar.calls[0];
  assert.equal(entries.length, 1, "sidecar should contain one failure entry");
  assert.equal(entries[0].slug, "b");
  assert.match(entries[0].error, /timeout/);
  assert.equal(typeof entries[0].elapsedMs, "number");
  assert.ok(entries[0].elapsedMs >= 0, "elapsedMs should be a non-negative number");
});

await test("all pages succeed → sidecar is an empty array, exit 0", async () => {
  const sidecar = makeSidecarSpy();
  const outcome = await runPrerender({
    slugs: ["a", "b", "c"],
    concurrency: 3,
    renderSlug: makeRenderStub([]),
    writeFailedSidecar: sidecar.write,
  });

  assert.equal(outcome.exitCode, 0);
  assert.deepEqual(sidecar.calls[0], [], "empty failure list when nothing failed");
});

await test("all pages fail → exit 1 (entire site broken)", async () => {
  const sidecar = makeSidecarSpy();
  const slugs = ["a", "b", "c"];
  const outcome = await runPrerender({
    slugs,
    concurrency: 2,
    renderSlug: makeRenderStub(slugs),
    writeFailedSidecar: sidecar.write,
  });

  assert.equal(outcome.exitCode, 1, "exit code should be 1 when zero pages succeed");
  assert.equal(outcome.failed.length, 3);
  assert.equal(sidecar.calls[0].length, 3);
});

await test("failure in one worker does not block other workers", async () => {
  // With concurrency=1 a thrown error would still need to be swallowed for
  // subsequent slugs to be attempted. This is the regression that broke the
  // first prerender pipeline runs.
  const sidecar = makeSidecarSpy();
  const slugs = ["bali-7-days", "tulum-5-days", "kyoto-3-days"];
  const outcome = await runPrerender({
    slugs,
    concurrency: 1,
    renderSlug: makeRenderStub(["bali-7-days"]),
    writeFailedSidecar: sidecar.write,
  });

  assert.equal(outcome.exitCode, 0);
  const succeededSlugs = outcome.succeeded.map((r) => r.slug).sort();
  assert.deepEqual(succeededSlugs, ["kyoto-3-days", "tulum-5-days"]);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
