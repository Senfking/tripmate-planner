// Persistence helpers for anonymous trip generations. The Edge Function calls
// `persistAnonymousTrip` once per successful generation (cache-hit or fresh)
// to store the full payload for /trips/anon/[id] viewing and later claiming.

export interface AnonStorageClient {
  from: (table: string) => {
    insert: (
      values: Record<string, unknown>,
    ) => {
      select: (cols: string) => {
        single: () => Promise<{
          data: { id: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

export interface PersistAnonTripInput {
  anonSessionId: string;
  prompt: string | null;
  sourceIp: string | null;
  payload: Record<string, unknown>;
}

export async function persistAnonymousTrip(
  client: AnonStorageClient,
  input: PersistAnonTripInput,
): Promise<string | null> {
  const { data, error } = await client
    .from("anonymous_trips")
    .insert({
      anon_session_id: input.anonSessionId,
      prompt: input.prompt,
      // Postgres `inet` accepts string forms like "203.0.113.5" / "fe80::1".
      // Pass null when the proxy didn't expose a client IP (see extractClientIp).
      source_ip: input.sourceIp,
      payload: input.payload,
    })
    .select("id")
    .single();
  if (error || !data) {
    // Non-fatal — anon viewers without a stored row just don't get a
    // shareable /trips/anon/[id] link, but the in-memory response still
    // renders. Logged loudly so we notice persistent failures in dashboards.
    console.error(
      "[anonymous_trips] insert failed:",
      error?.message ?? "no row returned",
    );
    return null;
  }
  return data.id;
}
