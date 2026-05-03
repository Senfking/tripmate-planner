// Probes for the trip-membership authorization added to fetch-link-preview.
// Run with: deno test supabase/functions/fetch-link-preview/index.test.ts
import { checkTripMembership } from "./authz.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("Assertion failed: " + msg);
}

// Minimal mock that mimics the subset of the supabase-js admin client used
// by checkTripMembership (.from(...).select(...).eq(...).maybeSingle() and
// .rpc(...)). We can dial each call's outcome per test.
function makeMockClient(opts: {
  attachmentRow?: { trip_id: string } | null;
  attachmentError?: unknown;
  isMember?: boolean | null;
  rpcError?: unknown;
}) {
  return {
    from: (_t: string) => ({
      select: (_c: string) => ({
        eq: (_k: string, _v: string) => ({
          maybeSingle: () =>
            Promise.resolve({
              data: opts.attachmentRow ?? null,
              error: opts.attachmentError ?? null,
            }),
        }),
      }),
    }),
    rpc: (_fn: string, _args: Record<string, unknown>) =>
      Promise.resolve({ data: opts.isMember ?? null, error: opts.rpcError ?? null }),
  };
}

Deno.test("rejects with 404 when the attachment does not exist", async () => {
  const client = makeMockClient({ attachmentRow: null });
  const r = await checkTripMembership(client, "attachment-xyz", "user-1");
  assert(!r.ok && r.status === 404, "404 for unknown attachment");
});

Deno.test("rejects with 403 when caller is not a trip member", async () => {
  const client = makeMockClient({
    attachmentRow: { trip_id: "trip-A" },
    isMember: false,
  });
  const r = await checkTripMembership(client, "attachment-xyz", "stranger");
  assert(!r.ok && r.status === 403, "non-member must get 403");
});

Deno.test("rejects with 403 when membership rpc returns null", async () => {
  const client = makeMockClient({
    attachmentRow: { trip_id: "trip-A" },
    isMember: null,
  });
  const r = await checkTripMembership(client, "attachment-xyz", "stranger");
  assert(!r.ok && r.status === 403, "null is treated as not-a-member");
});

Deno.test("returns 500 on attachment lookup error", async () => {
  const client = makeMockClient({ attachmentError: { message: "db down" } });
  const r = await checkTripMembership(client, "attachment-xyz", "user-1");
  assert(!r.ok && r.status === 500, "lookup error → 500");
});

Deno.test("returns 500 on rpc error", async () => {
  const client = makeMockClient({
    attachmentRow: { trip_id: "trip-A" },
    rpcError: { message: "rpc boom" },
  });
  const r = await checkTripMembership(client, "attachment-xyz", "user-1");
  assert(!r.ok && r.status === 500, "rpc error → 500");
});

Deno.test("accepts a real trip member", async () => {
  const client = makeMockClient({
    attachmentRow: { trip_id: "trip-A" },
    isMember: true,
  });
  const r = await checkTripMembership(client, "attachment-xyz", "member-1");
  assert(r.ok, "member must be allowed");
});
