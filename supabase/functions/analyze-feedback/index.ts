import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // --- Screenshot hint action ---
    if (body.action === "describe_screenshot") {
      const { image_base64, media_type, route } = body;
      if (!image_base64) {
        return new Response(JSON.stringify({ error: "Missing image" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
      if (!ANTHROPIC_API_KEY) {
        return new Response(JSON.stringify({ hint: null, is_app_screenshot: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const imgResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 200,
          system: "You are a witty, slightly sarcastic assistant for Junto, a group trip planning app built by Oliver. You help identify UI bugs.",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: media_type || "image/jpeg",
                    data: image_base64,
                  },
                },
                {
                  type: "text",
                  text: `The user is on this page: ${route || "unknown"}

First, decide: is this a screenshot of the Junto app, or something completely unrelated?

If it IS the Junto app:
  Write 2-3 sentences identifying the most likely issue. Be specific about what you see. Reference Oliver by name occasionally e.g. 'Oliver will want to look at this'. Be concise and context-aware based on the page route.

If it is NOT the Junto app:
  Do NOT describe what you see in detail. Instead write 1-2 sentences of dry, sarcastic humor about the fact that they uploaded something completely unrelated. Roast them gently. Maybe question their life choices. End with: 'Try uploading an actual Junto screenshot next time.'

Return ONLY valid JSON with no other text:
{ "hint": "string", "is_app_screenshot": true or false }`,
                },
              ],
            },
          ],
        }),
      });

      if (!imgResponse.ok) {
        console.error("Screenshot hint error:", imgResponse.status, await imgResponse.text());
        return new Response(JSON.stringify({ hint: null, is_app_screenshot: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const imgBody = await imgResponse.json();
      const rawText = imgBody.content?.[0]?.text ?? "";

      let hint: string | null = null;
      let is_app_screenshot = true;

      try {
        const parsed = JSON.parse(rawText);
        hint = parsed.hint ?? null;
        is_app_screenshot = parsed.is_app_screenshot ?? true;
      } catch {
        const match = rawText.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]);
            hint = parsed.hint ?? null;
            is_app_screenshot = parsed.is_app_screenshot ?? true;
          } catch {
            hint = rawText || null;
          }
        } else {
          hint = rawText || null;
        }
      }

      return new Response(JSON.stringify({ hint, is_app_screenshot }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Main feedback analysis action ---
    const { feedbackId, category, message, route, screenshot_hint } = body;

    if (!feedbackId || !message) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY not set");
      return new Response(JSON.stringify({ user_message: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt =
      "You are a product analyst for Junto, a group trip planning app. Analyze user feedback concisely.";

    let userPrompt = `Feedback type: ${category}
Page: ${route}
Message: ${message}`;

    if (screenshot_hint) {
      userPrompt += `\nScreenshot hint: ${screenshot_hint}`;
    }

    userPrompt += `

Return ONLY valid JSON with no other text:
{
  "summary": "string (1 sentence, max 20 words)",
  "severity": "critical|high|medium|low",
  "ai_category": "ui|logic|performance|content|feature|other",
  "fix": "string (1-2 sentences on how to address this or why this feature would be valuable)",
  "user_message": "string (Write as if you're a slightly sassy but lovable messenger delivering news from Oliver (the founder) to the user. Rules: Refer to Oliver by name, not 'the Junto team'. Speak like a real person, not a company. No long dashes, no corporate language. Keep it short: 2-3 sentences max. For bugs: acknowledge it, maybe poke fun at it slightly, say Oliver will look at it. For suggestions: be genuine about the idea. If it's good, say something like 'if you're lucky and Oliver likes this one...' - playful but never making promises. End with something warm but casual, not a formal sign-off. Never use the word 'feedback'. Occasionally use a light emoji if it fits naturally - don't force it.)"
}`;

    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("Anthropic error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ user_message: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiBody = await aiResponse.json();
    const text = aiBody.content?.[0]?.text ?? "";

    let result: any;
    try {
      result = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        result = JSON.parse(match[0]);
      } else {
        console.error("Failed to parse AI response:", text);
        return new Response(JSON.stringify({ user_message: null }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    await sb
      .from("feedback")
      .update({
        ai_summary: result.summary,
        ai_severity: result.severity,
        ai_category: result.ai_category,
        ai_fix: result.fix,
      })
      .eq("id", feedbackId);

    return new Response(
      JSON.stringify({ user_message: result.user_message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("analyze-feedback error:", e);
    return new Response(JSON.stringify({ user_message: null }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
