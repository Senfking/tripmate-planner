import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { failure, isAuthed, notAuthenticated, ok } from "../result";

export default defineTool({
  name: "list_expenses",
  title: "List trip expenses",
  description: "List expenses recorded on a trip, most recent first.",
  inputSchema: { trip_id: z.string().describe("Trip UUID.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ trip_id }, ctx) => {
    if (!isAuthed(ctx)) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("expenses")
      .select("id, title, amount, currency, category, incurred_on, payer_id, split_type, notes")
      .eq("trip_id", trip_id)
      .order("incurred_on", { ascending: false })
      .limit(200);
    if (error) return failure(error.message);
    const total = (data ?? []).reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
    return ok({ expenses: data ?? [], count: data?.length ?? 0, raw_total: total }, { expenses: data ?? [] });
  },
});
