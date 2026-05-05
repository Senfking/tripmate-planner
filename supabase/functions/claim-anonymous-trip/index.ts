// claim-anonymous-trip
//
// Materializes any unclaimed `anonymous_trips` row(s) belonging to a given
// `anon_session_id` onto the calling (now-authenticated) user's account.
//
// Flow:
//   1. JWT-authenticate the caller (user-scoped client via the Authorization
//      header). No anon path — only signed-in users can claim.
//   2. Fetch all anonymous_trips for the supplied session id (service-role).
//   3. For each unclaimed row, insert a `trips` row + `ai_trip_plans` row
//      using the USER-SCOPED client. The trips AFTER INSERT trigger
//      (auto_add_trip_owner) reads auth.uid(), so the user JWT path is
//      required — service-role would NULL auth.uid() and the trip_members
//      NOT NULL constraint would fail.
//   4. Mark the anonymous_trips row claimed (service-role).
//
// Idempotency: rows already claimed by the same caller are returned without
// further work; rows claimed by another user are skipped with a logged error.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isValidAnonSessionId } from "../_shared/anon/rate-limit.ts";
import {
  type AnonTripRow,
  type ClaimDbClient,
  materializeOne,
} from "./claim.ts";

// Adapter — wraps a real supabase-js client in the narrower ClaimDbClient
// shape. Keeps type complexity out of the pure claim logic.
function asClaimClient(client: SupabaseClient): ClaimDbClient {
  return {
    from(table: string) {
      const tbl = client.from(table);
      return {
        async insertReturning(values) {
          // deno-lint-ignore no-explicit-any
          const { data, error } = await (tbl.insert(values as any) as any)
            .select("id")
            .single();
          return { data: data ?? null, error: error ?? null };
        },
        async insert(values) {
          // deno-lint-ignore no-explicit-any
          const { error } = await (tbl.insert(values as any) as any);
          return { error: error ?? null };
        },
        delete() {
          const del = tbl.delete();
          return {
            async eq(k, v) {
              // deno-lint-ignore no-explicit-any
              const { error } = await (del.eq(k, v) as any);
              return { error: error ?? null };
            },
          };
        },
        update(values) {
          // deno-lint-ignore no-explicit-any
          const upd = tbl.update(values as any);
          return {
            eq(k, v) {
              const eqd = upd.eq(k, v);
              return {
                async is(k2, v2) {
                  // deno-lint-ignore no-explicit-any
                  const { error } = await (eqd.is(k2, v2 as any) as any);
                  return { error: error ?? null };
                },
              };
            },
          };
        },
      };
    },
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface ClaimRequest {
  anon_session_id?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  // ---- Auth ----
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(
      { success: false, error: "Unauthorized", code: "auth_required" },
      401,
    );
  }
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return jsonResponse(
      { success: false, error: "Unauthorized", code: "auth_required" },
      401,
    );
  }

  // ---- Body ----
  let body: ClaimRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }
  if (!isValidAnonSessionId(body?.anon_session_id)) {
    return jsonResponse(
      { success: false, error: "anon_session_id must be a valid uuid v4" },
      400,
    );
  }
  const anonSessionId = body.anon_session_id as string;

  // ---- Fetch anonymous_trips for this session ----
  const svcClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: rows, error: fetchErr } = await svcClient
    .from("anonymous_trips")
    .select("id, prompt, payload, claimed_trip_id, claimed_by_user_id, claimed_at")
    .eq("anon_session_id", anonSessionId)
    .order("created_at", { ascending: true });

  if (fetchErr) {
    console.error("[claim-anonymous-trip] fetch failed:", fetchErr.message);
    return jsonResponse(
      { success: false, error: "Failed to look up anonymous trips" },
      500,
    );
  }

  const allRows = (rows ?? []) as AnonTripRow[];

  if (allRows.length === 0) {
    return jsonResponse({
      success: true,
      claimed_trip_ids: [],
      message: "No anonymous trips found for this session.",
    });
  }

  const userClaimClient = asClaimClient(userClient);
  const svcClaimClient = asClaimClient(svcClient);

  const claimedTripIds: string[] = [];
  for (const row of allRows) {
    const result = await materializeOne(
      userClaimClient,
      svcClaimClient,
      user.id,
      row,
    );
    if (result.ok) {
      claimedTripIds.push(result.tripId);
    } else {
      console.error(
        `[claim-anonymous-trip] failed for row=${row.id}:`,
        result.error,
      );
    }
  }

  return jsonResponse({
    success: true,
    claimed_trip_ids: claimedTripIds,
  });
});
