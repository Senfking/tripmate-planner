import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { failure, isAuthed, notAuthenticated, ok } from "../result";

export default defineTool({
  name: "add_itinerary_item",
  title: "Add an itinerary item",
  description: "Add an activity to a trip's day-by-day itinerary.",
  inputSchema: {
    trip_id: z.string().describe("Trip UUID."),
    day_date: z.string().describe("ISO date (YYYY-MM-DD) for the day this happens."),
    title: z.string().describe("Short activity title."),
    start_time: z.string().optional().describe("Optional 24h start time, HH:MM."),
    end_time: z.string().optional().describe("Optional 24h end time, HH:MM."),
    location_text: z.string().optional().describe("Optional venue or address."),
    notes: z.string().optional().describe("Optional notes."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!isAuthed(ctx)) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("itinerary_items")
      .insert({
        trip_id: input.trip_id,
        day_date: input.day_date,
        title: input.title.trim(),
        start_time: input.start_time ?? null,
        end_time: input.end_time ?? null,
        location_text: input.location_text ?? null,
        notes: input.notes ?? null,
        created_by: ctx.getUserId(),
      })
      .select("id, day_date, start_time, title, location_text")
      .single();
    if (error) return failure(error.message);
    return ok(data, { item: data });
  },
});
