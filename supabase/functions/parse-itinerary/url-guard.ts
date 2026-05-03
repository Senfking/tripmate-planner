// SSRF guard: reject non-http(s) schemes, localhost, private IPv4 ranges,
// link-local (incl. AWS/Azure IMDS at 169.254.169.254), GCP metadata host,
// and *.internal / *.local DNS names. Mirrors fetch-link-preview's inline guard.
export function isUrlAllowedForFetch(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const hostname = parsed.hostname.toLowerCase();
  const blockedHosts = [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "[::1]",
    "::1",
    "metadata.google.internal",
  ];
  if (blockedHosts.includes(hostname)) return false;
  if (hostname.startsWith("10.")) return false;
  if (hostname.startsWith("192.168.")) return false;
  if (hostname.startsWith("169.254.")) return false; // link-local incl. IMDS
  if (hostname.endsWith(".internal")) return false;
  if (hostname.endsWith(".local")) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false;
  return true;
}
