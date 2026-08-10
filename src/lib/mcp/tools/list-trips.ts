import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";
import { failure, isAuthed, notAuthenticated, ok } from "../result";

export default defineTool({
  name: "list_trips",
  title: "List trips",
  description: "List the trips the signed-in Junto user is a member of, with dates and destination.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!isAuthed(ctx)) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("trips")
      .select("id, name, trip_name, destination, tentative_start_date, tentative_end_date, status, emoji")
      .order("tentative_start_date", { ascending: false });
    if (error) return failure(error.message);
    return ok(data ?? [], { trips: data ?? [] });
  },
});
