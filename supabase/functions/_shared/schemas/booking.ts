// Strict Zod schema for the JSON Anthropic returns from extract-booking-info.
// Anything that doesn't match — wrong types, unknown keys, malformed dates —
// is rejected before persistence so a hallucinated field can't silently
// corrupt attachments.booking_data / og_title / type.

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const BookingType = z.enum([
  "flight",
  "hotel",
  "activity",
  "visa",
  "insurance",
  "transport",
  "payment",
  "other",
]);

const Direction = z.enum(["outbound", "return"]).nullable();

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
  .nullable();

const isoTime = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "must be HH:MM")
  .nullable();

const optStr = (max: number) => z.string().max(max).nullable();

export const BookingExtractionSchema = z
  .object({
    booking_type: BookingType,
    title: optStr(200),
    provider: optStr(200),
    booking_reference: optStr(120),
    flight_date: isoDate,
    check_in: isoDate,
    check_out: isoDate,
    departure: optStr(200),
    destination: optStr(200),
    departure_time: isoTime,
    arrival_time: isoTime,
    direction: Direction,
    passenger_names: z.array(z.string().max(200)).nullable(),
    total_price: optStr(120),
    notes: optStr(2000),
  })
  .strict();

export type BookingExtraction = z.infer<typeof BookingExtractionSchema>;
