// Covers Fix 3's display normalization (the cosmetic part).
// formatActivityDuration is now used by ActivityCard; ResultsMap retains
// its inline implementation but matches the same shape.

import { describe, expect, it } from "vitest";
import { formatActivityDuration } from "./formatDuration";

describe("formatActivityDuration", () => {
  it("returns '${h}h' for whole-hour durations", () => {
    expect(formatActivityDuration(60)).toBe("1h");
    expect(formatActivityDuration(120)).toBe("2h");
    expect(formatActivityDuration(360)).toBe("6h"); // anchor nightclub
    expect(formatActivityDuration(480)).toBe("8h");
  });

  it("returns '${h}h ${m}m' for mixed durations", () => {
    expect(formatActivityDuration(90)).toBe("1h 30m");
    expect(formatActivityDuration(75)).toBe("1h 15m");
    expect(formatActivityDuration(150)).toBe("2h 30m");
    expect(formatActivityDuration(330)).toBe("5h 30m"); // anchor beach club
  });

  it("returns '${m}m' for sub-hour durations", () => {
    expect(formatActivityDuration(30)).toBe("30m");
    expect(formatActivityDuration(45)).toBe("45m");
  });

  it("returns null for null/undefined/non-finite/non-positive", () => {
    expect(formatActivityDuration(null)).toBeNull();
    expect(formatActivityDuration(undefined)).toBeNull();
    expect(formatActivityDuration(0)).toBeNull();
    expect(formatActivityDuration(-30)).toBeNull();
    expect(formatActivityDuration(NaN)).toBeNull();
    expect(formatActivityDuration(Infinity)).toBeNull();
  });

  it("does NOT return raw '${N}min' (the regression Fix 3 corrects)", () => {
    // Pre-fix, ActivityCard rendered "120min". The new format is "2h".
    expect(formatActivityDuration(120)).not.toMatch(/min$/);
  });
});
