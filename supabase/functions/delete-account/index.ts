import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify calling user
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check if user is sole owner of any trips
    const { data: ownedTrips } = await adminClient
      .from("trip_members")
      .select("trip_id, trips(name)")
      .eq("user_id", user.id)
      .eq("role", "owner");

    if (ownedTrips && ownedTrips.length > 0) {
      // For each owned trip, check if there's another owner
      const soleOwnedTrips: string[] = [];
      for (const membership of ownedTrips) {
        const { count } = await adminClient
          .from("trip_members")
          .select("id", { count: "exact", head: true })
          .eq("trip_id", membership.trip_id)
          .eq("role", "owner")
          .neq("user_id", user.id);

        if (count === 0) {
          const tripName = (membership as any).trips?.name || "Unnamed trip";
          soleOwnedTrips.push(tripName);
        }
      }

      if (soleOwnedTrips.length > 0) {
        return new Response(
          JSON.stringify({
            error: "sole_owner",
            trips: soleOwnedTrips,
            message: `You are the sole owner of ${soleOwnedTrips.length} trip(s). Transfer ownership or delete these trips first.`,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Delete the user
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
