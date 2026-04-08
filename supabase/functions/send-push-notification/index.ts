import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function sendPush(
  endpoint: string,
  keys: { p256dh: string; auth: string },
  payload: object,
  vapidPublic: string,
  vapidPrivate: string,
  vapidSubject: string,
): Promise<{ status: number }> {
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const response = await webpush.sendNotification(
    {
      endpoint,
      keys,
    },
    JSON.stringify(payload),
    {
      TTL: 86400,
      urgency: "normal",
      contentEncoding: "aes128gcm",
    },
  );

  console.log(`Push response: status=${response.statusCode}, endpoint=${endpoint.slice(0, 60)}`);
  return { status: response.statusCode };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { user_id, title, body, url } = await req.json();

    if (!user_id || !title || !body) {
      return new Response(
        JSON.stringify({ error: "user_id, title, and body are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const vapidSubject = Deno.env.get("VAPID_SUBJECT")!;

    const db = createClient(supabaseUrl, serviceRoleKey);

    const { data: subscriptions, error: fetchError } = await db
      .from("push_subscriptions")
      .select("id, endpoint, keys")
      .eq("user_id", user_id);

    if (fetchError) {
      throw new Error(`Failed to query subscriptions: ${fetchError.message}`);
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, expired: 0, message: "No subscriptions found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const payload = {
      title,
      body,
      url: url || "/",
      icon: "/icon-192.svg",
    };

    let sent = 0;
    let expired = 0;

    for (const sub of subscriptions) {
      try {
        const result = await sendPush(
          sub.endpoint,
          sub.keys as { p256dh: string; auth: string },
          payload,
          vapidPublic,
          vapidPrivate,
          vapidSubject,
        );

        if (result.status === 410 || result.status === 404) {
          await db.from("push_subscriptions").delete().eq("id", sub.id);
          expired++;
        } else if (result.status >= 200 && result.status < 300) {
          sent++;
        } else {
          console.error(`Push to ${sub.endpoint} returned status ${result.status}`);
        }
      } catch (err) {
        const status = typeof err === "object" && err !== null && "statusCode" in err
          ? Number((err as { statusCode: number }).statusCode)
          : undefined;

        if (status === 404 || status === 410) {
          await db.from("push_subscriptions").delete().eq("id", sub.id);
          expired++;
          continue;
        }

        console.error(`Failed to send push to ${sub.endpoint}:`, err);
      }
    }

    return new Response(
      JSON.stringify({ sent, expired }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("send-push-notification error:", err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
