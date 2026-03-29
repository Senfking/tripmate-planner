import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function escapeIcal(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const tripId = url.searchParams.get("trip_id");
    if (!tripId) {
      return new Response(JSON.stringify({ error: "trip_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    // Verify membership
    const { data: isMember } = await supabase.rpc("is_trip_member", {
      _trip_id: tripId,
      _user_id: userId,
    });
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch items
    const { data: items, error: itemsErr } = await supabase
      .from("itinerary_items")
      .select("id, title, day_date, start_time, end_time, location_text, notes")
      .eq("trip_id", tripId)
      .order("day_date")
      .order("start_time", { ascending: true, nullsFirst: false });

    if (itemsErr) {
      console.error("Fetch items error:", itemsErr.message);
      return new Response(JSON.stringify({ error: "Failed to fetch itinerary" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build iCal
    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Junto//Junto//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ];

    for (const item of items || []) {
      const dateClean = item.day_date.replace(/-/g, "");
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${item.id}@junto`);
      lines.push(`SUMMARY:${escapeIcal(item.title)}`);

      if (item.start_time) {
        const timeClean = item.start_time.replace(/:/g, "").substring(0, 6);
        lines.push(`DTSTART:${dateClean}T${timeClean}`);
        if (item.end_time) {
          const endClean = item.end_time.replace(/:/g, "").substring(0, 6);
          lines.push(`DTEND:${dateClean}T${endClean}`);
        }
      } else {
        lines.push(`DTSTART;VALUE=DATE:${dateClean}`);
      }

      if (item.location_text) {
        lines.push(`LOCATION:${escapeIcal(item.location_text)}`);
      }
      if (item.notes) {
        lines.push(`DESCRIPTION:${escapeIcal(item.notes)}`);
      }
      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");
    const icsContent = lines.join("\r\n");

    return new Response(icsContent, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="junto-itinerary.ics"',
      },
    });
  } catch (err) {
    console.error("Unhandled error in export-trip-ics:", err.message);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
