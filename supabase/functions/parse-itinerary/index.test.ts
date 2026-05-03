// Probes for the SSRF guard added to parse-itinerary.
// Run with: deno test supabase/functions/parse-itinerary/index.test.ts
import { isUrlAllowedForFetch } from "./url-guard.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("Assertion failed: " + msg);
}

Deno.test("rejects AWS/Azure IMDS link-local address", () => {
  assert(!isUrlAllowedForFetch("http://169.254.169.254/latest/meta-data/"), "IMDS must be blocked");
  assert(!isUrlAllowedForFetch("https://169.254.169.254/"), "IMDS https must be blocked");
});

Deno.test("rejects GCP metadata server", () => {
  assert(
    !isUrlAllowedForFetch("http://metadata.google.internal/computeMetadata/v1/"),
    "GCP metadata host must be blocked",
  );
});

Deno.test("rejects loopback and unspecified hosts", () => {
  assert(!isUrlAllowedForFetch("http://localhost/"), "localhost blocked");
  assert(!isUrlAllowedForFetch("http://127.0.0.1:8080/admin"), "127.0.0.1 blocked");
  assert(!isUrlAllowedForFetch("http://0.0.0.0/"), "0.0.0.0 blocked");
  assert(!isUrlAllowedForFetch("http://[::1]/"), "[::1] blocked");
});

Deno.test("rejects RFC1918 private IPv4 ranges", () => {
  assert(!isUrlAllowedForFetch("http://10.0.0.5/"), "10/8 blocked");
  assert(!isUrlAllowedForFetch("http://192.168.1.1/"), "192.168/16 blocked");
  assert(!isUrlAllowedForFetch("http://172.16.0.1/"), "172.16/12 blocked");
  assert(!isUrlAllowedForFetch("http://172.31.255.254/"), "172.31 blocked");
});

Deno.test("rejects internal DNS suffixes", () => {
  assert(!isUrlAllowedForFetch("http://service.internal/"), ".internal blocked");
  assert(!isUrlAllowedForFetch("http://printer.local/"), ".local blocked");
});

Deno.test("rejects non-http(s) schemes", () => {
  assert(!isUrlAllowedForFetch("file:///etc/passwd"), "file:// blocked");
  assert(!isUrlAllowedForFetch("ftp://example.com/"), "ftp:// blocked");
  assert(!isUrlAllowedForFetch("gopher://example.com/"), "gopher:// blocked");
});

Deno.test("rejects malformed URLs", () => {
  assert(!isUrlAllowedForFetch("not a url"), "garbage rejected");
  assert(!isUrlAllowedForFetch(""), "empty rejected");
});

Deno.test("allows ordinary public URLs", () => {
  assert(isUrlAllowedForFetch("https://example.com/foo"), "public https allowed");
  assert(isUrlAllowedForFetch("http://example.com/"), "public http allowed");
  assert(isUrlAllowedForFetch("https://www.booking.com/hotel/x.html"), "booking.com allowed");
});
