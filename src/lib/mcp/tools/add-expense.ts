import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { failure, isAuthed, notAuthenticated, ok } from "../result";

export default defineTool({
  name: "add_expense",
  title: "Add an expense",
  description: "Record a new expense on a trip, paid by the signed-in user.",
  inputSchema: {
    trip_id: z.string().describe("Trip UUID."),
    title: z.string().describe("What the expense was for."),
    amount: z.number().describe("Amount in the given currency."),
    currency: z.string().describe("ISO 4217 currency code, e.g. EUR."),
    incurred_on: z.string().optional().describe("ISO date (YYYY-MM-DD). Defaults to today."),
    category: z.string().optional().describe("Optional category, e.g. food, transport, stay."),
    notes: z.string().optional().describe("Optional notes."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ trip_id, title, amount, currency, incurred_on, category, notes }, ctx) => {
    if (!isAuthed(ctx)) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("expenses")
      .insert({
        trip_id,
        payer_id: ctx.getUserId(),
        title: title.trim(),
        amount,
        currency: currency.trim().toUpperCase(),
        incurred_on: incurred_on ?? new Date().toISOString().slice(0, 10),
        category: category ?? null,
        notes: notes ?? null,
      })
      .select("id, title, amount, currency, incurred_on, category")
      .single();
    if (error) return failure(error.message);
    return ok(data, { expense: data });
  },
});
