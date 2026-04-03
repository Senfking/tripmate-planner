import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const trigger = body.trigger as string;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceRoleKey);

    let notification: {
      type: string;
      title: string;
      body: string;
      severity: string;
      properties: Record<string, unknown>;
    } | null = null;

    if (trigger === "feedback") {
      const severity = body.severity === "critical" ? "critical" : body.severity === "high" ? "warning" : "info";
      notification = {
        type: "new_feedback",
        title: "New feedback received",
        body: body.body
          ? `${body.category ? `[${body.category}] ` : ""}${body.body}`
          : `New ${body.category || "general"} feedback submitted`,
        severity,
        properties: {
          feedback_id: body.feedback_id,
          category: body.category,
          ai_severity: body.severity,
        },
      };
    } else if (trigger === "new_user") {
      notification = {
        type: "new_user",
        title: "New user signed up",
        body: body.display_name
          ? `${body.display_name} just joined`
          : "A new user signed up",
        severity: "info",
        properties: {
          user_id: body.user_id,
          display_name: body.display_name,
          referred_by: body.referred_by,
        },
      };
    } else {
      return new Response(
        JSON.stringify({ error: `Unknown trigger: ${trigger}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error } = await db.from("admin_notifications").insert(notification);

    if (error) {
      console.error("Insert error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send WhatsApp notification for critical/warning items
    const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuth = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioFrom = Deno.env.get("TWILIO_WHATSAPP_FROM");
    const twilioTo = Deno.env.get("TWILIO_WHATSAPP_TO");

    if (
      twilioSid && twilioAuth && twilioFrom && twilioTo &&
      (notification.severity === "critical" || notification.severity === "warning")
    ) {
      try {
        const msg = `🚨 ${notification.title}\n${notification.body}`;
        const params = new URLSearchParams({
          From: twilioFrom,
          To: twilioTo,
          Body: msg,
        });
        await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization: "Basic " + btoa(`${twilioSid}:${twilioAuth}`),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params.toString(),
          }
        );
      } catch (e) {
        console.error("WhatsApp send failed:", e);
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("check-admin-alerts error:", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
