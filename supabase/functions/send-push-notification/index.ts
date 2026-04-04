import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/* ------------------------------------------------------------------ */
/*  Helpers: base64url encoding / decoding                            */
/* ------------------------------------------------------------------ */

function base64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/* ------------------------------------------------------------------ */
/*  VAPID: build a signed JWT + derive the Authorization header       */
/* ------------------------------------------------------------------ */

async function buildVapidHeaders(
  endpoint: string,
  publicKeyB64: string,
  privateKeyB64: string,
  subject: string,
): Promise<{ authorization: string; cryptoKey: string }> {
  const aud = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600; // 12 h

  const header = base64urlEncode(
    new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })),
  );
  const payload = base64urlEncode(
    new TextEncoder().encode(JSON.stringify({ aud, exp, sub: subject })),
  );
  const unsigned = `${header}.${payload}`;

  // Import the VAPID private key as ECDSA P-256
  const rawPrivate = base64urlDecode(privateKeyB64);
  // Build JWK from raw 32-byte private scalar + 65-byte uncompressed public key
  const rawPublic = base64urlDecode(publicKeyB64);
  const x = base64urlEncode(rawPublic.slice(1, 33));
  const y = base64urlEncode(rawPublic.slice(33, 65));
  const d = base64urlEncode(rawPrivate);

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x, y, d },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(unsigned),
  );

  // ECDSA signature from WebCrypto is DER-encoded — we need raw r||s (64 bytes)
  const sig = derToRaw(new Uint8Array(signature));
  const token = `${unsigned}.${base64urlEncode(sig)}`;

  return {
    authorization: `vapid t=${token}, k=${publicKeyB64}`,
    cryptoKey: "",
  };
}

/** Convert DER-encoded ECDSA signature to raw 64-byte r||s format. */
function derToRaw(der: Uint8Array): Uint8Array {
  // If it's already 64 bytes, assume raw
  if (der.length === 64) return der;

  // DER: 0x30 <len> 0x02 <rLen> <r> 0x02 <sLen> <s>
  let offset = 2; // skip 0x30 + total length
  // r
  offset += 1; // 0x02
  const rLen = der[offset++];
  const r = der.slice(offset, offset + rLen);
  offset += rLen;
  // s
  offset += 1; // 0x02
  const sLen = der[offset++];
  const s = der.slice(offset, offset + sLen);

  const raw = new Uint8Array(64);
  raw.set(r.length > 32 ? r.slice(r.length - 32) : r, 32 - Math.min(r.length, 32));
  raw.set(s.length > 32 ? s.slice(s.length - 32) : s, 64 - Math.min(s.length, 32));
  return raw;
}

/* ------------------------------------------------------------------ */
/*  RFC 8291 — Web Push payload encryption (aes128gcm)                */
/* ------------------------------------------------------------------ */

function concat(...arrays: Uint8Array[]): Uint8Array {
  const len = arrays.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  for (const arr of arrays) {
    out.set(arr, offset);
    offset += arr.length;
  }
  return out;
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", (ikm as Uint8Array).buffer, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);

  // Extract
  const prk = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, (salt.length ? salt : new Uint8Array(32)).buffer),
  );

  // Actually do HKDF properly: extract then expand
  const prkKey = await crypto.subtle.importKey(
    "raw",
    ((salt.length ? salt : new Uint8Array(32)) as Uint8Array).buffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const prkBytes = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, (ikm as Uint8Array).buffer));

  const expandKey = await crypto.subtle.importKey(
    "raw",
    prkBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const infoWithCounter = concat(info, new Uint8Array([1]));
  const okm = new Uint8Array(await crypto.subtle.sign("HMAC", expandKey, infoWithCounter));

  return okm.slice(0, length);
}

function buildInfo(
  type: string,
  clientPublic: Uint8Array,
  serverPublic: Uint8Array,
): Uint8Array {
  const encoder = new TextEncoder();
  const typeBytes = encoder.encode(`Content-Encoding: ${type}\0`);
  const cLenBuf = new Uint8Array(2);
  new DataView(cLenBuf.buffer).setUint16(0, clientPublic.length);
  const sLenBuf = new Uint8Array(2);
  new DataView(sLenBuf.buffer).setUint16(0, serverPublic.length);
  return concat(
    typeBytes,
    encoder.encode("P-256\0"),
    cLenBuf,
    clientPublic,
    sLenBuf,
    serverPublic,
  );
}

async function encryptPayload(
  clientPublicKeyB64: string,
  authSecretB64: string,
  payload: Uint8Array,
): Promise<{ body: Uint8Array; localPublicKey: Uint8Array }> {
  const clientPublicRaw = base64urlDecode(clientPublicKeyB64);
  const authSecret = base64urlDecode(authSecretB64);

  // Generate ephemeral ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );

  const localPublicKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", localKeyPair.publicKey),
  );

  // Import client public key
  const clientPublicKey = await crypto.subtle.importKey(
    "raw",
    clientPublicRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  // ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientPublicKey },
      localKeyPair.privateKey,
      256,
    ),
  );

  // HKDF to derive the IKM from auth secret + shared secret (RFC 8291 §3.3)
  const ikmInfo = concat(
    new TextEncoder().encode("WebPush: info\0"),
    clientPublicRaw,
    localPublicKey,
  );
  const ikm = await hkdf(authSecret, sharedSecret, ikmInfo, 32);

  // Generate 16-byte salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Derive content encryption key (16 bytes) and nonce (12 bytes)
  const cekInfo = buildInfo("aes128gcm", clientPublicRaw, localPublicKey);
  const nonceInfo = buildInfo("nonce", clientPublicRaw, localPublicKey);
  const cek = await hkdf(salt, ikm, cekInfo, 16);
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  // Pad the plaintext: content + 0x02 delimiter (RFC 8188 §2)
  const padded = concat(payload, new Uint8Array([2]));

  // Encrypt with AES-128-GCM
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, [
    "encrypt",
  ]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded),
  );

  // Build aes128gcm body: salt (16) + rs (4) + idLen (1) + keyId (65) + ciphertext
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  const header = concat(salt, rs, new Uint8Array([localPublicKey.length]), localPublicKey);

  return { body: concat(header, ciphertext), localPublicKey };
}

/* ------------------------------------------------------------------ */
/*  Send a single push notification                                   */
/* ------------------------------------------------------------------ */

async function sendPush(
  endpoint: string,
  keys: { p256dh: string; auth: string },
  payload: object,
  vapidPublic: string,
  vapidPrivate: string,
  vapidSubject: string,
): Promise<{ status: number }> {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));

  const { body } = await encryptPayload(keys.p256dh, keys.auth, payloadBytes);

  const vapid = await buildVapidHeaders(endpoint, vapidPublic, vapidPrivate, vapidSubject);

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      Authorization: vapid.authorization,
      TTL: "86400",
      Urgency: "normal",
    },
    body,
  });

  return { status: resp.status };
}

/* ------------------------------------------------------------------ */
/*  Edge Function handler                                             */
/* ------------------------------------------------------------------ */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { user_id, title, body, url } = await req.json();

    if (!user_id || !title || !body) {
      return new Response(
        JSON.stringify({ error: "user_id, title, and body are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const vapidSubject = Deno.env.get("VAPID_SUBJECT")!;

    const db = createClient(supabaseUrl, serviceRoleKey);

    // Fetch all push subscriptions for the user
    const { data: subscriptions, error: fetchError } = await db
      .from("push_subscriptions")
      .select("id, endpoint, keys")
      .eq("user_id", user_id);

    if (fetchError) {
      throw new Error(`Failed to query subscriptions: ${fetchError.message}`);
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, expired: 0, message: "No subscriptions found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const payload = {
      title,
      body,
      url: url || "/",
      icon: "/icons/icon-192x192.png",
    };

    let sent = 0;
    let expired = 0;

    for (const sub of subscriptions) {
      try {
        const result = await sendPush(
          sub.endpoint,
          sub.keys as { p256dh: string; auth: string },
          payload,
          vapidPublic,
          vapidPrivate,
          vapidSubject,
        );

        if (result.status === 410 || result.status === 404) {
          // Subscription expired or unsubscribed — clean up
          await db.from("push_subscriptions").delete().eq("id", sub.id);
          expired++;
        } else if (result.status >= 200 && result.status < 300) {
          sent++;
        } else {
          console.error(
            `Push to ${sub.endpoint} returned status ${result.status}`,
          );
        }
      } catch (err) {
        console.error(`Failed to send push to ${sub.endpoint}:`, err);
      }
    }

    return new Response(
      JSON.stringify({ sent, expired }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("send-push-notification error:", err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
