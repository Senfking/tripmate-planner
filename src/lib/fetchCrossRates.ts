import { supabase } from "@/integrations/supabase/client";

/** Safely parse jsonb rates from Supabase (could be string, object, or null). */
export function parseRates(raw: unknown): Record<string, number> | null {
  if (!raw) return null;
  let obj: Record<string, unknown>;
  if (typeof raw === "string") {
    try { obj = JSON.parse(raw); } catch { return null; }
  } else if (typeof raw === "object" && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
  } else {
    return null;
  }
  return Object.keys(obj).length > 0 ? (obj as Record<string, number>) : null;
}

/** Fetch EUR-based rates from the DB cache, with live API fallback.
 *  When the live API is used, a background refresh is triggered so
 *  the DB cache is populated for subsequent requests. */
export async function fetchEurRates(): Promise<Record<string, number>> {
  const { data: eurRow } = await supabase
    .from("exchange_rate_cache")
    .select("rates")
    .eq("base_currency", "EUR")
    .maybeSingle();

  const parsed = parseRates(eurRow?.rates);
  if (parsed) return parsed;

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/EUR");
    const json = await res.json();
    if (json.result === "success" && json.rates) {
      supabase.functions.invoke("refresh-exchange-rates").catch(() => {});
      return json.rates as Record<string, number>;
    }
  } catch {
    // API also failed
  }

  return {};
}

/** Cross-calculate EUR-based rates into rates relative to `settlementCurrency`.
 *  Returns `eurRates` as-is when settlement is EUR, or `{}` when the
 *  settlement currency is missing from the EUR rate table. */
export function crossCalculateRates(
  eurRates: Record<string, number>,
  settlementCurrency: string,
): Record<string, number> {
  if (settlementCurrency === "EUR") return eurRates;
  const eurToSettlement = eurRates[settlementCurrency];
  if (!eurToSettlement || eurToSettlement <= 0) return {};
  const cross: Record<string, number> = {};
  for (const [code, rate] of Object.entries(eurRates)) {
    cross[code] = rate / eurToSettlement;
  }
  return cross;
}
