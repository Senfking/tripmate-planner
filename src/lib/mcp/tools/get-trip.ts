import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { failure, isAuthed, notAuthenticated, ok } from "../result";

export default defineTool({
  name: "get_trip",
  title: "Get trip details",
  description: "Get one trip with its members, itinerary items and ideas. Use the trip id from list_trips.",
  inputSchema: { trip_id: z.string().describe("Trip UUID.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ trip_id }, ctx) => {
    if (!isAuthed(ctx)) return notAuthenticated();
    const supabase = supabaseForUser(ctx);

    const { data: trip, error } = await supabase
      .from("trips")
      .select("id, name, trip_name, destination, tentative_start_date, tentative_end_date, status, settlement_currency, emoji")
      .eq("id", trip_id)
      .maybeSingle();
    if (error) return failure(error.message);
    if (!trip) return failure("Trip not found, or you do not have access to it.");

    const [{ data: members }, { data: itinerary }, { data: ideas }] = await Promise.all([
      supabase.from("trip_members").select("user_id, role, attendance_status").eq("trip_id", trip_id),
      supabase
        .from("itinerary_items")
        .select("id, day_date, start_time, end_time, title, location_text, status")
        .eq("trip_id", trip_id)
        .order("day_date", { ascending: true })
        .order("sort_order", { ascending: true }),
      supabase.from("trip_ideas").select("id, title, category, status").eq("trip_id", trip_id),
    ]);

    const result = { trip, members: members ?? [], itinerary: itinerary ?? [], ideas: ideas ?? [] };
    return ok(result, result);
  },
});
