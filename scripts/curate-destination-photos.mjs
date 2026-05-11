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

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
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

// Flag files are workspace-relative because the workflow gates the PR step on
// hashFiles('curation-complete.flag'), which only resolves paths inside
// GITHUB_WORKSPACE per GitHub's expression docs. (Audit + checkpoint stay in
// /tmp because they are passed by absolute path to actions/cache and
// actions/upload-artifact, which have no such restriction.)
const FLAG_DIR = process.env.GITHUB_WORKSPACE || process.cwd();
const COMPLETE_FLAG_PATH = resolve(FLAG_DIR, "curation-complete.flag");
const INCOMPLETE_FLAG_PATH = resolve(FLAG_DIR, "curation-incomplete.flag");
// Workspace-relative sidecar: list of theme/hero entries that returned zero
// Unsplash results across every prefix retry. The workflow's auto-PR step
// reads this so reviewers know exactly what needs a manual photoId override
// after merging.
const NO_MATCH_LIST_PATH = resolve(FLAG_DIR, "curation-no-match.json");

// Per-request delay; overridable for tests.
const PER_REQUEST_DELAY_MS = parseInt(process.env.PER_REQUEST_DELAY_MS || "1100", 10);
const RATE_LIMIT_FLOOR = 2;        // sleep when X-Ratelimit-Remaining <= this
const SLEEP_MS_ON_FLOOR = 60 * 60 * 1000 + 30 * 1000; // ~1h, with 30s slack

// Time budget. WORKFLOW_TIMEOUT_MINUTES is the workflow's job timeout; we exit
// gracefully 3 minutes early so the post-cache step still has time to save
// state. parseFloat lets tests pass fractional values.
const WORKFLOW_TIMEOUT_MINUTES = parseFloat(process.env.WORKFLOW_TIMEOUT_MINUTES || "358");
const BUDGET_SAFETY_MARGIN_MS = 3 * 60 * 1000;
const BUDGET_MS = Math.max(0, WORKFLOW_TIMEOUT_MINUTES * 60 * 1000 - BUDGET_SAFETY_MARGIN_MS);
const SCRIPT_START = Date.now();

class BudgetExhausted extends Error {
  constructor(reason) { super(reason); this.name = "BudgetExhausted"; }
}

function msElapsed() { return Date.now() - SCRIPT_START; }
function budgetExceeded(extraMs = 0) {
  return msElapsed() + extraMs >= BUDGET_MS;
}

/* ─────────────── small utils ─────────────── */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function removeFlagsAtStartup() {
  // Stale flags from a prior run could mislead the workflow's PR-creation step.
  // Cache only restores /tmp/curation-checkpoint.json + /tmp/photo-curation-audit.json,
  // but be defensive — wipe them anyway so the current run's state is authoritative.
  for (const p of [COMPLETE_FLAG_PATH, INCOMPLETE_FLAG_PATH, NO_MATCH_LIST_PATH]) {
    try { if (existsSync(p)) unlinkSync(p); } catch { /* noop */ }
  }
}

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
    if (budgetExceeded(SLEEP_MS_ON_FLOOR)) {
      throw new BudgetExhausted(
        `would exceed time budget if we sleep ~1h for rate-limit reset`,
      );
    }
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
      if (budgetExceeded(SLEEP_MS_ON_FLOOR)) {
        throw new BudgetExhausted(
          `would exceed time budget if we sleep ~1h for 403 rate-limit retry`,
        );
      }
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
// Returns either { meta, matchedQuery } on a hit or { noMatch: true,
// attemptedQueries: [...] } when every prefix returned zero results. The
// no-match outcome is deterministic for a given (query, Unsplash corpus), so
// the caller flags the entry for manual override and moves on rather than
// abandoning the whole destination — see main loop.
async function search(query) {
  const words = query.split(/\s+/).filter(Boolean);
  const attemptedQueries = [];
  for (let i = words.length; i >= 1; i--) {
    const q = words.slice(0, i).join(" ");
    attemptedQueries.push(q);
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
  return { noMatch: true, attemptedQueries };
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
  removeFlagsAtStartup();

  // Capture source as it is at the start of this run. The patcher applies
  // every completed-so-far entry against this same base, so repeatedly calling
  // patchSource is idempotent. (On a re-run via cache restore, the workspace
  // is freshly checked out — empty placeholders are still present, and
  // checkpoint completion data dictates which lines get patched.)
  const srcAtRunStart = readFileSync(SRC_PATH, "utf8");
  const dests = parseDestinations(srcAtRunStart);
  const todo = dests.filter(
    (d) => d.heroEmpty || d.themes.some((t) => t.photoEmpty),
  );

  console.error(`Found ${dests.length} destinations, ${todo.length} need photos.`);
  console.error(
    `Time budget: ${WORKFLOW_TIMEOUT_MINUTES.toFixed(2)}min total (` +
      `${(BUDGET_MS / 60000).toFixed(2)}min after ${BUDGET_SAFETY_MARGIN_MS / 60000}min safety margin).`,
  );

  const cp = loadCheckpoint();
  const startedCalls = cp.stats.totalCalls;
  let calls = 0;

  // Helper: persist all state to disk. Called after each destination so a
  // SIGKILL in the middle of the next destination still leaves usable artifacts.
  const flushPartialState = () => {
    saveCheckpoint(cp);
    mkdirSync(dirname(AUDIT_PATH), { recursive: true });
    writeFileSync(AUDIT_PATH, JSON.stringify(cp.audit, null, 2));
    const patched = patchSource(srcAtRunStart, dests, cp.completed);
    writeFileSync(SRC_PATH, patched);
  };

  // An entry is "attempted" if it either has a curated photo OR has been
  // recorded in the audit as a deterministic no_unsplash_match. The latter
  // are flagged for manual override and must not block completion.
  const isNoUnsplashMatch = (key) =>
    cp.audit[key]?.status === "no_unsplash_match";

  // Helper: count how many of the current todo set are still missing photos.
  const countStillMissing = () => {
    const missing = [];
    for (const d of todo) {
      const slot = cp.completed[d.slug];
      if (d.heroEmpty && !slot?.hero && !isNoUnsplashMatch(`${d.slug}::hero`)) {
        missing.push(`${d.slug}::hero`);
      }
      for (const t of d.themes) {
        if (
          t.photoEmpty &&
          !slot?.themes?.[t.title] &&
          !isNoUnsplashMatch(`${d.slug}::${t.title}`)
        ) {
          missing.push(`${d.slug}::${t.title}`);
        }
      }
    }
    return missing;
  };

  // Collect every audit key recorded as no_unsplash_match for the summary.
  const collectNoMatchEntries = () =>
    Object.entries(cp.audit)
      .filter(([, v]) => v?.status === "no_unsplash_match")
      .map(([key, v]) => ({
        key,
        query: v.query,
        attempted_queries: v.attempted_queries || [],
      }));

  let exitedEarly = false;
  let exitReason = "";

  try {
    for (let idx = 0; idx < todo.length; idx++) {
      // Pre-loop budget check: if we likely can't finish even one more
      // destination's photos, stop here so the cache step has time to save.
      if (budgetExceeded(0)) {
        throw new BudgetExhausted(
          `time budget reached before destination ${idx + 1}/${todo.length}`,
        );
      }

      const d = todo[idx];
      const need = (d.heroEmpty ? 1 : 0) + d.themes.filter((t) => t.photoEmpty).length;

      // Skip fully-attempted destinations. A hero/theme counts as attempted
      // if it has a photo OR was recorded as no_unsplash_match in a prior run.
      const existing = cp.completed[d.slug];
      if (existing) {
        const haveHero =
          !d.heroEmpty ||
          !!existing.hero ||
          isNoUnsplashMatch(`${d.slug}::hero`);
        const haveAllThemes = d.themes.every(
          (t) =>
            !t.photoEmpty ||
            !!existing.themes?.[t.title] ||
            isNoUnsplashMatch(`${d.slug}::${t.title}`),
        );
        if (haveHero && haveAllThemes) {
          console.error(
            `[${idx + 1}/${todo.length}] ${d.slug} — already curated, skip`,
          );
          continue;
        }
      }

      console.error(
        `[${idx + 1}/${todo.length}] ${d.slug} — need ${need} photo${need === 1 ? "" : "s"}` +
          ` (elapsed ${(msElapsed() / 1000).toFixed(0)}s)`,
      );

      const slot = cp.completed[d.slug] || { hero: null, themes: {} };

      try {
        // Hero
        if (
          d.heroEmpty &&
          !slot.hero &&
          !isNoUnsplashMatch(`${d.slug}::hero`)
        ) {
          const q = buildHeroQuery(d.slug);
          const result = await search(q);
          calls++;
          if (result.noMatch) {
            cp.audit[`${d.slug}::hero`] = {
              query: q,
              status: "no_unsplash_match",
              attempted_queries: result.attemptedQueries,
            };
            console.error(
              `   ✗ hero: no Unsplash match for "${q}" — flagged for manual override`,
            );
          } else {
            slot.hero = result.meta;
            cp.audit[`${d.slug}::hero`] = {
              query: q,
              matched_query: result.matchedQuery,
              chosen_url: result.meta.url,
              chosen_photoId: result.meta.photoId,
              photographer: result.meta.photographerName,
            };
            console.error(`   ✓ hero: ${result.meta.photoId} by ${result.meta.photographerName} (q="${result.matchedQuery}")`);
          }
        }

        // Themes
        for (const t of d.themes) {
          if (!t.photoEmpty) continue;
          if (slot.themes[t.title]) continue;
          if (isNoUnsplashMatch(`${d.slug}::${t.title}`)) continue;
          const q = buildThemeQuery(t.title, d.slug);
          const result = await search(q);
          calls++;
          if (result.noMatch) {
            cp.audit[`${d.slug}::${t.title}`] = {
              query: q,
              status: "no_unsplash_match",
              attempted_queries: result.attemptedQueries,
            };
            console.error(
              `   ✗ "${t.title}": no Unsplash match for "${q}" — flagged for manual override`,
            );
            continue;
          }
          slot.themes[t.title] = result.meta;
          cp.audit[`${d.slug}::${t.title}`] = {
            query: q,
            matched_query: result.matchedQuery,
            chosen_url: result.meta.url,
            chosen_photoId: result.meta.photoId,
            photographer: result.meta.photographerName,
          };
          console.error(`   ✓ "${t.title}": ${result.meta.photoId} by ${result.meta.photographerName} (q="${result.matchedQuery}")`);
        }

        cp.completed[d.slug] = slot;
        cp.stats.totalCalls = startedCalls + calls;
        flushPartialState();

        const themeSlots = d.themes.filter((t) => t.photoEmpty);
        const heroNeeded = d.heroEmpty ? 1 : 0;
        const totalSlots = themeSlots.length + heroNeeded;
        const themesGot = themeSlots.filter((t) => slot.themes?.[t.title]).length;
        const heroGot = d.heroEmpty ? (slot.hero ? 1 : 0) : 0;
        const got = themesGot + heroGot;
        console.error(`   ✓ ${d.slug}: ${got}/${totalSlots} photos curated`);
      } catch (e) {
        if (e instanceof BudgetExhausted) {
          // Save whatever we got for this destination, then propagate.
          cp.completed[d.slug] = slot;
          cp.stats.totalCalls = startedCalls + calls;
          flushPartialState();
          throw e;
        }
        console.error(`   ✗ ${d.slug} failed: ${e.message}`);
        cp.stats.failures.push({ slug: d.slug, error: e.message, at: new Date().toISOString() });
        cp.completed[d.slug] = slot;
        flushPartialState();
      }
    }
  } catch (e) {
    if (e instanceof BudgetExhausted) {
      exitedEarly = true;
      exitReason = e.message;
    } else {
      throw e;
    }
  }

  /* ─── final write: flag + summary ─── */

  // Always re-flush in case we exited cleanly without a budget error
  // (e.g. all destinations skipped from checkpoint).
  flushPartialState();

  const stillMissing = countStillMissing();
  const noMatchEntries = collectNoMatchEntries();

  // Sidecar list of no-match entries for the auto-PR step to include in
  // the description. Written even when incomplete so partial-run reports
  // still surface what's flagged.
  writeFileSync(NO_MATCH_LIST_PATH, JSON.stringify(noMatchEntries, null, 2));

  if (stillMissing.length === 0) {
    writeFileSync(COMPLETE_FLAG_PATH, new Date().toISOString());
    console.error(`\n✓ All photos attempted. Wrote ${COMPLETE_FLAG_PATH}.`);

    if (noMatchEntries.length > 0) {
      console.error(
        `  ${noMatchEntries.length} entr${noMatchEntries.length === 1 ? "y" : "ies"} returned zero Unsplash results — flagged for manual override:`,
      );
      for (const m of noMatchEntries) {
        console.error(`    - ${m.key} (q="${m.query}")`);
      }
    }

    const finalSrc = readFileSync(SRC_PATH, "utf8");
    const remainingHero = (finalSrc.match(/hero:\s*""/g) || []).length;
    const remainingPhoto = (finalSrc.match(/,\s*photo:\s*""\s*\}/g) || []).length;
    const expectedRemaining = noMatchEntries.length;
    const totalRemaining = remainingHero + remainingPhoto;
    if (totalRemaining !== expectedRemaining) {
      console.error(
        `! Sanity check: ${remainingHero} empty hero(s) and ${remainingPhoto} empty theme photo(s) still in file (expected ${expectedRemaining} from no-match list).`,
      );
    }
  } else {
    writeFileSync(INCOMPLETE_FLAG_PATH, new Date().toISOString());
    if (exitedEarly) {
      console.error(
        `\n⏸  Exited early (${exitReason}). ${stillMissing.length} entries still missing.`,
      );
    } else {
      console.error(`\n! ${stillMissing.length} entries still missing — re-run to retry.`);
    }
    console.error(`  Wrote ${INCOMPLETE_FLAG_PATH}. Re-run the workflow to resume from the cached checkpoint.`);
    for (const m of stillMissing.slice(0, 10)) console.error(`    - ${m}`);
    if (stillMissing.length > 10) {
      console.error(`    ... and ${stillMissing.length - 10} more`);
    }
  }

  console.error(`✓ Audit written to ${AUDIT_PATH} (${Object.keys(cp.audit).length} entries)`);

  /* ─── summary ─── */
  console.error(`\n── Summary ──`);
  console.error(`  Elapsed:          ${(msElapsed() / 1000).toFixed(0)}s`);
  console.error(`  Calls this run:   ${calls}`);
  console.error(`  Calls cumulative: ${cp.stats.totalCalls}`);
  console.error(`  Destinations completed: ${Object.keys(cp.completed).length} / ${todo.length}`);
  if (cp.stats.failures.length > 0) {
    console.error(`  Failures (${cp.stats.failures.length}):`);
    for (const f of cp.stats.failures.slice(-10)) {
      console.error(`    - ${f.slug}: ${f.error}`);
    }
  }

  // Always exit 0. The complete/incomplete flag tells the workflow what to do.
}

main().catch((e) => {
  console.error(`\nFATAL: ${e.stack || e.message}`);
  process.exit(1);
});
