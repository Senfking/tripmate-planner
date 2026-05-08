// Covers Fix 2 (frontend photo preference) — backendActivityPhoto and
// hasBackendActivityPhoto. The runtime hook (`useGooglePlaceDetails`) is
// only called when these helpers indicate no backend-mirrored hero.

import { describe, expect, it } from "vitest";
import { backendActivityPhoto, hasBackendActivityPhoto } from "./activityPhoto";

describe("backendActivityPhoto", () => {
  it("returns the first photo URL when present", () => {
    expect(
      backendActivityPhoto({
        photos: ["https://storage.example/place_A/abc.jpg", "https://storage.example/place_A/def.jpg"],
      }),
    ).toBe("https://storage.example/place_A/abc.jpg");
  });

  it("returns null for empty photos array", () => {
    expect(backendActivityPhoto({ photos: [] })).toBeNull();
  });

  it("returns null for missing photos field", () => {
    expect(backendActivityPhoto({})).toBeNull();
  });

  it("returns null for null/undefined activity", () => {
    expect(backendActivityPhoto(null)).toBeNull();
    expect(backendActivityPhoto(undefined)).toBeNull();
  });

  it("returns null when first photo is empty string", () => {
    expect(backendActivityPhoto({ photos: [""] })).toBeNull();
  });

  it("returns null when photos is not an array (defensive)", () => {
    // Backend always emits an array; guard catches accidental coerce.
    expect(backendActivityPhoto({ photos: "not-an-array" as unknown as string[] })).toBeNull();
  });
});

describe("hasBackendActivityPhoto", () => {
  it("is true iff backendActivityPhoto returns a non-null URL", () => {
    expect(hasBackendActivityPhoto({ photos: ["url"] })).toBe(true);
    expect(hasBackendActivityPhoto({ photos: [] })).toBe(false);
    expect(hasBackendActivityPhoto({})).toBe(false);
    expect(hasBackendActivityPhoto(null)).toBe(false);
  });

  it("gates the runtime get-place-details hook (Fix 2 contract)", () => {
    // The contract this fix establishes: cards pass `enabled: !hasBackendHero`
    // to useGooglePlaceDetails so the runtime fetch is skipped when the
    // backend already mirrored a Storage URL. Older trips (no `photos`
    // field) keep firing the hook for backward compatibility.
    const newerTrip = { photos: ["https://storage/abc.jpg"] };
    const olderTrip = { photos: undefined };
    expect(hasBackendActivityPhoto(newerTrip)).toBe(true); // hook disabled
    expect(hasBackendActivityPhoto(olderTrip)).toBe(false); // hook enabled
  });
});
