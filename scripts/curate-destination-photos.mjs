#!/usr/bin/env node
// Curate Unsplash photos for the 38 fallback destinations in
// src/lib/destinationGuides.ts (entries with hero === "" or theme.photo === "").
//
// Pipeline per destination:
//   1. Build a search query for the hero (from the slug + a sensible cue).
//   2. Build a query for each empty theme (from the theme title + slug context,
//      with generic decorators stripped).
//   3. Hit Unsplash /search/photos, take the first landscape result.
//   4. Save full UnsplashPhotoMeta + audit row to checkpoint after each
//      destination so we can resume.
//
// Rate limiting: Unsplash demo tier is 50 req/hour. We read X-Ratelimit-Remaining
// from each response and sleep until ~the top of the next hour when remaining
// drops to <=2, instead of failing.
//
// Outputs (only after every destination is curated):
//   - src/lib/destinationGuides.ts patched in place (only the empty entries)
//   - /tmp/photo-curation-audit.json for manual review
//
// Usage:
//   UNSPLASH_ACCESS_KEY=... node scripts/curate-destination-photos.mjs
//
// Re-run after a crash and it picks up from /tmp/curation-checkpoint.json.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/* ─────────────── config ─────────────── */

const KEY = process.env.UNSPLASH_ACCESS_KEY;
if (!KEY) {
  console.error("FATAL: UNSPLASH_ACCESS_KEY env var is not set.");
  console.error("Run: UNSPLASH_ACCESS_KEY=... node scripts/curate-destination-photos.mjs");
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), "..");
const SRC_PATH = resolve(REPO_ROOT, "src/lib/destinationGuides.ts");
const CHECKPOINT_PATH = "/tmp/curation-checkpoint.json";
const AUDIT_PATH = "/tmp/photo-curation-audit.json";

const PER_REQUEST_DELAY_MS = 1100; // be polite under any tier
const RATE_LIMIT_FLOOR = 2;        // sleep when X-Ratelimit-Remaining <= this
const SLEEP_MS_ON_FLOOR = 60 * 60 * 1000 + 30 * 1000; // ~1h, with 30s slack

/* ─────────────── small utils ─────────────── */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadCheckpoint() {
  if (!existsSync(CHECKPOINT_PATH)) {
    return { completed: {}, audit: {}, stats: { totalCalls: 0, failures: [] } };
  }
  try {
    return JSON.parse(readFileSync(CHECKPOINT_PATH, "utf8"));
  } catch (e) {
    console.error(`! Could not parse ${CHECKPOINT_PATH}: ${e.message}`);
    console.error("  Move it aside if you want to start fresh. Aborting.");
    process.exit(1);
  }
}

function saveCheckpoint(cp) {
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2));
}

/* ─────────────── parse destinationGuides.ts ─────────────── */

// Walk the DESTINATION_GUIDES object literal, collecting:
//   { slug, blockStart, blockEnd, heroEmpty, heroLineIdx, themes: [{title, lineIdx, photoEmpty}] }
//
// Single-line theme assumption: themes are written one per line as
//   { title: "...", description: "...", photo: ... },
// which holds for the entire file today. We assert this on parse and bail
// loudly if it ever changes.

function parseDestinations(src) {
  const lines = src.split("\n");

  // Find DESTINATION_GUIDES start
  const startIdx = lines.findIndex((l) =>
    /export const DESTINATION_GUIDES\b/.test(l),
  );
  if (startIdx === -1) {
    throw new Error("Could not find DESTINATION_GUIDES export in source file.");
  }

  // Walk lines after start, collecting destinations.
  const slugRe = /^\s*"([a-z0-9-]+)":\s*\{$/;
  const heroRe = /^(\s*)hero:\s*("([^"\\]*(?:\\.[^"\\]*)*)"|U\([^)]*\)|\{[^}]*\})\s*,?\s*$/;
  const themeRe = /^(\s*)\{\s*title:\s*"((?:[^"\\]|\\.)*)"\s*,/;
  const themePhotoEmptyRe = /,\s*photo:\s*""\s*\}/;

  const dests = [];
  let current = null;

  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];

    const slugMatch = line.match(slugRe);
    if (slugMatch) {
      if (current) dests.push(current);
      current = {
        slug: slugMatch[1],
        startLine: i,
        heroEmpty: false,
        heroLineIdx: -1,
        themes: [],
      };
      continue;
    }
    if (!current) {
      // Reached the closing `};` of DESTINATION_GUIDES, stop.
      if (/^\};\s*$/.test(line)) break;
      continue;
    }

    if (current.heroLineIdx === -1) {
      const h = line.match(heroRe);
      if (h) {
        current.heroLineIdx = i;
        current.heroEmpty = h[2] === '""';
        continue;
      }
    }

    const t = line.match(themeRe);
    if (t) {
      const title = t[2];
      const photoEmpty = themePhotoEmptyRe.test(line);
      current.themes.push({ title, lineIdx: i, photoEmpty });
      continue;
    }
  }
  if (current) dests.push(current);

  return dests;
}

/* ─────────────── query construction ─────────────── */

// Cities (vs countries/regions) that benefit from a "skyline"/"cityscape" hero
// cue rather than "landscape". Slug-derived names — checked lower-case.
const CITY_SLUGS = new Set([
  "hamburg",
  "ibiza",
  "reykjavik",
  "prague",
  "istanbul",
  "kyoto",
  "phuket",
  "singapore",
  "bora bora",
  "petra",
  "maldives",
  "seychelles",
]);

function slugToBase(slug) {
  return slug.replace(/-\d+-days?$/, "").replace(/-/g, " ");
}

function buildHeroQuery(slug) {
  const base = slugToBase(slug);
  const lower = base.toLowerCase();
  if (CITY_SLUGS.has(lower)) return `${base} skyline`;
  return `${base} landscape`;
}

// Strip diacritics (Á → A) for query stability.
function deburr(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const GENERIC_PHRASES = [
  "at golden hour",
  "at sunset",
  "at sunrise",
  "at dawn",
  "at dusk",
  "by night",
  "by day",
  "after dark",
  "until sunrise",
  "in the morning",
  "in the evening",
];
const GENERIC_WORDS = [
  "wandering",
  "walking",
  "tour",
  "crawl",
  "safari",
  "experience",
  "adventures?",
  "weekend",
  "morning",
  "evening",
  "afternoon",
];

function buildThemeQuery(title, slug) {
  let q = deburr(title);
  // Drop trailing parenthetical and clauses after a colon
  q = q.replace(/\s*\([^)]*\)\s*/g, " ");
  q = q.split(":")[0];

  for (const phrase of GENERIC_PHRASES) {
    q = q.replace(new RegExp(`\\b${phrase}\\b`, "gi"), " ");
  }
  for (const w of GENERIC_WORDS) {
    q = q.replace(new RegExp(`\\b${w}\\b`, "gi"), " ");
  }

  q = q.replace(/'s\b/g, ""); // possessive 's
  q = q.replace(/\bthe\b/gi, " ");
  q = q.replace(/\band\b/gi, " ");
  q = q.replace(/[,&/]/g, " ");
  q = q.replace(/\s+/g, " ").trim();

  // Always append the destination slug for geographic disambiguation.
  // ("Comuna 13" alone is ambiguous; "Comuna 13 colombia" is not.)
  const base = slugToBase(slug);
  if (!q.toLowerCase().includes(base.toLowerCase())) {
    q = `${q} ${base}`.trim();
  }
  return q;
}

/* ─────────────── Unsplash client ─────────────── */

let rateLimitRemaining = Infinity;

async function unsplashSearch(query) {
  if (rateLimitRemaining <= RATE_LIMIT_FLOOR) {
    const mins = Math.ceil(SLEEP_MS_ON_FLOOR / 60000);
    console.error(
      `   ⏸  Rate limit at ${rateLimitRemaining}/hr remaining — sleeping ~${mins}min before next call.`,
    );
    await sleep(SLEEP_MS_ON_FLOOR);
    rateLimitRemaining = Infinity; // assume the new hour reset us
  }

  const url =
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}` +
    `&per_page=5&orientation=landscape&content_filter=high`;

  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${KEY}` },
  });

  // Update remaining from headers
  const remHeader = res.headers.get("x-ratelimit-remaining");
  if (remHeader != null) rateLimitRemaining = parseInt(remHeader, 10);

  if (res.status === 403) {
    // Could be rate-limit (msg includes "Rate Limit Exceeded") or auth.
    const body = await res.text();
    if (/rate limit/i.test(body)) {
      console.error(`   ⏸  Got 403 Rate Limit Exceeded — sleeping ~1h then retrying.`);
      await sleep(SLEEP_MS_ON_FLOOR);
      rateLimitRemaining = Infinity;
      return unsplashSearch(query);
    }
    throw new Error(`Unsplash 403 (auth?): ${body.slice(0, 200)}`);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Unsplash HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.results || [];
}

// Run a query, falling back to progressively shorter prefixes if no results.
async function search(query) {
  const words = query.split(/\s+/).filter(Boolean);
  for (let i = words.length; i >= 1; i--) {
    const q = words.slice(0, i).join(" ");
    const results = await unsplashSearch(q);
    await sleep(PER_REQUEST_DELAY_MS);
    if (results.length > 0) {
      const p = results[0];
      return {
        meta: {
          url: `${p.urls.raw}&w=1600&q=80&auto=format&fit=crop`,
          photoId: p.id,
          photographerName: p.user.name,
          photographerUrl: `${p.user.links.html}?utm_source=junto&utm_medium=referral`,
          downloadLocation: p.links.download_location,
        },
        matchedQuery: q,
      };
    }
    console.error(`     (no results for "${q}", trying shorter prefix)`);
  }
  throw new Error(`No Unsplash results for any prefix of "${query}"`);
}

/* ─────────────── source-file patcher ─────────────── */

// Render an UnsplashPhotoMeta as a TS object literal on a single line.
function renderMeta(meta) {
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return (
    `{ url: "${esc(meta.url)}", ` +
    `photoId: "${esc(meta.photoId)}", ` +
    `photographerName: "${esc(meta.photographerName)}", ` +
    `photographerUrl: "${esc(meta.photographerUrl)}", ` +
    `downloadLocation: "${esc(meta.downloadLocation)}" }`
  );
}

function patchSource(src, dests, completed) {
  const lines = src.split("\n");

  for (const d of dests) {
    const done = completed[d.slug];
    if (!done) continue;

    if (d.heroEmpty && done.hero) {
      const orig = lines[d.heroLineIdx];
      const replaced = orig.replace(
        /hero:\s*""(\s*,?)/,
        `hero: ${renderMeta(done.hero)}$1`,
      );
      if (replaced === orig) {
        throw new Error(
          `Patcher: hero line for ${d.slug} did not match expected pattern: ${orig}`,
        );
      }
      lines[d.heroLineIdx] = replaced;
    }

    for (const t of d.themes) {
      if (!t.photoEmpty) continue;
      const meta = done.themes?.[t.title];
      if (!meta) continue;
      const orig = lines[t.lineIdx];
      const replaced = orig.replace(
        /(,\s*photo:\s*)""(\s*\})/,
        `$1${renderMeta(meta)}$2`,
      );
      if (replaced === orig) {
        throw new Error(
          `Patcher: theme line for ${d.slug} / "${t.title}" did not match expected pattern: ${orig}`,
        );
      }
      lines[t.lineIdx] = replaced;
    }
  }

  return lines.join("\n");
}

/* ─────────────── main ─────────────── */

async function main() {
  if (!existsSync(SRC_PATH)) {
    console.error(`FATAL: source file not found at ${SRC_PATH}`);
    process.exit(1);
  }
  const src = readFileSync(SRC_PATH, "utf8");
  const dests = parseDestinations(src);
  const todo = dests.filter(
    (d) => d.heroEmpty || d.themes.some((t) => t.photoEmpty),
  );

  console.error(`Found ${dests.length} destinations, ${todo.length} need photos.`);

  const cp = loadCheckpoint();
  const startedCalls = cp.stats.totalCalls;
  let calls = 0;

  for (let idx = 0; idx < todo.length; idx++) {
    const d = todo[idx];
    const need = (d.heroEmpty ? 1 : 0) + d.themes.filter((t) => t.photoEmpty).length;

    // Skip fully-completed destinations.
    const existing = cp.completed[d.slug];
    if (existing) {
      const haveHero = !d.heroEmpty || !!existing.hero;
      const haveAllThemes = d.themes.every(
        (t) => !t.photoEmpty || !!existing.themes?.[t.title],
      );
      if (haveHero && haveAllThemes) {
        console.error(
          `[${idx + 1}/${todo.length}] ${d.slug} — already curated, skip`,
        );
        continue;
      }
    }

    console.error(
      `[${idx + 1}/${todo.length}] ${d.slug} — need ${need} photo${need === 1 ? "" : "s"}`,
    );

    const slot = cp.completed[d.slug] || { hero: null, themes: {} };

    try {
      // Hero
      if (d.heroEmpty && !slot.hero) {
        const q = buildHeroQuery(d.slug);
        const { meta, matchedQuery } = await search(q);
        calls++;
        slot.hero = meta;
        cp.audit[`${d.slug}::hero`] = {
          query: q,
          matched_query: matchedQuery,
          chosen_url: meta.url,
          chosen_photoId: meta.photoId,
          photographer: meta.photographerName,
        };
        console.error(`   ✓ hero: ${meta.photoId} by ${meta.photographerName} (q="${matchedQuery}")`);
      }

      // Themes
      for (const t of d.themes) {
        if (!t.photoEmpty) continue;
        if (slot.themes[t.title]) continue;
        const q = buildThemeQuery(t.title, d.slug);
        const { meta, matchedQuery } = await search(q);
        calls++;
        slot.themes[t.title] = meta;
        cp.audit[`${d.slug}::${t.title}`] = {
          query: q,
          matched_query: matchedQuery,
          chosen_url: meta.url,
          chosen_photoId: meta.photoId,
          photographer: meta.photographerName,
        };
        console.error(`   ✓ "${t.title}": ${meta.photoId} by ${meta.photographerName} (q="${matchedQuery}")`);
      }

      cp.completed[d.slug] = slot;
      cp.stats.totalCalls = startedCalls + calls;
      saveCheckpoint(cp);

      const totalThemes = d.themes.filter((t) => t.photoEmpty).length;
      const heroDone = d.heroEmpty ? 1 : 0;
      const totalPhotos = totalThemes + heroDone;
      console.error(`   ✓ ${d.slug}: ${totalPhotos}/${totalPhotos} photos curated`);
    } catch (e) {
      console.error(`   ✗ ${d.slug} failed: ${e.message}`);
      cp.stats.failures.push({ slug: d.slug, error: e.message, at: new Date().toISOString() });
      // Persist partial progress, then keep going to next destination.
      cp.completed[d.slug] = slot;
      saveCheckpoint(cp);
    }
  }

  /* ─── final write: patch source + audit ─── */

  // Re-check completeness across all todo entries before patching.
  const stillMissing = [];
  for (const d of todo) {
    const slot = cp.completed[d.slug];
    if (d.heroEmpty && !slot?.hero) stillMissing.push(`${d.slug}::hero`);
    for (const t of d.themes) {
      if (t.photoEmpty && !slot?.themes?.[t.title]) {
        stillMissing.push(`${d.slug}::${t.title}`);
      }
    }
  }

  if (stillMissing.length > 0) {
    console.error(
      `\n! Skipping file patch: ${stillMissing.length} entries still missing.`,
    );
    console.error("  Re-run the script to retry. Missing:");
    for (const m of stillMissing.slice(0, 20)) console.error(`    - ${m}`);
    if (stillMissing.length > 20) {
      console.error(`    ... and ${stillMissing.length - 20} more`);
    }
  } else {
    const patched = patchSource(src, dests, cp.completed);
    writeFileSync(SRC_PATH, patched);
    console.error(`\n✓ Patched ${SRC_PATH}`);

    // Sanity-check: no `hero: ""` and no `, photo: "" }` remain in DESTINATION_GUIDES.
    const remainingHero = (patched.match(/hero:\s*""/g) || []).length;
    const remainingPhoto = (patched.match(/,\s*photo:\s*""\s*\}/g) || []).length;
    if (remainingHero || remainingPhoto) {
      console.error(
        `! Sanity check: ${remainingHero} empty hero(s) and ${remainingPhoto} empty theme photo(s) still in file.`,
      );
    }
  }

  // Audit: always written, regardless of completeness, so partial runs are reviewable.
  mkdirSync(dirname(AUDIT_PATH), { recursive: true });
  writeFileSync(AUDIT_PATH, JSON.stringify(cp.audit, null, 2));
  console.error(`✓ Audit written to ${AUDIT_PATH} (${Object.keys(cp.audit).length} entries)`);

  /* ─── summary ─── */
  console.error(`\n── Summary ──`);
  console.error(`  Calls this run:   ${calls}`);
  console.error(`  Calls cumulative: ${cp.stats.totalCalls}`);
  console.error(`  Destinations completed: ${Object.keys(cp.completed).length} / ${todo.length}`);
  if (cp.stats.failures.length > 0) {
    console.error(`  Failures (${cp.stats.failures.length}):`);
    for (const f of cp.stats.failures.slice(-10)) {
      console.error(`    - ${f.slug}: ${f.error}`);
    }
  }
  if (stillMissing.length > 0) process.exit(2);
}

main().catch((e) => {
  console.error(`\nFATAL: ${e.stack || e.message}`);
  process.exit(1);
});
