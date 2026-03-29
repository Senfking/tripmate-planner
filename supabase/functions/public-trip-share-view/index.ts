import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function firstName(displayName: string | null): string {
  return (displayName || "Member").split(" ")[0];
}

function convertAmount(
  amount: number,
  from: string,
  to: string,
  baseCurrency: string,
  rates: Record<string, number>,
): number {
  if (from === to) return amount;
  const fromRate = from === baseCurrency ? 1 : rates[from];
  const toRate = to === baseCurrency ? 1 : rates[to];
  if (fromRate == null || toRate == null) return amount;
  return (amount / fromRate) * toRate;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const token = body?.token;
    const includeExpenses = body?.include_expenses === true;

    if (!token || typeof token !== "string") {
      return new Response(JSON.stringify({ error: "Token is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Validate token
    const { data: shareToken, error: tokenErr } = await supabase
      .from("trip_share_tokens")
      .select("id, trip_id, expires_at, revoked_at")
      .eq("token", token)
      .maybeSingle();

    if (tokenErr) {
      console.error("Token lookup error:", tokenErr.message);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (
      !shareToken ||
      shareToken.revoked_at ||
      new Date(shareToken.expires_at) < new Date()
    ) {
      return new Response(
        JSON.stringify({ error: "This share link is invalid or has expired." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const tripId = shareToken.trip_id;

    // Fetch all data in parallel
    const [tripRes, membersRes, itemsRes, attachRes, routeRes] = await Promise.all([
      supabase
        .from("trips")
        .select("name, tentative_start_date, tentative_end_date, emoji, settlement_currency")
        .eq("id", tripId)
        .single(),
      supabase
        .from("trip_members")
        .select("user_id")
        .eq("trip_id", tripId),
      supabase
        .from("itinerary_items")
        .select("day_date, start_time, end_time, title, location_text, status")
        .eq("trip_id", tripId)
        .order("day_date")
        .order("start_time", { ascending: true, nullsFirst: false }),
      supabase
        .from("attachments")
        .select("title, url, og_title, og_description, og_image_url")
        .eq("trip_id", tripId)
        .eq("type", "link"),
      supabase
        .from("trip_route_stops")
        .select("destination, start_date, end_date")
        .eq("trip_id", tripId)
        .order("start_date"),
    ]);

    if (tripRes.error) {
      console.error("Trip fetch error:", tripRes.error.message);
      return new Response(JSON.stringify({ error: "Trip not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build name map from profiles
    const memberUserIds: string[] = (membersRes.data || []).map((m: any) => m.user_id);
    let nameMap: Record<string, string> = {};

    if (memberUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", memberUserIds);

      for (const p of profiles || []) {
        nameMap[p.id] = firstName(p.display_name);
      }
    }

    // Ensure all members have a name entry
    for (const uid of memberUserIds) {
      if (!nameMap[uid]) nameMap[uid] = "Member";
    }

    const members = memberUserIds.map((uid) => ({ first_name: nameMap[uid] }));

    // Build response
    const result: Record<string, any> = {
      trip: {
        name: tripRes.data.name,
        emoji: tripRes.data.emoji,
        tentative_start_date: tripRes.data.tentative_start_date,
        tentative_end_date: tripRes.data.tentative_end_date,
        settlement_currency: tripRes.data.settlement_currency,
      },
      members,
      member_count: memberUserIds.length,
      route_stops: routeRes.data || [],
      itinerary_items: itemsRes.data || [],
      attachments: (attachRes.data || []).filter((a: any) => a.url),
    };

    // Optional expense summary
    if (includeExpenses) {
      const settlementCurrency = tripRes.data.settlement_currency || "EUR";

      const [expensesRes, ratesRes] = await Promise.all([
        supabase
          .from("expenses")
          .select("id, payer_id, amount, currency")
          .eq("trip_id", tripId),
        supabase
          .from("exchange_rate_cache")
          .select("base_currency, rates")
          .eq("base_currency", settlementCurrency)
          .maybeSingle(),
      ]);

      const expenses = expensesRes.data || [];
      const baseCurrency = ratesRes.data?.base_currency || settlementCurrency;
      const rates: Record<string, number> = (ratesRes.data?.rates as any) || {};

      // Fetch splits for all expenses
      const expenseIds = expenses.map((e: any) => e.id);
      let allSplits: any[] = [];
      if (expenseIds.length > 0) {
        const { data: splitsData } = await supabase
          .from("expense_splits")
          .select("expense_id, user_id, share_amount")
          .in("expense_id", expenseIds);
        allSplits = splitsData || [];
      }

      // Compute net balances
      const balances: Record<string, number> = {};
      let totalSpent = 0;

      for (const exp of expenses) {
        const converted = convertAmount(exp.amount, exp.currency, settlementCurrency, baseCurrency, rates);
        totalSpent += converted;
        balances[exp.payer_id] = (balances[exp.payer_id] || 0) + converted;

        const splits = allSplits.filter((s: any) => s.expense_id === exp.id);
        for (const s of splits) {
          const splitConverted = convertAmount(s.share_amount, exp.currency, settlementCurrency, baseCurrency, rates);
          balances[s.user_id] = (balances[s.user_id] || 0) - splitConverted;
        }
      }

      // Build balance list with first names
      const balanceList = Object.entries(balances)
        .filter(([, b]) => Math.abs(b) > 0.005)
        .map(([uid, net]) => ({
          name: nameMap[uid] || "Member",
          net_amount: Math.round(net * 100) / 100,
        }));

      // Greedy settlement
      const debtors: { name: string; amount: number }[] = [];
      const creditors: { name: string; amount: number }[] = [];
      for (const b of balanceList) {
        if (b.net_amount < -0.005) debtors.push({ name: b.name, amount: Math.abs(b.net_amount) });
        else if (b.net_amount > 0.005) creditors.push({ name: b.name, amount: b.net_amount });
      }
      debtors.sort((a, b) => b.amount - a.amount);
      creditors.sort((a, b) => b.amount - a.amount);

      const settleUp: { from: string; to: string; amount: number }[] = [];
      let di = 0, ci = 0;
      while (di < debtors.length && ci < creditors.length) {
        const transfer = Math.min(debtors[di].amount, creditors[ci].amount);
        if (transfer > 0.005) {
          settleUp.push({
            from: debtors[di].name,
            to: creditors[ci].name,
            amount: Math.round(transfer * 100) / 100,
          });
        }
        debtors[di].amount -= transfer;
        creditors[ci].amount -= transfer;
        if (debtors[di].amount < 0.005) di++;
        if (creditors[ci].amount < 0.005) ci++;
      }

      result.expenses_summary = {
        total_spent: Math.round(totalSpent * 100) / 100,
        settlement_currency: settlementCurrency,
        balances: balanceList,
        settle_up: settleUp,
      };
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unhandled error in public-trip-share-view:", err.message);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
