import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BASE_CURRENCIES = ["EUR", "USD", "GBP"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Require a valid Supabase auth token (any authenticated user can trigger a refresh,
  // but unauthenticated requests are blocked to prevent abuse)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await anonClient.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const updated: string[] = [];

    for (const base of BASE_CURRENCIES) {
      const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
      if (!res.ok) {
        console.error(`Failed to fetch rates for ${base}: ${res.status}`);
        continue;
      }
      const json = await res.json();
      if (json.result !== "success") {
        console.error(`API error for ${base}:`, json);
        continue;
      }

      const { error } = await supabase
        .from("exchange_rate_cache")
        .upsert(
          {
            base_currency: base,
            rates: json.rates,
            fetched_at: new Date().toISOString(),
          },
          { onConflict: "base_currency" },
        );

      if (error) {
        console.error(`Upsert error for ${base}:`, error);
      } else {
        updated.push(base);
      }
    }

    return new Response(
      JSON.stringify({ success: true, updated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    console.error("refresh-exchange-rates error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
