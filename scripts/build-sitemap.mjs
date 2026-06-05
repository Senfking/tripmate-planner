#!/usr/bin/env node
/**
 * Builds public/sitemap.xml from static routes + every slug in trip_templates.
 * Runs as a prebuild step so production builds always ship a fresh sitemap.
 *
 * Falls back to the existing static sitemap if the network call fails — we
 * never want a build to fail because of sitemap generation.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "..", "public", "sitemap.xml");
const SITE = "https://junto.pro";

// Public anon key — same one shipped in the client bundle.
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || "https://dwtbqomfleihcvkfoopm.supabase.co";
const SUPABASE_ANON =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3dGJxb21mbGVpaGN2a2Zvb3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MTIwOTYsImV4cCI6MjA5MDI4ODA5Nn0.3pcmb_onAUrzgqOHJMQPJTB0sIClViacP6zPUAi3NK4";

const STATIC_URLS = [
  { loc: `${SITE}/`, changefreq: "weekly", priority: "1.0" },
  { loc: `${SITE}/templates`, changefreq: "weekly", priority: "0.9" },
  { loc: `${SITE}/guides/how-to-plan-a-group-trip`, changefreq: "monthly", priority: "0.8" },
  { loc: `${SITE}/ref`, changefreq: "monthly", priority: "0.6" },
  { loc: `${SITE}/privacy`, changefreq: "yearly", priority: "0.3" },
  { loc: `${SITE}/terms`, changefreq: "yearly", priority: "0.3" },
];

async function fetchSlugs() {
  const url = `${SUPABASE_URL}/rest/v1/trip_templates?select=slug,created_at&order=display_order.asc.nullslast`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase responded ${res.status}`);
  const rows = await res.json();
  return rows.filter((r) => r && typeof r.slug === "string" && r.slug.length > 0);
}

function xmlEscape(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c],
  );
}

function buildXml(templateRows) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    ...STATIC_URLS.map((u) => ({ ...u, lastmod: today })),
    ...templateRows.map((row) => ({
      loc: `${SITE}/templates/${row.slug}`,
      lastmod: (row.created_at || today).slice(0, 10),
      changefreq: "monthly",
      priority: "0.8",
    })),
  ];

  const body = urls
    .map(
      (u) =>
        `  <url>\n    <loc>${xmlEscape(u.loc)}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

async function main() {
  let rows = [];
  try {
    rows = await fetchSlugs();
    console.log(`[sitemap] fetched ${rows.length} template slugs`);
  } catch (err) {
    console.warn(`[sitemap] WARN: failed to fetch templates (${err.message}); writing sitemap with static routes only`);
  }
  const xml = buildXml(rows);
  writeFileSync(OUT_PATH, xml, "utf8");
  console.log(`[sitemap] wrote ${OUT_PATH} (${STATIC_URLS.length + rows.length} URLs)`);
}

main().catch((err) => {
  console.error("[sitemap] fatal", err);
  process.exit(0); // never break the build over a sitemap
});
