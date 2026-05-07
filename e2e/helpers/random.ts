/**
 * Tiny dependency-free random-id helper. crypto.randomUUID is available on
 * Node 16+ and in browsers; the e2e suite only ever runs on Node so the
 * direct call is safe.
 */
export function randomId(prefix = "e2e"): string {
  const id = globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  return `${prefix}-${id}`;
}
