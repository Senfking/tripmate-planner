import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function csvEscape(value: string | null | undefined): string {
  if (!value) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
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

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

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

    // Fetch expenses, splits, profiles in parallel
    const [expRes, splitsRes, profilesRes] = await Promise.all([
      supabase
        .from("expenses")
        .select("id, title, amount, currency, incurred_on, payer_id, notes, category")
        .eq("trip_id", tripId)
        .order("incurred_on", { ascending: false }),
      supabase
        .from("expense_splits")
        .select("expense_id, user_id, share_amount")
        .in(
          "expense_id",
          // We'll filter after; fetch all splits for trip expenses
          []
        ),
      supabase.from("profiles").select("id, display_name"),
    ]);

    if (expRes.error) {
      console.error("Expenses fetch error:", expRes.error.message);
      return new Response(JSON.stringify({ error: "Failed to fetch expenses" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expenses = expRes.data || [];
    const expenseIds = expenses.map((e) => e.id);

    // Fetch splits for these expense IDs
    const { data: splits } = expenseIds.length > 0
      ? await supabase
          .from("expense_splits")
          .select("expense_id, user_id, share_amount")
          .in("expense_id", expenseIds)
      : { data: [] };

    // Profile map
    const profileMap = new Map<string, string>();
    (profilesRes.data || []).forEach((p: any) => {
      profileMap.set(p.id, p.display_name || "Unknown");
    });

    // Build CSV
    const header = "Date,Title,Amount,Currency,Category,Paid By,Participants,Notes";
    const rows = expenses.map((exp) => {
      const payerName = profileMap.get(exp.payer_id) || "Unknown";
      const expSplits = (splits || []).filter((s) => s.expense_id === exp.id);
      const participants = expSplits
        .map((s) => profileMap.get(s.user_id) || "Unknown")
        .join("; ");

      return [
        csvEscape(exp.incurred_on),
        csvEscape(exp.title),
        exp.amount,
        csvEscape(exp.currency),
        csvEscape(exp.category),
        csvEscape(payerName),
        csvEscape(participants),
        csvEscape(exp.notes),
      ].join(",");
    });

    const csv = [header, ...rows].join("\r\n");

    return new Response(csv, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="junto-expenses.csv"',
      },
    });
  } catch (err) {
    console.error("Unhandled error in export-expenses-csv:", err.message);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
