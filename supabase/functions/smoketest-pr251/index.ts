// One-off smoke test for PR #251. Delete after use.
// Probes the 4 hardened edge functions live and returns a structured report.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const TEST_USER_ID = "6d4ef7bb-7a00-4081-8a43-071c738aec33";
const TEST_USER_EMAIL = "niederer1991+vaulttest@gmail.com";
const NON_MEMBER_ATTACHMENT_ID = "cbf87ebe-73f2-4a23-8dae-6f01c4b413c1"; // url attachment, trip 6143b30a...
const MEMBER_TRIP_ID = "6143b30a-7100-44a2-a50d-690080362b79";
const MEMBER_ATTACHMENT_ID = "cbf87ebe-73f2-4a23-8dae-6f01c4b413c1";  // same row, after we add user
const FILE_ATTACHMENT_NONMEMBER = "b0341fd0-7876-43e3-ae00-99aef39fccc1"; // visa pdf

const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function probe(name: string, path: string, token: string, body: unknown) {
  const res = await fetch(`${PROJECT_URL}/functions/v1/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: token,
    },
    body: JSON.stringify(body),
  });
  let parsed: unknown = null;
  const txt = await res.text();
  try { parsed = JSON.parse(txt); } catch { parsed = txt.slice(0, 300); }
  return { name, status: res.status, body: parsed };
}

Deno.serve(async () => {
  const admin = createClient(PROJECT_URL, SERVICE_KEY);

  // 1. Mint a magic-link / generate a session for the test user via admin API
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: TEST_USER_EMAIL,
  });
  if (linkErr) {
    return new Response(JSON.stringify({ error: "generateLink failed", detail: linkErr.message }), { status: 500 });
  }
  // Extract the token_hash and verify it to mint a real session
  const props = linkData?.properties as { hashed_token?: string; email_otp?: string } | undefined;
  const hashed = props?.hashed_token;
  if (!hashed) {
    return new Response(JSON.stringify({ error: "no hashed_token", linkData }), { status: 500 });
  }
  // verify with anon client
  const anon = createClient(PROJECT_URL, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: vData, error: vErr } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: hashed,
  });
  if (vErr || !vData.session) {
    return new Response(JSON.stringify({ error: "verifyOtp failed", detail: vErr?.message }), { status: 500 });
  }
  const userJwt = vData.session.access_token;

  const results: unknown[] = [];

  // TEST 1 — SSRF guard
  results.push(await probe("T1_ssrf_guard", "parse-itinerary", userJwt, {
    type: "url", url: "http://169.254.169.254/",
  }));

  // TEST 2a — send-push rejects user JWT
  results.push(await probe("T2a_push_user_jwt", "send-push-notification", userJwt, {
    user_id: TEST_USER_ID, title: "test", body: "test",
  }));

  // TEST 2b — send-push accepts service-role
  results.push(await probe("T2b_push_service_role", "send-push-notification", SERVICE_KEY, {
    user_id: TEST_USER_ID, title: "Smoke test", body: "Testing PR #251 end-to-end",
  }));

  // TEST 3a — fetch-link-preview NON-member (test user not in trip yet)
  results.push(await probe("T3a_linkpreview_nonmember", "fetch-link-preview", userJwt, {
    attachment_id: NON_MEMBER_ATTACHMENT_ID,
  }));

  // TEST 4a — extract-booking-info NON-member
  results.push(await probe("T4a_extractbooking_nonmember", "extract-booking-info", userJwt, {
    attachment_id: FILE_ATTACHMENT_NONMEMBER,
  }));

  // Now add test user to the trip and re-run member probes
  const { error: insertErr } = await admin.from("trip_members").insert({
    trip_id: MEMBER_TRIP_ID, user_id: TEST_USER_ID, role: "member",
  });
  const memberInsert = insertErr ? insertErr.message : "ok";

  // TEST 3b — fetch-link-preview MEMBER
  results.push(await probe("T3b_linkpreview_member", "fetch-link-preview", userJwt, {
    attachment_id: MEMBER_ATTACHMENT_ID,
  }));

  // TEST 4b — extract-booking-info MEMBER (need a file attachment in this trip)
  // Find one in the member trip
  const { data: memberAttachments } = await admin
    .from("attachments")
    .select("id, file_path, type")
    .eq("trip_id", MEMBER_TRIP_ID)
    .not("file_path", "is", null)
    .limit(1);
  const memberFileAttachment = memberAttachments?.[0]?.id;
  if (memberFileAttachment) {
    results.push(await probe("T4b_extractbooking_member", "extract-booking-info", userJwt, {
      attachment_id: memberFileAttachment,
    }));
  } else {
    results.push({ name: "T4b_extractbooking_member", skipped: "no file-attachment in trip" });
  }

  // Cleanup: remove test user from trip
  await admin.from("trip_members").delete().eq("trip_id", MEMBER_TRIP_ID).eq("user_id", TEST_USER_ID);

  return new Response(
    JSON.stringify({ memberInsert, results }, null, 2),
    { headers: { "Content-Type": "application/json" } },
  );
});
