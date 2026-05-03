// Resolves the trip_id for an attachment with the service role, then checks
// is_trip_member(trip_id, user_id). Without this, any authenticated user could
// pass an arbitrary attachment_id to trigger paid Anthropic calls, read file
// contents from any file_path, and overwrite booking_data on someone else's
// attachment.
export type AuthzResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export interface MinimalAdminClient {
  from: (t: string) => {
    select: (cols: string) => {
      eq: (k: string, v: string) => {
        maybeSingle: () => Promise<{ data: { trip_id: string } | null; error: unknown }>;
      };
    };
  };
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: boolean | null; error: unknown }>;
}

export async function checkTripMembership(
  adminClient: MinimalAdminClient,
  attachmentId: string,
  userId: string,
): Promise<AuthzResult> {
  const { data: row, error: lookupErr } = await adminClient
    .from("attachments")
    .select("trip_id")
    .eq("id", attachmentId)
    .maybeSingle();
  if (lookupErr) return { ok: false, status: 500, error: "Failed to resolve attachment" };
  if (!row) return { ok: false, status: 404, error: "Attachment not found" };

  const { data: isMember, error: rpcErr } = await adminClient.rpc("is_trip_member", {
    _trip_id: row.trip_id,
    _user_id: userId,
  });
  if (rpcErr) return { ok: false, status: 500, error: "Failed to verify trip membership" };
  if (!isMember) return { ok: false, status: 403, error: "Forbidden" };
  return { ok: true };
}
