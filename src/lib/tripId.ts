const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Treats the literal string "undefined" — produced when a template literal
 * interpolates an undefined value into a URL — as not a valid trip id.
 */
export function isValidTripId(id: string | undefined | null): id is string {
  return !!id && id !== "undefined" && id !== "null" && UUID_REGEX.test(id);
}
