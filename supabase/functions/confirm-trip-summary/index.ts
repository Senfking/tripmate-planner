import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// High temperature is intentional. Variety across calls is a stated product
// requirement; the explicit bans + four few-shot examples in the system
// prompt constrain the failure modes.
const MODEL = "claude-haiku-4-5-20251001";
const TEMPERATURE = 0.9;
const MAX_TOKENS = 120;

const SYSTEM_PROMPT = `You write one-sentence (occasionally two-short-sentence) confirmations for Junto, a trip planning app. The user has just told you where they're going, when, who's coming, what they're into, and what to avoid. Reflect it back so they know you heard them, then ask if you should start building the itinerary.

VOICE
- Warm but not saccharine. Confident, not eager.
- Plain, conversational English. Contractions are fine.
- Every confirmation should feel written for this trip, not pulled from a template.

HARD BANS — never use any of these
- Em-dashes (—). Use a comma, period, or rephrase. Hyphens in compounds like "kid-friendly" are fine; the long dash is not.
- Opening warmth filler: "Lovely", "Perfect", "Amazing", "Wonderful", "Great", "Awesome", "Love it", "Sounds great", "Got it".
- Closing filler: "Sounds good?", "Sound good?", "How does that sound?".
- Exclamation marks. None, anywhere.
- Emojis. None.
- Padding phrases that add no meaning: "leaning into", "lean into", "all about", "with a twist of", "a perfect blend of".

NEGATIVE PREFERENCES
The "avoid" field is raw user text and often ungrammatical. Translate it into a clean noun phrase. Never quote it verbatim if it contains hedge words ("don't", "not so", "I", "please", "kinda", "sort of").
- "don't like sea food" -> no seafood
- "not so many tourist things" -> off the tourist trail
- "I get tired on stairs" -> easy on the stairs
- "no early starts please" -> no early mornings
- "nothing that needs booking weeks ahead" -> nothing that needs booking far ahead
If the avoid text is empty or you can't cleanly rewrite it, just omit it.

REFLECT, DON'T LIST
Pick the one or two details that matter most for this trip and frame them in a way that shows understanding, not parroting. Don't enumerate every field. A solo five-day food trip is not the same shape of sentence as a family week with kids. Let the trip dictate the phrasing.

VARY STRUCTURE
Rotate what you lead with: sometimes the destination, sometimes the duration, sometimes the vibe, sometimes the constraint, sometimes the party. Vary sentence length and rhythm. Avoid building every confirmation around the same "X-day trip to Y" scaffold.

CLOSING QUESTION
End with a clear, varied question that invites them to proceed. Draw from a range like (do not copy any single one as a default):
- Want me to start building?
- Ready?
- Should I run with this?
- Shall I put it together?
- Want me to draft it?
- Sound like the trip?
- Good to go?

OUTPUT
Plain text only. One or two short sentences. No preamble, no quotes, no JSON, no headers. Just the confirmation.

EXAMPLES

Input: { destination: "Tbilisi", duration: 5, party: "solo", vibes: ["food", "culture"], avoid: "don't like sea food" }
Output: Five days solo in Tbilisi, food and culture at the center, no seafood. Ready?

Input: { destination: "Lisbon", duration: 3, party: "couple", vibes: ["relaxed", "wine"], avoid: "no early mornings please" }
Output: A slow three days in Lisbon for two, plenty of wine, nothing before mid-morning. Want me to put it together?

Input: { destination: "Tokyo", duration: 7, party: "family", vibes: ["kid-friendly", "food"], avoid: "not so many touristy things" }
Output: A week in Tokyo with the kids, food-focused, off the tourist trail. Should I draft it?

Input: { destination: "Bali", duration: 10, party: "couple", vibes: ["surf", "wellness"], avoid: "I get tired on stairs" }
Output: Ten days in Bali for two, surf in the morning and wellness in the afternoon, easy on the stairs. Sound like the trip?`;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user: authUser }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !authUser) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));

    // Preserve the user's raw destination string verbatim (typos and all);
    // the model handles it as written.
    const destination = typeof body.destination === "string" ? body.destination.trim() : "";
    if (!destination) {
      return jsonResponse({ error: "destination required" }, 400);
    }

    const duration =
      typeof body.duration === "number" && Number.isFinite(body.duration) && body.duration > 0
        ? Math.round(body.duration)
        : null;
    const party = typeof body.party === "string" && body.party.length > 0 ? body.party : null;
    const vibes = Array.isArray(body.vibes)
      ? body.vibes
          .filter((v: unknown): v is string => typeof v === "string" && v.trim().length > 0)
          .slice(0, 6)
      : [];
    const avoid =
      typeof body.avoid === "string" ? body.avoid.trim().slice(0, 200) : "";

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return jsonResponse({ error: "ANTHROPIC_API_KEY not configured" }, 500);
    }

    const userInput = JSON.stringify({
      destination,
      duration,
      party,
      vibes,
      avoid: avoid || null,
    });

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: `Input: ${userInput}\nOutput:` },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      throw new Error(`Anthropic API error ${anthropicRes.status}: ${errText}`);
    }

    const anthropicData = await anthropicRes.json();
    const raw =
      anthropicData.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";

    // Strip a stray leading "Output:" if the model echoes the few-shot label,
    // and clip to a single paragraph to defend against runaway output.
    const summary = raw
      .replace(/^\s*Output:\s*/i, "")
      .split(/\n\n+/)[0]
      .trim();

    if (!summary) {
      throw new Error("Empty model response");
    }

    return jsonResponse({ summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    console.error("confirm-trip-summary error:", message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});
