// Pure(-ish) claim logic, extracted from index.ts so it can be unit-tested
// against a mock Supabase client without spinning up Deno.serve. The runtime
// handler in index.ts wires real clients into these functions.

export interface AnonTripPayload {
  trip_title?: string;
  destination_image_url?: string | null;
  destination_country_iso?: string | null;
  destinations?: Array<{
    name?: string;
    start_date?: string;
    end_date?: string;
  }>;
  [k: string]: unknown;
}

export interface AnonTripRow {
  id: string;
  prompt: string | null;
  payload: AnonTripPayload;
  claimed_trip_id: string | null;
  claimed_by_user_id: string | null;
  claimed_at: string | null;
}

export interface InsertResult<T> {
  data: T | null;
  error: { message: string } | null;
}

// Minimal supabase-js shape. We declare it inline so tests don't have to
// pull in the real type and so the contract stays explicit at the boundary.
//
// Methods used:
//   client.from(tbl).insert(values).select(cols).single()         (trips)
//   client.from(tbl).insertNoReturn(values)                       (ai_trip_plans)
//   client.from(tbl).delete().eq(k, v)                            (rollback orphan trip)
//   client.from(tbl).update(values).eq(k, v).is(k, v)             (mark claimed)
//
// The supabase-js insert builder is both a thenable AND a builder that exposes
// .select() — encoding that intersection in TypeScript fights the type system
// for no real benefit. The runtime adapter in index.ts wraps the real client
// with two distinct insert methods so the types here stay clean.
export interface ClaimDbClient {
  from: (table: string) => ClaimQuery;
}

export interface ClaimQuery {
  insertReturning: (values: Record<string, unknown>) => Promise<InsertResult<{ id: string }>>;
  insert: (values: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  delete: () => {
    eq: (k: string, v: string) => Promise<{ error: { message: string } | null }>;
  };
  update: (values: Record<string, unknown>) => {
    eq: (k: string, v: string) => {
      is: (k: string, v: unknown) => Promise<{ error: { message: string } | null }>;
    };
  };
}

export type MaterializeResult =
  | { ok: true; tripId: string; created: boolean }
  | { ok: false; error: string };

export function stripEmojis(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/\p{Extended_Pictographic}/gu, "").replace(/\s+/g, " ").trim();
}

export function buildTripInsert(payload: AnonTripPayload): {
  name: string;
  trip_name: string;
  itinerary_title: string;
  status: string;
  destination: string;
  tentative_start_date: string | null;
  tentative_end_date: string | null;
  destination_image_url: string | null;
  destination_country_iso: string | null;
} {
  const firstDest = payload.destinations?.[0];
  const lastDest = payload.destinations?.[payload.destinations.length - 1];
  const destination = (payload.destinations ?? [])
    .map((d) => d?.name)
    .filter((s): s is string => Boolean(s))
    .join(", ");
  const title = stripEmojis(payload.trip_title) || "Your Trip";
  return {
    name: title,
    trip_name: title,
    itinerary_title: title,
    status: "draft",
    destination,
    tentative_start_date: firstDest?.start_date || null,
    tentative_end_date: lastDest?.end_date || null,
    destination_image_url: payload.destination_image_url ?? null,
    destination_country_iso: payload.destination_country_iso ?? null,
  };
}

// Insert a trips row + an ai_trip_plans row using the user-scoped client,
// then mark the source anonymous_trips row claimed via the service-role
// client. Returns { ok: true, created: false } when the row was already
// claimed by this user (idempotent re-entry).
export async function materializeOne(
  userClient: ClaimDbClient,
  svcClient: ClaimDbClient,
  userId: string,
  row: AnonTripRow,
): Promise<MaterializeResult> {
  if (row.claimed_at !== null && row.claimed_by_user_id === userId && row.claimed_trip_id) {
    return { ok: true, tripId: row.claimed_trip_id, created: false };
  }
  // claimed by someone else — refuse
  if (row.claimed_at !== null && row.claimed_by_user_id !== userId) {
    return { ok: false, error: "anonymous trip already claimed by another user" };
  }

  const tripInsert = buildTripInsert(row.payload ?? {});

  const { data: trip, error: tripErr } = await userClient
    .from("trips")
    .insertReturning(tripInsert);

  if (tripErr || !trip) {
    return {
      ok: false,
      error: `trips insert failed: ${tripErr?.message ?? "no row returned"}`,
    };
  }

  const planInsertResult = await userClient
    .from("ai_trip_plans")
    .insert({
      trip_id: trip.id,
      created_by: userId,
      prompt: { free_text: row.prompt, source: "anonymous_claim" },
      result: row.payload as unknown as Record<string, unknown>,
    });

  if (planInsertResult.error) {
    // Roll back the orphan trip — best-effort, ignore the error.
    await userClient.from("trips").delete().eq("id", trip.id);
    return {
      ok: false,
      error: `ai_trip_plans insert failed: ${planInsertResult.error.message}`,
    };
  }

  const { error: claimErr } = await svcClient
    .from("anonymous_trips")
    .update({
      claimed_at: new Date().toISOString(),
      claimed_by_user_id: userId,
      claimed_trip_id: trip.id,
    })
    .eq("id", row.id)
    .is("claimed_at", null);

  if (claimErr) {
    console.error(
      `[claim-anonymous-trip] anonymous_trips update failed for id=${row.id}:`,
      claimErr.message,
    );
    // Trip + plan exist; user owns the trip. We don't undo because the user
    // is better off with the materialized trip than with a clean rollback.
  }

  return { ok: true, tripId: trip.id, created: true };
}
