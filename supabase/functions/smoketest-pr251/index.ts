// Final PR #251 smoke test — uses legacy JWT from vault for service-role probe
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const TEST_USER_ID = "6d4ef7bb-7a00-4081-8a43-071c738aec33";
const TEST_USER_EMAIL = "niederer1991+vaulttest@gmail.com";
const NON_MEMBER_ATTACHMENT_ID = "cbf87ebe-73f2-4a23-8dae-6f01c4b413c1"; // url, trip 6143b30a
const FILE_ATTACHMENT_NONMEMBER = "b0341fd0-7876-43e3-ae00-99aef39fccc1"; // pdf
const MEMBER_TRIP_ID = "6143b30a-7100-44a2-a50d-690080362b79";
const MEMBER_ATTACHMENT_ID = "cbf87ebe-73f2-4a23-8dae-6f01c4b413c1";

const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const ENV_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
  const admin = createClient(PROJECT_URL, ENV_SERVICE_KEY);

  // Read legacy JWT service-role key from vault (the one the DB trigger uses)
  const { data: vaultRows, error: vaultErr } = await admin.rpc("_tmp_pr251_vault_peek");
  // peek doesn't return the secret. Read it via a separate path.
  // Use a one-shot SECURITY DEFINER call to fetch the actual secret:
  const { data: rawData, error: rawErr } = await admin.rpc("_tmp_pr251_vault_read");
  const VAULT_SERVICE_KEY = rawData as unknown as string;

  if (!VAULT_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "no vault secret", vaultErr, rawErr, vaultRows }), { status: 500 });
  }

  // Mint a test-user session
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: TEST_USER_EMAIL,
  });
  if (linkErr) return new Response(JSON.stringify({ error: "generateLink", detail: linkErr.message }), { status: 500 });
  const hashed = (linkData?.properties as { hashed_token?: string } | undefined)?.hashed_token;
  if (!hashed) return new Response(JSON.stringify({ error: "no hashed_token" }), { status: 500 });
  const anon = createClient(PROJECT_URL, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: vData, error: vErr } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: hashed });
  if (vErr || !vData.session) return new Response(JSON.stringify({ error: "verifyOtp", detail: vErr?.message }), { status: 500 });
  const userJwt = vData.session.access_token;

  const results: unknown[] = [];

  results.push(await probe("T1_ssrf_guard", "parse-itinerary", userJwt, {
    type: "url", url: "http://169.254.169.254/",
  }));

  results.push(await probe("T2a_push_user_jwt", "send-push-notification", userJwt, {
    user_id: TEST_USER_ID, title: "test", body: "test",
  }));

  results.push(await probe("T2b_push_service_role_vault", "send-push-notification", VAULT_SERVICE_KEY, {
    user_id: TEST_USER_ID, title: "Smoke test", body: "Testing PR #251 end-to-end",
  }));

  const { data: nonMemberUrlAtt } = await admin.from("attachments").select("id, url").eq("id", NON_MEMBER_ATTACHMENT_ID).maybeSingle();
  const { data: nonMemberFileAtt } = await admin.from("attachments").select("id, file_path").eq("id", FILE_ATTACHMENT_NONMEMBER).maybeSingle();

  results.push(await probe("T3a_linkpreview_nonmember", "fetch-link-preview", userJwt, {
    attachment_id: NON_MEMBER_ATTACHMENT_ID,
    url: nonMemberUrlAtt?.url ?? "https://example.com",
  }));

  results.push(await probe("T4a_extractbooking_nonmember", "extract-booking-info", userJwt, {
    attachment_id: FILE_ATTACHMENT_NONMEMBER,
    file_path: nonMemberFileAtt?.file_path ?? "fake/path.pdf",
    file_type: "application/pdf",
  }));

  // Add test user to trip
  const { error: insertErr } = await admin.from("trip_members").insert({
    trip_id: MEMBER_TRIP_ID, user_id: TEST_USER_ID, role: "member",
  });
  const memberInsert = insertErr ? insertErr.message : "ok";

  results.push(await probe("T3b_linkpreview_member", "fetch-link-preview", userJwt, {
    attachment_id: MEMBER_ATTACHMENT_ID,
    url: nonMemberUrlAtt?.url ?? "https://example.com",
  }));

  const { data: memberAttachments } = await admin
    .from("attachments")
    .select("id, file_path, type")
    .eq("trip_id", MEMBER_TRIP_ID)
    .not("file_path", "is", null)
    .limit(1);
  const memberFileAttachment = memberAttachments?.[0];
  if (memberFileAttachment) {
    results.push(await probe("T4b_extractbooking_member", "extract-booking-info", userJwt, {
      attachment_id: memberFileAttachment.id,
      file_path: memberFileAttachment.file_path,
      file_type: "application/pdf",
    }));
  } else {
    results.push({ name: "T4b_extractbooking_member", skipped: "no file attachment" });
  }

  await admin.from("trip_members").delete().eq("trip_id", MEMBER_TRIP_ID).eq("user_id", TEST_USER_ID);

  return new Response(
    JSON.stringify({ memberInsert, vaultKeyLen: VAULT_SERVICE_KEY.length, results }, null, 2),
    { headers: { "Content-Type": "application/json" } },
  );
});
