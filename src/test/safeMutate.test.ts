import { describe, it, expect } from "vitest";
import { expectAffectedRows, expectOneAffectedRow, NoAffectedRowsError } from "@/lib/safeMutate";

// PostgrestError shape — only the fields we actually inspect matter.
const fakeError = (message: string, code = "42501") => ({
  message,
  code,
  details: null,
  hint: null,
  name: "PostgrestError",
});

describe("expectAffectedRows", () => {
  it("returns rows when at least one was affected", () => {
    const rows = expectAffectedRows({ data: [{ id: "1" }, { id: "2" }], error: null });
    expect(rows).toEqual([{ id: "1" }, { id: "2" }]);
  });

  it("throws NoAffectedRowsError on the silent-RLS shape (data: [], error: null)", () => {
    expect(() =>
      expectAffectedRows({ data: [], error: null }, "Trip could not be deleted."),
    ).toThrow(NoAffectedRowsError);

    try {
      expectAffectedRows({ data: [], error: null }, "Trip could not be deleted.");
    } catch (err) {
      expect(err).toBeInstanceOf(NoAffectedRowsError);
      expect((err as NoAffectedRowsError).code).toBe("PGRST_NO_AFFECTED_ROWS");
      expect((err as Error).message).toBe("Trip could not be deleted.");
    }
  });

  it("throws NoAffectedRowsError when data is null and there is no error", () => {
    expect(() => expectAffectedRows({ data: null, error: null })).toThrow(NoAffectedRowsError);
  });

  it("rethrows the PostgREST error untouched", () => {
    const err = fakeError("permission denied for table trips");
    expect(() => expectAffectedRows({ data: null, error: err as never })).toThrow(
      "permission denied for table trips",
    );
  });

  it("uses default message when no fallback provided", () => {
    try {
      expectAffectedRows({ data: [], error: null });
    } catch (err) {
      expect((err as Error).message).toMatch(/refresh/i);
    }
  });
});

describe("expectOneAffectedRow", () => {
  it("returns the single row", () => {
    const row = expectOneAffectedRow({ data: [{ id: "1" }], error: null });
    expect(row).toEqual({ id: "1" });
  });

  it("throws on zero rows", () => {
    expect(() => expectOneAffectedRow({ data: [], error: null })).toThrow(NoAffectedRowsError);
  });

  it("throws on multiple rows (filter wasn't unique)", () => {
    expect(() =>
      expectOneAffectedRow({ data: [{ id: "1" }, { id: "2" }], error: null }),
    ).toThrow(/Expected one affected row/);
  });
});
