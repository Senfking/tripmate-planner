// submit-feedback-alert
//
// Authenticated, rate-limited Edge Function that fires the admin
// "new feedback" notification + Twilio WhatsApp from the FRONTEND path.
//
// Why this exists:
//   check-admin-alerts is the back-office trigger fan-in (DB triggers,
//   pg_cron, internal callers). Once it's locked behind verify_jwt = true
//   AND a service-role-key bearer check, the frontend can no longer call
//   it directly. This function is the public, per-user gate that fronts
//   the same Twilio path for FeedbackWidget submissions.
//
// Security model:
//   - verify_jwt = true (set in supabase/config.toml) — Supabase gateway
//     rejects requests without a valid JWT.
//   - We re-derive the user from the bearer (NOT trusting any user_id
//     in the request body).
//   - We validate that the referenced feedback row exists AND was
//     authored by the bearer's user (prevents spoofed feedback_id).
//   - We use feedback.body / feedback.category from the DB, NOT from
//     the request body — Twilio message content is trusted.
//   - Rate limit: max 3 'new_feedback' admin_notifications attributed to
//     this user in the last 10 minutes. Caps Twilio damage from a
//     compromised account or aggressive automation.
//   - Returns 429 with retry-in hint when rate-limited.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_COUNT = 3;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization") || "";

  // Identify the caller by re-running getUser() against the user JWT — Supabase
  // gateway already verified the JWT (verify_jwt = true), but we also want the
  // user object so we can attribute / rate-limit / validate ownership.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  const userId = userData.user.id;

  // Service-role client for everything else (admin_notifications insert,
  // feedback ownership read, rate-limit query).
  const db = createClient(supabaseUrl, serviceRoleKey);

  // 1. Validate payload shape ------------------------------------------------
  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const feedbackId = typeof body?.feedback_id === "string" ? body.feedback_id : null;
  if (!feedbackId || !UUID_RE.test(feedbackId)) {
    return jsonResponse({ error: "Invalid feedback_id" }, 400);
  }

  // 2. Validate feedback ownership ------------------------------------------
  // Read body/category from the DB rather than trusting the request payload —
  // closes a Twilio-content-injection vector even from a legitimate user.
  const { data: feedback, error: fetchErr } = await db
    .from("feedback")
    .select("id, user_id, body, category")
    .eq("id", feedbackId)
    .maybeSingle();
  if (fetchErr) {
    console.error("submit-feedback-alert: feedback lookup failed", fetchErr);
    return jsonResponse({ error: "Feedback lookup failed" }, 500);
  }
  if (!feedback) {
    return jsonResponse({ error: "Feedback not found" }, 404);
  }
  if (feedback.user_id !== userId) {
    // Don't leak existence — return 404 rather than 403.
    return jsonResponse({ error: "Feedback not found" }, 404);
  }

  // 3. Per-user rate limit ---------------------------------------------------
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count: recentCount, error: rateErr } = await db
    .from("admin_notifications")
    .select("id", { count: "exact", head: true })
    .eq("type", "new_feedback")
    .gte("created_at", since)
    .filter("properties->>submitted_by_user_id", "eq", userId);
  if (rateErr) {
    // Fail open on rate-limit query errors — better to occasionally over-send
    // than to lock out legitimate submissions on a transient DB blip.
    console.warn("submit-feedback-alert: rate-limit query failed, allowing", rateErr);
  } else if ((recentCount ?? 0) >= RATE_LIMIT_COUNT) {
    return jsonResponse(
      {
        error: "rate_limited",
        message: `Max ${RATE_LIMIT_COUNT} feedback submissions per 10 minutes.`,
        retry_in_seconds: 600,
      },
      429,
    );
  }

  // 4. Dedup -----------------------------------------------------------------
  // The DB trigger trg_notify_new_feedback (added in
  // 20260426114007_feedback_metadata_and_server_side_analysis.sql) does NOT
  // call check-admin-alerts anymore; the only writer of new_feedback
  // notifications IS this function. But keep the dedup anyway — it's cheap
  // and defends against a client double-click race.
  const { data: existing } = await db
    .from("admin_notifications")
    .select("id")
    .eq("type", "new_feedback")
    .contains("properties", { feedback_id: feedbackId })
    .limit(1);
  if (existing && existing.length > 0) {
    return jsonResponse({ success: true, dedup: true });
  }

  // 5. Insert notification ---------------------------------------------------
  const dbBody = (feedback.body ?? "").slice(0, 200) || "No message";
  const category = feedback.category || "general";
  const { data: inserted, error: insertErr } = await db
    .from("admin_notifications")
    .insert({
      type: "new_feedback",
      title: "New feedback received",
      body: `[${category}] ${dbBody}`,
      severity: "info",
      properties: {
        feedback_id: feedbackId,
        category,
        submitted_by_user_id: userId,
      },
    })
    .select("id")
    .single();
  if (insertErr) {
    console.error("submit-feedback-alert: insert failed", insertErr);
    return jsonResponse({ error: "Insert failed" }, 500);
  }

  // 6. Twilio WhatsApp -------------------------------------------------------
  const whatsappMessage = `🔔 New Junto feedback\nCategory: ${category}\n${dbBody}`;
  const { sent, error: whatsappError } = await sendWhatsApp(whatsappMessage);

  // 7. Update notification with delivery status -----------------------------
  if (inserted?.id) {
    await db
      .from("admin_notifications")
      .update({
        whatsapp_sent: sent,
        whatsapp_sent_at: sent ? new Date().toISOString() : null,
      })
      .eq("id", inserted.id);
  }

  return jsonResponse({
    success: true,
    whatsapp_sent: sent,
    ...(whatsappError && { whatsapp_error: whatsappError }),
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendWhatsApp(message: string): Promise<{ sent: boolean; error: string | null }> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const auth = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_WHATSAPP_FROM");
  const to = Deno.env.get("TWILIO_WHATSAPP_TO");

  if (!sid || !auth || !from || !to) {
    const missing = [
      !sid && "TWILIO_ACCOUNT_SID",
      !auth && "TWILIO_AUTH_TOKEN",
      !from && "TWILIO_WHATSAPP_FROM",
      !to && "TWILIO_WHATSAPP_TO",
    ].filter(Boolean);
    return { sent: false, error: `Missing Twilio secrets: ${missing.join(", ")}` };
  }

  const fromNumber = from.replace(/^whatsapp:/, "");
  const toNumber = to.replace(/^whatsapp:/, "");
  const params = new URLSearchParams({
    From: `whatsapp:${fromNumber}`,
    To: `whatsapp:${toNumber}`,
    Body: message,
  });

  let lastError: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: "Basic " + btoa(`${sid}:${auth}`),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        },
      );
      if (res.ok) return { sent: true, error: null };

      lastError = `Twilio HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
      if (res.status >= 400 && res.status < 500) break; // don't retry client errors
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return { sent: false, error: lastError };
}
