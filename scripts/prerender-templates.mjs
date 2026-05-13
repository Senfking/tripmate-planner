#!/usr/bin/env node
// Prerender every /templates/<slug> page from the live deployed site so the
// SEO meta + JSON-LD + visible content land in the raw HTML before any JS
// executes. LLM crawlers and social unfurlers (Slack, LinkedIn, X) don't run
// React, so the SPA shell alone serves them an empty body.
//
// Behavior:
//   - Reads slugs from src/lib/destinationGuides.ts (DESTINATION_GUIDES keys).
//   - Launches headless Chromium via puppeteer.
//   - For each slug: navigate to BASE_URL/templates/<slug>, wait for network
//     idle + a stable DOM marker (TouristTrip JSON-LD script), capture
//     document.documentElement.outerHTML, write to
//     public/templates/<slug>/index.html.
//   - Strips Vite's runtime <script type="module"> tags is NOT done — the
//     snapshot retains them so the SPA hydrates on top when the user (not a
//     crawler) loads the page. This is a "static-first, JS-progressive"
//     setup: bots get fully-rendered HTML, humans get the live SPA.
//
// Run locally: BASE_URL=https://junto.pro node scripts/prerender-templates.mjs
//
// Run inside CI: see .github/workflows/prerender-templates.yml.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// puppeteer is imported lazily inside main() so the test harness (which
// drives runPrerender with a stub) can import this module without needing
// puppeteer installed locally — CI installs it via `npm install --no-save`.

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const GUIDES_FILE = resolve(REPO_ROOT, "src/lib/destinationGuides.ts");
const OUT_ROOT = resolve(REPO_ROOT, "public/templates");
// Workspace-relative sidecar listing every page that failed in this run.
// The auto-PR step reads this to append a "Failed pages" section so each
// failure is surfaced for manual investigation instead of silently retried.
const FAILED_SIDECAR_PATH = resolve(REPO_ROOT, "prerender-failed.json");

const BASE_URL = (process.env.BASE_URL || "https://junto.pro").replace(/\/$/, "");
const NAV_TIMEOUT_MS = Number(process.env.NAV_TIMEOUT_MS || 60_000);
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || 3));

async function readSlugs() {
  const src = await readFile(GUIDES_FILE, "utf8");
  const start = src.indexOf("DESTINATION_GUIDES");
  if (start < 0) throw new Error("DESTINATION_GUIDES not found in destinationGuides.ts");
  const braceOpen = src.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (let i = braceOpen; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error("Could not locate end of DESTINATION_GUIDES object");
  const block = src.slice(braceOpen, end + 1);
  // Top-level keys only: indentation of exactly two spaces inside the object.
  const slugs = new Set();
  for (const line of block.split("\n")) {
    const m = line.match(/^  "([a-z0-9-]+)":\s*\{/);
    if (m) slugs.add(m[1]);
  }
  return [...slugs].sort();
}

async function renderOne(browser, slug) {
  const url = `${BASE_URL}/templates/${slug}`;
  const startedAt = Date.now();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 1800, deviceScaleFactor: 1 });
    await page.setUserAgent(
      "Mozilla/5.0 (compatible; JuntoPrerender/1.0; +https://junto.pro)",
    );
    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
    page.setDefaultTimeout(NAV_TIMEOUT_MS);

    await page.goto(url, { waitUntil: "networkidle0", timeout: NAV_TIMEOUT_MS });

    // Stable DOM marker: TemplateSEO emits a <script type="application/ld+json">
    // containing "TouristTrip" once the route resolves. This guarantees the
    // page rendered the real template and not the loading spinner / 404 path.
    await page.waitForFunction(
      () => {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const s of scripts) {
          if ((s.textContent || "").includes("TouristTrip")) return true;
        }
        return false;
      },
      { timeout: NAV_TIMEOUT_MS },
    );

    // <h1> is the destination name — confirms hero rendered too.
    await page.waitForSelector("h1", { timeout: NAV_TIMEOUT_MS });

    const html = await page.evaluate(() => "<!DOCTYPE html>\n" + document.documentElement.outerHTML);
    const title = await page.title();
    const hasJsonLd = html.includes("\"TouristTrip\"") || html.includes("'TouristTrip'");
    if (!title || !hasJsonLd) {
      throw new Error(
        `Capture missing title or TouristTrip JSON-LD for ${slug} (title=${JSON.stringify(title)}, jsonLd=${hasJsonLd})`,
      );
    }

    const outDir = resolve(OUT_ROOT, slug);
    await mkdir(outDir, { recursive: true });
    await writeFile(resolve(outDir, "index.html"), html, "utf8");
    return { slug, ok: true, bytes: html.length, elapsedMs: Date.now() - startedAt };
  } finally {
    await page.close().catch(() => {});
  }
}

async function runWithConcurrency(items, limit, fn) {
  const results = [];
  let cursor = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      const item = items[idx];
      const startedAt = Date.now();
      try {
        const r = await fn(item);
        results.push(r);
        console.log(
          `[${idx + 1}/${items.length}] ok  ${item} (${r.bytes} bytes, ${r.elapsedMs ?? Date.now() - startedAt}ms)`,
        );
      } catch (err) {
        const elapsedMs = Date.now() - startedAt;
        console.error(`[${idx + 1}/${items.length}] FAIL ${item} (${elapsedMs}ms): ${err.message}`);
        // Swallow per-page errors so a single broken page never bails the
        // whole run. The sidecar + summary at the end of main() surfaces
        // each failure for the PR description and manual investigation.
        results.push({ slug: item, ok: false, error: err.message, elapsedMs });
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export async function runPrerender({
  slugs,
  concurrency = CONCURRENCY,
  renderSlug,
  writeFailedSidecar = writeFailedSidecarToDisk,
} = {}) {
  if (!Array.isArray(slugs) || slugs.length === 0) {
    throw new Error("runPrerender: slugs must be a non-empty array");
  }
  if (typeof renderSlug !== "function") {
    throw new Error("runPrerender: renderSlug must be a function");
  }

  const results = await runWithConcurrency(slugs, concurrency, renderSlug);

  const succeeded = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  // Always write the sidecar (even when empty) so the workflow can rely on
  // its presence — an empty array signals "every page succeeded".
  await writeFailedSidecar(
    failed.map((f) => ({ slug: f.slug, error: f.error, elapsedMs: f.elapsedMs })),
  );

  console.log(`\nDone. ${succeeded.length}/${results.length} succeeded, ${failed.length} failed.`);
  if (failed.length > 0) {
    console.error("Failed slugs (need manual investigation):");
    for (const f of failed) {
      console.error(` - ${f.slug} (${f.elapsedMs}ms): ${f.error}`);
    }
  }

  // Exit 0 as long as at least one page rendered. The partial snapshots
  // still ship via the auto-PR; only a fully-broken run (0 successes,
  // entire site down or BASE_URL misconfigured) is a hard failure.
  return {
    exitCode: succeeded.length > 0 ? 0 : 1,
    succeeded,
    failed,
    results,
  };
}

async function writeFailedSidecarToDisk(entries) {
  await writeFile(FAILED_SIDECAR_PATH, JSON.stringify(entries, null, 2) + "\n", "utf8");
}

async function main() {
  const slugs = await readSlugs();
  console.log(`Prerendering ${slugs.length} template pages from ${BASE_URL}`);
  if (slugs.length === 0) throw new Error("No slugs parsed from destinationGuides.ts");

  const { default: puppeteer } = await import("puppeteer");
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
  let outcome;
  try {
    outcome = await runPrerender({
      slugs,
      concurrency: CONCURRENCY,
      renderSlug: (slug) => renderOne(browser, slug),
    });
  } finally {
    await browser.close().catch(() => {});
  }

  process.exit(outcome.exitCode);
}

// Only run main() when invoked directly (node scripts/prerender-templates.mjs).
// Importing this file from a test harness leaves main() dormant so tests can
// drive runPrerender with a mock renderSlug.
const isDirectInvocation = import.meta.url === pathToFileURL(process.argv[1] || "").href;
if (isDirectInvocation) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
