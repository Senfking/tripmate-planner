import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { failure, isAuthed, notAuthenticated, ok } from "../result";

export default defineTool({
  name: "add_idea",
  title: "Add a trip idea",
  description: "Add a suggestion to a trip's idea board for the group to consider.",
  inputSchema: {
    trip_id: z.string().describe("Trip UUID."),
    title: z.string().describe("The idea, e.g. 'Sunset kayak in Cala Llombards'."),
    category: z.string().optional().describe("Optional category, e.g. food, activity, stay."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ trip_id, title, category }, ctx) => {
    if (!isAuthed(ctx)) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("trip_ideas")
      .insert({ trip_id, title: title.trim(), category: category ?? null, created_by: ctx.getUserId() })
      .select("id, title, category, status")
      .single();
    if (error) return failure(error.message);
    return ok(data, { idea: data });
  },
});
