/**
 * Returns the public app origin for shareable links, or null if
 * the app is running in a context that isn't publicly accessible
 * (e.g. Lovable editor iframe or private preview).
 */
export function getShareableAppOrigin(): string | null {
  const origin = window.location.origin;
  const hostname = window.location.hostname;

  // Running inside the Lovable editor iframe - not shareable
  if (hostname.includes("lovable.dev")) {
    return null;
  }

  // Private preview URLs require Lovable login - not shareable to outsiders
  if (hostname.includes("id-preview--") && hostname.includes("lovable.app")) {
    return null;
  }

  // Published lovable.app domain or custom domain - shareable
  return origin;
}
