// Probes for the trip-membership authorization added to extract-booking-info.
// Run with: deno test supabase/functions/extract-booking-info/index.test.ts
import { checkTripMembership } from "./authz.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("Assertion failed: " + msg);
}

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

Deno.test("non-member gets 403 BEFORE any storage read happens", async () => {
  // The point of this guard is to deny before downloading file_path —
  // checkTripMembership returns the rejection so the caller short-circuits.
  const client = makeMockClient({
    attachmentRow: { trip_id: "trip-A" },
    isMember: false,
  });
  const r = await checkTripMembership(client, "attachment-belonging-to-someone-else", "stranger");
  assert(!r.ok && r.status === 403, "stranger must not be able to extract");
});

Deno.test("missing attachment → 404", async () => {
  const client = makeMockClient({ attachmentRow: null });
  const r = await checkTripMembership(client, "does-not-exist", "user-1");
  assert(!r.ok && r.status === 404, "404 for unknown attachment");
});

Deno.test("trip member is allowed through", async () => {
  const client = makeMockClient({
    attachmentRow: { trip_id: "trip-A" },
    isMember: true,
  });
  const r = await checkTripMembership(client, "attachment-xyz", "member-1");
  assert(r.ok, "member must be allowed");
});

Deno.test("DB errors fail closed with 500", async () => {
  const lookupErr = await checkTripMembership(
    makeMockClient({ attachmentError: { message: "x" } }),
    "a",
    "u",
  );
  assert(!lookupErr.ok && lookupErr.status === 500, "lookup err → 500");
  const rpcErr = await checkTripMembership(
    makeMockClient({ attachmentRow: { trip_id: "t" }, rpcError: { message: "x" } }),
    "a",
    "u",
  );
  assert(!rpcErr.ok && rpcErr.status === 500, "rpc err → 500");
});
