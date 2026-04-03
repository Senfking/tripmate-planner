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

    let whatsappMessage = "";

    if (trigger === "feedback") {
      const severity =
        body.severity === "critical"
          ? "critical"
          : body.severity === "high"
            ? "warning"
            : "info";
      const feedbackBody = body.body || "No message";
      const category = body.category || "general";

      // Dedup: skip if a notification for this feedback_id was already created
      // (prevents duplicates from both DB trigger and frontend fallback)
      if (body.feedback_id) {
        const { data: existing } = await db
          .from("admin_notifications")
          .select("id")
          .eq("type", "new_feedback")
          .contains("properties", { feedback_id: body.feedback_id })
          .limit(1);
        if (existing && existing.length > 0) {
          console.log("Dedup: notification already exists for feedback_id", body.feedback_id);
          return new Response(
            JSON.stringify({ success: true, dedup: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      notification = {
        type: "new_feedback",
        title: "New feedback received",
        body: feedbackBody
          ? `${category ? `[${category}] ` : ""}${feedbackBody}`
          : `New ${category} feedback submitted`,
        severity,
        properties: {
          feedback_id: body.feedback_id,
          category,
          ai_severity: body.severity,
        },
      };

      whatsappMessage = `🔔 New Junto feedback\nCategory: ${category}\n${feedbackBody}`;
    } else if (trigger === "new_user") {
      const displayName = body.display_name || "Unknown";
      const referredSuffix = body.referred_by ? " (referred)" : "";

      notification = {
        type: "new_user",
        title: "New user signed up",
        body: `${displayName} just signed up`,
        severity: "info",
        properties: {
          user_id: body.user_id,
          display_name: displayName,
          referred_by: body.referred_by,
        },
      };

      whatsappMessage = `👤 New Junto user\n${displayName} just signed up${referredSuffix}`;
    } else if (trigger === "error_spike") {
      const count = body.count ?? 0;

      notification = {
        type: "error_spike",
        title: "Error spike detected",
        body: `${count} errors in the last hour`,
        severity: "critical",
        properties: {
          count,
          window: body.window,
        },
      };

      whatsappMessage = `🚨 Error spike detected on Junto\n${count} errors in the last hour`;
    } else if (trigger === "daily_digest") {
      const summary = body.summary || "No summary available";

      notification = {
        type: "daily_digest",
        title: "Daily digest",
        body: summary,
        severity: "info",
        properties: {
          summary,
          generated_at: body.generated_at,
        },
      };

      whatsappMessage = `📊 Junto daily digest\n${summary}`;
    } else {
      return new Response(
        JSON.stringify({ error: `Unknown trigger: ${trigger}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Insert notification
    const { data: inserted, error } = await db
      .from("admin_notifications")
      .insert(notification)
      .select("id")
      .single();

    if (error) {
      console.error("Insert error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send WhatsApp via Twilio
    const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuth = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioFrom = Deno.env.get("TWILIO_WHATSAPP_FROM");
    const twilioTo = Deno.env.get("TWILIO_WHATSAPP_TO");
    let whatsappSent = false;

    if (twilioSid && twilioAuth && twilioFrom && twilioTo && whatsappMessage) {
      try {
        const params = new URLSearchParams({
          From: `whatsapp:${twilioFrom}`,
          To: `whatsapp:${twilioTo}`,
          Body: whatsappMessage,
        });

        const res = await fetch(
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

        if (res.ok) {
          whatsappSent = true;
          console.log("WhatsApp sent for trigger:", trigger);
        } else {
          const errBody = await res.text();
          console.error("Twilio error:", res.status, errBody);
        }
      } catch (e) {
        console.error("WhatsApp send failed:", e);
      }
    } else {
      console.warn("Twilio secrets missing, skipping WhatsApp");
    }

    // Mark notification with WhatsApp status
    if (whatsappSent && inserted?.id) {
      await db
        .from("admin_notifications")
        .update({
          whatsapp_sent: true,
          whatsapp_sent_at: new Date().toISOString(),
        })
        .eq("id", inserted.id);
    }

    return new Response(
      JSON.stringify({ success: true, whatsapp_sent: whatsappSent }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("check-admin-alerts error:", e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
