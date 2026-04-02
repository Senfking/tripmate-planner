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
    const { feedbackId, category, message, route } = await req.json();

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

    const userPrompt = `Feedback type: ${category}
Page: ${route}
Message: ${message}

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

    // Update feedback row with AI analysis
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
