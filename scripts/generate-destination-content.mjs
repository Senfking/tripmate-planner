#!/usr/bin/env node
/**
 * Generate human-quality destination content (tagline, themes, longForm)
 * for trip_templates rows using Claude with tool-use (structured JSON).
 *
 * Usage:
 *   node scripts/generate-destination-content.mjs                # all uncurated
 *   node scripts/generate-destination-content.mjs china iceland india
 *   node scripts/generate-destination-content.mjs --slugs china-12-days,iceland-7-days
 *
 * Env required: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or PG*).
 *
 * Writes /tmp/destination-content.json with checkpointing per destination.
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-4-7";
const OUT_PATH = "/tmp/destination-content.json";

const argv = process.argv.slice(2);
const slugFlagIdx = argv.indexOf("--slugs");
const slugFilter =
  slugFlagIdx >= 0
    ? argv[slugFlagIdx + 1].split(",").map((s) => s.trim())
    : argv.length
      ? argv.map((s) => s.toLowerCase())
      : null;

const SYSTEM = `You write destination guides for a premium trip-planning app called Junto.

Voice: travel journalist, casual but informed. Concrete sensory details over adjectives. Real place names. Vary sentence length. Active voice.

HARD BANS:
- NO em-dashes (—) or en-dashes (–) in body text. Use commas, semicolons, parentheses, or periods. (En-dashes are fine ONLY inside numeric ranges like "5–7 days".)
- NO emojis.
- BANNED words/phrases: vibrant, rich tapestry, myriad, embark on a journey, immerse yourself, hidden gems, off the beaten path, must-see, stunning, breathtaking, nestled, boasts, showcase, delve into, world-class, unforgettable.
- No hyperbole. No brochure-speak.

EVERY tagline must contain at least one unexpected sensory detail (a specific sound, smell, taste, texture, or quality of light).

Theme card titles must reference REAL attractions, neighborhoods, dishes, or landscapes specific to that destination. Generic ("Cultural Heritage") is wrong; specific ("Xi'an Terracotta Warriors") is right. Each theme should be something a trip planner could actually build itinerary stops around.`;

const TOOL = {
  name: "save_destination_guide",
  description: "Save the structured guide for one destination.",
  input_schema: {
    type: "object",
    properties: {
      tagline: {
        type: "string",
        description: "2-3 sentences, 30-50 words, with one sensory detail. No em-dashes.",
      },
      themes: {
        type: "array",
        minItems: 4,
        maxItems: 6,
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Specific real attraction/neighborhood/category for this destination.",
            },
            description: {
              type: "string",
              description: "1 sentence, 15-25 words. Concrete, no clichés.",
            },
          },
          required: ["title", "description"],
        },
      },
      longForm: {
        type: "string",
        description:
          "200-300 words. Travel-journalist tone. Real place names, neighborhoods, dishes. Mix sentence lengths. No em-dashes. Used for SEO meta + future About section.",
      },
    },
    required: ["tagline", "themes", "longForm"],
  },
};

function buildUserPrompt(t) {
  return `Write the destination guide for: ${t.destination} (${t.country}). Trip length: ${t.duration_days} days. Vibes the trip targets: ${(t.default_vibes || []).join(", ") || "n/a"}. Pace: ${t.default_pace || "n/a"}. Budget tier: ${t.default_budget_tier || "n/a"}. Existing chip categories the AI generator can plan around: ${(t.chips || []).join(", ") || "n/a"}.

Generate 4-6 themes that fit BOTH the destination's signature attractions AND map loosely to the chip categories where it makes sense. Themes should be specific places/experiences, not generic categories.

Return via the save_destination_guide tool.`;
}

async function callClaude(template, attempt = 1) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "save_destination_guide" },
      messages: [{ role: "user", content: buildUserPrompt(template) }],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const wait = 2000 * attempt;
      console.warn(`  ${res.status} — retry in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
      return callClaude(template, attempt + 1);
    }
    throw new Error(`Claude ${res.status}: ${t}`);
  }
  const body = await res.json();
  const toolUse = body.content?.find((b) => b.type === "tool_use");
  if (!toolUse) throw new Error("No tool_use in response: " + JSON.stringify(body));
  return { input: toolUse.input, usage: body.usage };
}

const BANNED = [
  /—/g, // em-dash (any context — flag for review)
  /\bvibrant\b/i, /\brich tapestry\b/i, /\bmyriad\b/i,
  /\bembark on a journey\b/i, /\bimmerse yourself\b/i,
  /\bhidden gems?\b/i, /\boff the beaten path\b/i, /\bmust[- ]see\b/i,
  /\bstunning\b/i, /\bbreathtaking\b/i, /\bnestled\b/i,
  /\bboasts?\b/i, /\bshowcase[sd]?\b/i, /\bdelve into\b/i,
  /\bworld[- ]class\b/i, /\bunforgettable\b/i,
];
function lint(guide) {
  const violations = [];
  const blob = [guide.tagline, guide.longForm, ...guide.themes.flatMap((t) => [t.title, t.description])].join(" \n ");
  for (const re of BANNED) {
    const m = blob.match(re);
    if (m) violations.push(m[0]);
  }
  return violations;
}

async function main() {
  const { data: templates, error } = await sb
    .from("trip_templates")
    .select("slug,destination,country,country_iso,duration_days,chips,default_vibes,default_pace,default_budget_tier")
    .order("destination");
  if (error) throw error;

  let queue = templates;
  if (slugFilter) {
    queue = templates.filter(
      (t) =>
        slugFilter.includes(t.slug.toLowerCase()) ||
        slugFilter.includes(t.destination.toLowerCase())
    );
  }

  let store = {};
  if (fs.existsSync(OUT_PATH)) {
    store = JSON.parse(fs.readFileSync(OUT_PATH, "utf8"));
    console.log(`Resuming with ${Object.keys(store).length} existing entries`);
  }

  let totalIn = 0, totalOut = 0;
  for (const t of queue) {
    if (store[t.slug]) {
      console.log(`✓ ${t.slug} (cached)`);
      continue;
    }
    process.stdout.write(`→ ${t.slug} ... `);
    try {
      const { input, usage } = await callClaude(t);
      const violations = lint(input);
      store[t.slug] = {
        destination: t.destination,
        country: t.country,
        ...input,
        _violations: violations.length ? violations : undefined,
      };
      fs.writeFileSync(OUT_PATH, JSON.stringify(store, null, 2));
      totalIn += usage?.input_tokens || 0;
      totalOut += usage?.output_tokens || 0;
      console.log(
        `done (${input.themes.length} themes, ${input.longForm.split(/\s+/).length}w)` +
          (violations.length ? ` ⚠ ${violations.join(",")}` : "")
      );
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
    }
  }

  console.log(`\nTokens: ${totalIn} in / ${totalOut} out`);
  console.log(`Saved to ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
