import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(msg: string, status = 400) {
  return json({ error: msg }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth: verify caller is admin
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return err("Unauthorized", 401);

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminUserId = Deno.env.get("ADMIN_USER_ID")!;

  // Decode JWT to get caller identity (no SDK dependency)
  const token = authHeader.replace("Bearer ", "");
  let callerId: string;
  try {
    const payloadB64 = token.split(".")[1];
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
    callerId = payload.sub;
    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return err("Token expired", 401);
    }
  } catch {
    return err("Invalid token", 401);
  }
  if (!callerId || callerId !== adminUserId) {
    console.error("Not admin:", callerId, "expected:", adminUserId);
    return err("Forbidden", 403);
  }

  // Service role client for unrestricted access
  const db = createClient(supabaseUrl, serviceKey);

  const body = await req.json();
  const { type, period, ...params } = body;

  // Period helper
  function periodInterval(p: string): string | null {
    if (p === "7d") return "7 days";
    if (p === "30d") return "30 days";
    if (p === "90d") return "90 days";
    return null; // "all"
  }

  function periodWhere(col: string, p: string): string {
    const iv = periodInterval(p);
    return iv ? `${col} > now() - interval '${iv}'` : "true";
  }

  function priorPeriodWhere(col: string, p: string): string {
    const iv = periodInterval(p);
    if (!iv) return "true";
    const days = p === "7d" ? 7 : p === "30d" ? 30 : 90;
    return `${col} > now() - interval '${days * 2} days' AND ${col} <= now() - interval '${days} days'`;
  }

  try {
    switch (type) {
      case "dashboard_kpis": {
        const p = period || "30d";
        const { data } = await db.rpc("admin_dashboard_kpis" as any, {});
        // Since we can't use rpc, do raw queries via postgrest
        // We'll do multiple queries
        const [
          totalUsers, newUsers, newUsersPrior,
          totalTrips, activeTrips,
          totalExpenses,
          openFeedback,
          aiCalls, aiCallsPrior,
          referralShares, referralSharesPrior,
          landingViews, landingViewsPrior
        ] = await Promise.all([
          db.from("profiles").select("id", { count: "exact", head: true }),
          db.from("profiles").select("id", { count: "exact", head: true })
            .filter("created_at", "gt", periodDate(p)),
          db.from("profiles").select("id", { count: "exact", head: true })
            .filter("created_at", "gt", priorPeriodDate(p))
            .filter("created_at", "lte", periodDate(p)),
          db.from("trips").select("id", { count: "exact", head: true }),
          // Active trips: trips with recent expenses or itinerary items
          db.from("expenses").select("trip_id", { count: "exact", head: false })
            .filter("created_at", "gt", periodDate(p)),
          db.from("expenses").select("id", { count: "exact", head: true }),
          db.from("feedback").select("id", { count: "exact", head: true })
            .or("status.is.null,status.neq.resolved"),
          db.from("analytics_events").select("id", { count: "exact", head: true })
            .like("event_name", "ai_%")
            .filter("created_at", "gt", periodDate(p)),
          db.from("analytics_events").select("id", { count: "exact", head: true })
            .like("event_name", "ai_%")
            .filter("created_at", "gt", priorPeriodDate(p))
            .filter("created_at", "lte", periodDate(p)),
          db.from("analytics_events").select("id", { count: "exact", head: true })
            .eq("event_name", "referral_link_shared")
            .filter("created_at", "gt", periodDate(p)),
          db.from("analytics_events").select("id", { count: "exact", head: true })
            .eq("event_name", "referral_link_shared")
            .filter("created_at", "gt", priorPeriodDate(p))
            .filter("created_at", "lte", periodDate(p)),
          db.from("analytics_events").select("id", { count: "exact", head: true })
            .eq("event_name", "landing_page_view")
            .filter("created_at", "gt", periodDate(p)),
          db.from("analytics_events").select("id", { count: "exact", head: true })
            .eq("event_name", "landing_page_view")
            .filter("created_at", "gt", priorPeriodDate(p))
            .filter("created_at", "lte", periodDate(p)),
        ]);

        // Count distinct active trip IDs
        const activeTripsSet = new Set((activeTrips.data || []).map((r: any) => r.trip_id));

        return json({
          total_users: totalUsers.count || 0,
          new_users: newUsers.count || 0,
          new_users_prior: newUsersPrior.count || 0,
          total_trips: totalTrips.count || 0,
          active_trips: activeTripsSet.size,
          total_expenses: totalExpenses.count || 0,
          open_feedback: openFeedback.count || 0,
          ai_calls: aiCalls.count || 0,
          ai_calls_prior: aiCallsPrior.count || 0,
          referral_shares: referralShares.count || 0,
          referral_shares_prior: referralSharesPrior.count || 0,
          landing_views: landingViews.count || 0,
          landing_views_prior: landingViewsPrior.count || 0,
        });
      }

      case "user_growth_chart": {
        const p = period || "30d";
        const { data } = await db.from("profiles")
          .select("created_at")
          .filter("created_at", "gt", periodDate(p))
          .order("created_at", { ascending: true });

        const daily: Record<string, number> = {};
        (data || []).forEach((r: any) => {
          const day = r.created_at.substring(0, 10);
          daily[day] = (daily[day] || 0) + 1;
        });

        return json(Object.entries(daily).map(([date, count]) => ({ date, count })));
      }

      case "landing_views_chart": {
        const p = period || "30d";
        const { data } = await db.from("analytics_events")
          .select("created_at")
          .eq("event_name", "landing_page_view")
          .filter("created_at", "gt", periodDate(p))
          .order("created_at", { ascending: true });

        const daily: Record<string, number> = {};
        (data || []).forEach((r: any) => {
          const day = r.created_at.substring(0, 10);
          daily[day] = (daily[day] || 0) + 1;
        });

        return json(Object.entries(daily).map(([date, count]) => ({ date, count })));
      }

      case "recent_activity": {
        const [profiles, trips, feedback, aiEvents] = await Promise.all([
          db.from("profiles").select("id, display_name, created_at").order("created_at", { ascending: false }).limit(5),
          db.from("trips").select("id, name, created_at").order("created_at", { ascending: false }).limit(5),
          db.from("feedback").select("id, body, created_at, rating").order("created_at", { ascending: false }).limit(5),
          db.from("analytics_events").select("id, event_name, created_at, properties")
            .like("event_name", "ai_%")
            .order("created_at", { ascending: false }).limit(5),
        ]);

        const items = [
          ...(profiles.data || []).map((r: any) => ({ type: "signup", description: r.display_name || "New user", time: r.created_at })),
          ...(trips.data || []).map((r: any) => ({ type: "trip_created", description: r.name, time: r.created_at })),
          ...(feedback.data || []).map((r: any) => ({ type: "feedback", description: (r.body || "").substring(0, 60) || `Rating: ${r.rating}`, time: r.created_at })),
          ...(aiEvents.data || []).map((r: any) => ({ type: "ai_usage", description: r.event_name.replace("ai_", ""), time: r.created_at })),
        ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 15);

        return json(items);
      }

      case "acquisition_stats": {
        const p = period || "30d";
        const pd = periodDate(p);
        const [landing, getStarted, signups, tripMembers, expensePayers, referralShared, invitesSent] = await Promise.all([
          db.from("analytics_events").select("id", { count: "exact", head: true }).eq("event_name", "landing_page_view").filter("created_at", "gt", pd),
          db.from("analytics_events").select("id", { count: "exact", head: true }).eq("event_name", "get_started_click").filter("created_at", "gt", pd),
          db.from("profiles").select("id", { count: "exact", head: true }).filter("created_at", "gt", pd),
          db.from("trip_members").select("user_id").filter("joined_at", "gt", pd),
          db.from("expenses").select("payer_id").filter("created_at", "gt", pd),
          db.from("analytics_events").select("id", { count: "exact", head: true }).eq("event_name", "referral_link_shared").filter("created_at", "gt", pd),
          db.from("analytics_events").select("id", { count: "exact", head: true }).eq("event_name", "trip_invite_sent").filter("created_at", "gt", pd),
        ]);

        const landingCount = landing.count || 0;
        const getStartedCount = getStarted.count || 0;
        const signupCount = signups.count || 0;
        const activatedCount = new Set((tripMembers.data || []).map((r: any) => r.user_id)).size;
        const expenseCount = new Set((expensePayers.data || []).map((r: any) => r.payer_id)).size;

        return json({
          landing_views: landingCount,
          get_started: getStartedCount,
          signups: signupCount,
          activated: activatedCount,
          first_expense: expenseCount,
          get_started_rate: landingCount > 0 ? (getStartedCount / landingCount * 100).toFixed(1) : "0",
          signup_rate: getStartedCount > 0 ? (signupCount / getStartedCount * 100).toFixed(1) : "0",
          activation_rate: signupCount > 0 ? (activatedCount / signupCount * 100).toFixed(1) : "0",
          referral_shared: referralShared.count || 0,
          invites_sent: invitesSent.count || 0,
        });
      }

      case "acquisition_funnel": {
        const p = period || "30d";
        const pd = periodDate(p);
        const [landing, getStarted, signups, tripMembers, expensePayers] = await Promise.all([
          db.from("analytics_events").select("id", { count: "exact", head: true }).eq("event_name", "landing_page_view").filter("created_at", "gt", pd),
          db.from("analytics_events").select("id", { count: "exact", head: true }).eq("event_name", "get_started_click").filter("created_at", "gt", pd),
          db.from("profiles").select("id", { count: "exact", head: true }).filter("created_at", "gt", pd),
          db.from("trip_members").select("user_id").filter("joined_at", "gt", pd),
          db.from("expenses").select("payer_id").filter("created_at", "gt", pd),
        ]);

        const activatedCount = new Set((tripMembers.data || []).map((r: any) => r.user_id)).size;
        const expenseCount = new Set((expensePayers.data || []).map((r: any) => r.payer_id)).size;

        return json({
          stages: [
            { name: "Landing View", count: landing.count || 0 },
            { name: "Get Started", count: getStarted.count || 0 },
            { name: "Account Created", count: signups.count || 0 },
            { name: "First Trip", count: activatedCount },
            { name: "First Expense", count: expenseCount },
          ],
        });
      }

      case "acquisition_utm": {
        const p = period || "30d";
        const pd = periodDate(p);
        const { data } = await db.from("analytics_events")
          .select("properties")
          .eq("event_name", "landing_page_view")
          .filter("created_at", "gt", pd);

        const sources: Record<string, number> = {};
        (data || []).forEach((r: any) => {
          const src = r.properties?.utm_source || "direct";
          sources[src] = (sources[src] || 0) + 1;
        });

        return json(Object.entries(sources).map(([source, views]) => ({ source, views })).sort((a, b) => b.views - a.views));
      }

      case "acquisition_chart": {
        const p = period || "30d";
        const pd = periodDate(p);
        const [landingData, referralData, inviteData] = await Promise.all([
          db.from("analytics_events").select("created_at").eq("event_name", "landing_page_view").filter("created_at", "gt", pd),
          db.from("analytics_events").select("created_at").eq("event_name", "referral_link_shared").filter("created_at", "gt", pd),
          db.from("analytics_events").select("created_at").eq("event_name", "trip_invite_sent").filter("created_at", "gt", pd),
        ]);

        const daily: Record<string, { landing: number; referral: number; invite: number }> = {};
        const addToDay = (items: any[], key: string) => {
          (items || []).forEach((r: any) => {
            const day = r.created_at.substring(0, 10);
            if (!daily[day]) daily[day] = { landing: 0, referral: 0, invite: 0 };
            (daily[day] as any)[key]++;
          });
        };
        addToDay(landingData.data || [], "landing");
        addToDay(referralData.data || [], "referral");
        addToDay(inviteData.data || [], "invite");

        return json(Object.entries(daily).sort().map(([date, d]) => ({ date, ...d })));
      }

      case "ai_usage_summary": {
        const p = period || "30d";
        const pd = periodDate(p);
        const features = [
          { key: "receipt_scan", event: "ai_receipt_scan" },
          { key: "feedback_hint", event: "ai_feedback_hint" },
          { key: "itinerary_import", event: "ai_itinerary_import" },
          { key: "booking_extract", event: "ai_booking_extract" },
        ];

        const results = await Promise.all(features.map(async (f) => {
          const [total, periodData, successData] = await Promise.all([
            db.from("analytics_events").select("id", { count: "exact", head: true }).eq("event_name", f.event),
            db.from("analytics_events").select("user_id").eq("event_name", f.event).filter("created_at", "gt", pd),
            f.key === "itinerary_import"
              ? db.from("analytics_events").select("id", { count: "exact", head: true }).eq("event_name", "ai_itinerary_import_success").filter("created_at", "gt", pd)
              : Promise.resolve({ count: null }),
          ]);

          const periodCount = (periodData.data || []).length;
          const uniqueUsers = new Set((periodData.data || []).map((r: any) => r.user_id).filter(Boolean)).size;

          return {
            feature: f.key,
            total_calls: total.count || 0,
            period_calls: periodCount,
            unique_users: uniqueUsers,
            avg_per_user: uniqueUsers > 0 ? (periodCount / uniqueUsers).toFixed(1) : "0",
            success_count: successData.count,
          };
        }));

        return json(results);
      }

      case "ai_usage_daily": {
        const p = period || "30d";
        const pd = periodDate(p);
        const { data } = await db.from("analytics_events")
          .select("event_name, created_at")
          .like("event_name", "ai_%")
          .filter("created_at", "gt", pd);

        const daily: Record<string, Record<string, number>> = {};
        (data || []).forEach((r: any) => {
          const day = r.created_at.substring(0, 10);
          if (!daily[day]) daily[day] = {};
          const feature = r.event_name.replace("ai_", "");
          daily[day][feature] = (daily[day][feature] || 0) + 1;
        });

        return json(Object.entries(daily).sort().map(([date, features]) => ({ date, ...features })));
      }

      case "ai_power_users": {
        const p = period || "30d";
        const pd = periodDate(p);
        const { data } = await db.from("analytics_events")
          .select("user_id, event_name")
          .like("event_name", "ai_%")
          .not("user_id", "is", null)
          .filter("created_at", "gt", pd);

        const userCounts: Record<string, Record<string, number>> = {};
        (data || []).forEach((r: any) => {
          if (!r.user_id) return;
          if (!userCounts[r.user_id]) userCounts[r.user_id] = {};
          const feat = r.event_name;
          userCounts[r.user_id][feat] = (userCounts[r.user_id][feat] || 0) + 1;
        });

        const userIds = Object.keys(userCounts);
        let profiles: any[] = [];
        if (userIds.length > 0) {
          const { data: p } = await db.from("profiles").select("id, display_name").in("id", userIds);
          profiles = p || [];
        }

        const profileMap = Object.fromEntries(profiles.map((p: any) => [p.id, p.display_name]));

        const ranked = Object.entries(userCounts)
          .map(([uid, counts]) => ({
            user_id: uid,
            display_name: profileMap[uid] || "Unknown",
            receipt_scans: counts["ai_receipt_scan"] || 0,
            feedback_hints: counts["ai_feedback_hint"] || 0,
            itinerary_imports: counts["ai_itinerary_import"] || 0,
            booking_extracts: counts["ai_booking_extract"] || 0,
            total: Object.values(counts).reduce((a, b) => a + b, 0),
          }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 10);

        return json(ranked);
      }

      case "all_users": {
        const { search, sort, page = 0, page_size = 50 } = params;
        let query = db.from("profiles").select("id, display_name, avatar_url, created_at, subscription_tier, subscription_status, stripe_customer_id, referral_code, referred_by, default_currency");

        if (search) {
          query = query.ilike("display_name", `%${search}%`);
        }

        const sortCol = sort === "trips" ? "created_at" : sort === "ai" ? "created_at" : "created_at";
        query = query.order(sortCol, { ascending: false }).range(page * page_size, (page + 1) * page_size - 1);

        const { data, count } = await query;

        // Get trip counts and AI counts for each user
        const userIds = (data || []).map((u: any) => u.id);
        let tripCounts: Record<string, number> = {};
        let aiCounts: Record<string, number> = {};
        let lastActive: Record<string, string | null> = {};

        if (userIds.length > 0) {
          const [tripData, aiData, lastSeenData, lastEventData, inviteRedemptions] = await Promise.all([
            db.from("trip_members").select("user_id").in("user_id", userIds),
            db.from("analytics_events").select("user_id").like("event_name", "ai_%").in("user_id", userIds),
            // Latest trip_last_seen per user
            db.from("trip_last_seen").select("user_id, last_seen_at").in("user_id", userIds).order("last_seen_at", { ascending: false }),
            // Latest analytics event per user
            db.from("analytics_events").select("user_id, created_at").in("user_id", userIds).order("created_at", { ascending: false }),
            // Invite redemptions to determine source
            db.from("invite_redemptions").select("user_id").in("user_id", userIds),
          ]);
          (tripData.data || []).forEach((r: any) => { tripCounts[r.user_id] = (tripCounts[r.user_id] || 0) + 1; });
          (aiData.data || []).forEach((r: any) => { aiCounts[r.user_id] = (aiCounts[r.user_id] || 0) + 1; });

          // Compute last active = max(last_seen_at, latest analytics event)
          const seenMap: Record<string, string> = {};
          (lastSeenData.data || []).forEach((r: any) => {
            if (!seenMap[r.user_id] || r.last_seen_at > seenMap[r.user_id]) seenMap[r.user_id] = r.last_seen_at;
          });
          const eventMap: Record<string, string> = {};
          (lastEventData.data || []).forEach((r: any) => {
            if (r.user_id && (!eventMap[r.user_id] || r.created_at > eventMap[r.user_id])) eventMap[r.user_id] = r.created_at;
          });
          for (const uid of userIds) {
            const seen = seenMap[uid] || null;
            const ev = eventMap[uid] || null;
            if (seen && ev) lastActive[uid] = seen > ev ? seen : ev;
            else lastActive[uid] = seen || ev || null;
          }
        }

        // Get referrer names
        const referrerIds = [...new Set((data || []).map((u: any) => u.referred_by).filter(Boolean))];
        let referrerNames: Record<string, string> = {};
        if (referrerIds.length > 0) {
          const { data: refs } = await db.from("profiles").select("id, display_name").in("id", referrerIds);
          (refs || []).forEach((r: any) => { referrerNames[r.id] = r.display_name; });
        }

        const users = (data || []).map((u: any) => ({
          ...u,
          trips: tripCounts[u.id] || 0,
          ai_calls: aiCounts[u.id] || 0,
          last_active_at: lastActive[u.id] || null,
          referrer_name: u.referred_by ? referrerNames[u.referred_by] || null : null,
        }));

        // Sort by trips or AI if requested
        if (sort === "trips") users.sort((a: any, b: any) => b.trips - a.trips);
        if (sort === "ai") users.sort((a: any, b: any) => b.ai_calls - a.ai_calls);
        if (sort === "last_active") users.sort((a: any, b: any) => {
          const aTime = a.last_active_at ? new Date(a.last_active_at).getTime() : 0;
          const bTime = b.last_active_at ? new Date(b.last_active_at).getTime() : 0;
          return bTime - aTime;
        });

        return json({ users, total: count });
      }

      case "user_detail": {
        const { user_id } = params;
        if (!user_id) return err("user_id required");

        const [profile, trips, aiEvents, feedbackData, referrals, authUser,
               expensesData, expenseAmounts, pollsCreated, pollVotes,
               itineraryItems, pushSubs] = await Promise.all([
          db.from("profiles").select("*").eq("id", user_id).single(),
          db.from("trip_members").select("trip_id, role, joined_at").eq("user_id", user_id),
          db.from("analytics_events").select("event_name").like("event_name", "ai_%").eq("user_id", user_id),
          db.from("feedback").select("id", { count: "exact", head: true }).eq("user_id", user_id),
          db.from("profiles").select("id, display_name", { count: "exact" }).eq("referred_by", user_id),
          db.auth.admin.getUserById(user_id),
          // Activity: expenses
          db.from("expenses").select("id", { count: "exact", head: true }).eq("payer_id", user_id),
          db.from("expenses").select("amount, currency").eq("payer_id", user_id),
          // Activity: polls created (via analytics or direct)
          db.from("analytics_events").select("id", { count: "exact", head: true }).eq("event_name", "poll_created").eq("user_id", user_id),
          // Activity: poll votes
          db.from("votes").select("id", { count: "exact", head: true }).eq("user_id", user_id),
          // Activity: itinerary items
          db.from("itinerary_items").select("id", { count: "exact", head: true }).eq("created_by", user_id),
          // Engagement: push subscriptions
          db.from("push_subscriptions").select("id, device_name", { count: "exact" }).eq("user_id", user_id),
        ]);

        // Get trip details including dates
        const tripIds = (trips.data || []).map((t: any) => t.trip_id);
        let tripDetails: any[] = [];
        let memberCounts: Record<string, number> = {};
        if (tripIds.length > 0) {
          const [td, mc] = await Promise.all([
            db.from("trips").select("id, name, created_at, tentative_start_date, tentative_end_date").in("id", tripIds),
            db.from("trip_members").select("trip_id").in("trip_id", tripIds),
          ]);
          tripDetails = td.data || [];
          (mc.data || []).forEach((r: any) => { memberCounts[r.trip_id] = (memberCounts[r.trip_id] || 0) + 1; });
        }

        const tripMap = Object.fromEntries(tripDetails.map((t: any) => [t.id, t]));

        const aiCounts: Record<string, number> = {};
        (aiEvents.data || []).forEach((r: any) => {
          aiCounts[r.event_name] = (aiCounts[r.event_name] || 0) + 1;
        });

        // Get referrer name
        let referrerName = null;
        if (profile.data?.referred_by) {
          const { data: ref } = await db.from("profiles").select("display_name").eq("id", profile.data.referred_by).single();
          referrerName = ref?.display_name;
        }

        // Find the most recent trip the user owns/created
        const ownedTrips = (trips.data || []).filter((t: any) => t.role === "owner");
        const lastTripCreated = ownedTrips.length > 0
          ? ownedTrips.reduce((latest: any, t: any) => {
              const tripInfo = tripMap[t.trip_id];
              if (!tripInfo?.created_at) return latest;
              return !latest || tripInfo.created_at > latest ? tripInfo.created_at : latest;
            }, null)
          : null;

        const au = authUser?.data?.user;

        // Auth provider
        const authProvider = au?.app_metadata?.provider || au?.identities?.[0]?.provider || "email";

        // Compute last active for this user
        const [lastSeenDetail, lastEventDetail] = await Promise.all([
          db.from("trip_last_seen").select("last_seen_at").eq("user_id", user_id).order("last_seen_at", { ascending: false }).limit(1),
          db.from("analytics_events").select("created_at").eq("user_id", user_id).order("created_at", { ascending: false }).limit(1),
        ]);
        const lastSeen = lastSeenDetail.data?.[0]?.last_seen_at || null;
        const lastEvent = lastEventDetail.data?.[0]?.created_at || null;
        let lastActiveAt = null;
        if (lastSeen && lastEvent) lastActiveAt = lastSeen > lastEvent ? lastSeen : lastEvent;
        else lastActiveAt = lastSeen || lastEvent || null;

        // Calculate total amount spent (EUR approximation)
        const totalSpent = (expenseAmounts.data || []).reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);

        // Engagement calculations
        const daysSinceLastActive = lastActiveAt ? Math.floor((Date.now() - new Date(lastActiveAt).getTime()) / 86400000) : null;
        const daysSinceSignup = profile.data?.created_at ? Math.floor((Date.now() - new Date(profile.data.created_at).getTime()) / 86400000) : null;

        return json({
          profile: profile.data,
          email: au?.email || null,
          auth_provider: authProvider,
          last_sign_in_at: au?.last_sign_in_at || null,
          last_active_at: lastActiveAt,
          email_confirmed_at: au?.email_confirmed_at || null,
          last_trip_created_at: lastTripCreated,
          referrer_name: referrerName,
          referral_count: referrals.count || 0,
          activity: {
            expenses_created: expensesData.count || 0,
            total_amount_spent: totalSpent,
            polls_created: pollsCreated.count || 0,
            poll_votes: pollVotes.count || 0,
            itinerary_items: itineraryItems.count || 0,
          },
          engagement: {
            push_subscribed: (pushSubs.count || 0) > 0,
            push_device_count: pushSubs.count || 0,
            days_since_last_active: daysSinceLastActive,
            days_since_signup: daysSinceSignup,
          },
          trips: (trips.data || []).map((t: any) => ({
            ...t,
            trip_name: tripMap[t.trip_id]?.name || "Unknown",
            trip_created_at: tripMap[t.trip_id]?.created_at || null,
            trip_start_date: tripMap[t.trip_id]?.tentative_start_date || null,
            trip_end_date: tripMap[t.trip_id]?.tentative_end_date || null,
            member_count: memberCounts[t.trip_id] || 0,
          })),
          ai_usage: aiCounts,
          feedback_count: feedbackData.count || 0,
        });
      }

      case "retention_activation": {
        const [totalUsers, usersWithTrips, usersWithExpenses, usersWithItinerary] = await Promise.all([
          db.from("profiles").select("id", { count: "exact", head: true }),
          db.from("trip_members").select("user_id"),
          db.from("expenses").select("payer_id"),
          db.from("itinerary_items").select("created_by"),
        ]);

        const uniqueTripUsers = new Set((usersWithTrips.data || []).map((r: any) => r.user_id)).size;
        const uniqueExpenseUsers = new Set((usersWithExpenses.data || []).map((r: any) => r.payer_id)).size;
        const uniqueItineraryUsers = new Set((usersWithItinerary.data || []).map((r: any) => r.created_by)).size;
        const total = totalUsers.count || 1;

        return json({
          total_users: total,
          users_with_trips: uniqueTripUsers,
          users_with_expenses: uniqueExpenseUsers,
          users_with_itinerary: uniqueItineraryUsers,
          trip_rate: ((uniqueTripUsers / total) * 100).toFixed(1),
          expense_rate: ((uniqueExpenseUsers / total) * 100).toFixed(1),
          itinerary_rate: ((uniqueItineraryUsers / total) * 100).toFixed(1),
        });
      }

      case "retention_cohorts": {
        const { data: profiles } = await db.from("profiles").select("id, created_at").order("created_at", { ascending: true });
        const { data: tripMembers } = await db.from("trip_members").select("user_id, joined_at");

        const tripMap: Record<string, string> = {};
        (tripMembers || []).forEach((r: any) => {
          if (!tripMap[r.user_id] || r.joined_at < tripMap[r.user_id]) {
            tripMap[r.user_id] = r.joined_at;
          }
        });

        const weekStart = (d: string) => {
          const date = new Date(d);
          date.setDate(date.getDate() - date.getDay());
          return date.toISOString().substring(0, 10);
        };

        const cohorts: Record<string, { size: number; activated: number }> = {};
        (profiles || []).forEach((p: any) => {
          const week = weekStart(p.created_at);
          if (!cohorts[week]) cohorts[week] = { size: 0, activated: 0 };
          cohorts[week].size++;
          const firstTrip = tripMap[p.id];
          if (firstTrip) {
            const daysDiff = (new Date(firstTrip).getTime() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24);
            if (daysDiff <= 7) cohorts[week].activated++;
          }
        });

        const sorted = Object.entries(cohorts).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8);
        return json(sorted.map(([week, data]) => ({
          week,
          size: data.size,
          activated: data.activated,
          rate: data.size > 0 ? ((data.activated / data.size) * 100).toFixed(1) : "0",
        })));
      }

      case "retention_dormant": {
        const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const { data: oldUsers } = await db.from("profiles")
          .select("id, display_name, created_at")
          .filter("created_at", "lt", fourteenDaysAgo);

        const { data: memberUsers } = await db.from("trip_members").select("user_id");
        const memberSet = new Set((memberUsers || []).map((r: any) => r.user_id));

        const dormant = (oldUsers || []).filter((u: any) => !memberSet.has(u.id)).map((u: any) => ({
          ...u,
          days_since_signup: Math.floor((Date.now() - new Date(u.created_at).getTime()) / (1000 * 60 * 60 * 24)),
        }));

        return json({ count: dormant.length, users: dormant.slice(0, 50) });
      }

      case "referral_leaderboard": {
        const { data: profiles } = await db.from("profiles")
          .select("id, display_name, referral_code, referred_by");

        const referralCounts: Record<string, number> = {};
        (profiles || []).forEach((p: any) => {
          if (p.referred_by) {
            referralCounts[p.referred_by] = (referralCounts[p.referred_by] || 0) + 1;
          }
        });

        // Get trip creation for referred users
        const { data: tripMembers } = await db.from("trip_members").select("user_id");
        const tripUserSet = new Set((tripMembers || []).map((r: any) => r.user_id));

        const referredByMap: Record<string, string[]> = {};
        (profiles || []).forEach((p: any) => {
          if (p.referred_by) {
            if (!referredByMap[p.referred_by]) referredByMap[p.referred_by] = [];
            referredByMap[p.referred_by].push(p.id);
          }
        });

        const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p]));

        const leaderboard = Object.entries(referralCounts)
          .map(([userId, count]) => {
            const referred = referredByMap[userId] || [];
            const converted = referred.filter((id) => tripUserSet.has(id)).length;
            return {
              user_id: userId,
              display_name: profileMap[userId]?.display_name || "Unknown",
              referral_code: profileMap[userId]?.referral_code || "",
              referred_count: count,
              conversion_pct: count > 0 ? ((converted / count) * 100).toFixed(1) : "0",
            };
          })
          .sort((a, b) => b.referred_count - a.referred_count)
          .slice(0, 20);

        return json(leaderboard);
      }

      case "referral_chain": {
        const { data: profiles } = await db.from("profiles")
          .select("id, display_name, created_at, referred_by")
          .not("referred_by", "is", null);

        const referrerIds = [...new Set((profiles || []).map((p: any) => p.referred_by))];
        let referrerNames: Record<string, string> = {};
        if (referrerIds.length > 0) {
          const { data: refs } = await db.from("profiles").select("id, display_name").in("id", referrerIds);
          (refs || []).forEach((r: any) => { referrerNames[r.id] = r.display_name; });
        }

        const { data: tripMembers } = await db.from("trip_members").select("user_id, joined_at");
        const firstTripMap: Record<string, string> = {};
        (tripMembers || []).forEach((r: any) => {
          if (!firstTripMap[r.user_id] || r.joined_at < firstTripMap[r.user_id]) {
            firstTripMap[r.user_id] = r.joined_at;
          }
        });

        const chain = (profiles || []).map((p: any) => {
          const firstTrip = firstTripMap[p.id];
          const daysToTrip = firstTrip
            ? Math.floor((new Date(firstTrip).getTime() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24))
            : null;
          return {
            display_name: p.display_name,
            created_at: p.created_at,
            referred_by_name: referrerNames[p.referred_by] || "Unknown",
            days_to_first_trip: daysToTrip,
          };
        });

        return json(chain);
      }

      case "dau_chart": {
        const p = period || "30d";
        const pd = periodDate(p);
        const [expenses, items, fb, analytics] = await Promise.all([
          db.from("expenses").select("payer_id, created_at").filter("created_at", "gt", pd),
          db.from("itinerary_items").select("created_by, created_at").filter("created_at", "gt", pd),
          db.from("feedback").select("user_id, created_at").filter("created_at", "gt", pd),
          db.from("analytics_events").select("user_id, created_at").filter("created_at", "gt", pd),
        ]);

        const allData = [
          ...(expenses.data || []).map((r: any) => ({ user: r.payer_id, created_at: r.created_at })),
          ...(items.data || []).map((r: any) => ({ user: r.created_by, created_at: r.created_at })),
          ...(fb.data || []).map((r: any) => ({ user: r.user_id, created_at: r.created_at })),
          ...(analytics.data || []).map((r: any) => ({ user: r.user_id, created_at: r.created_at })),
        ];

        const daily: Record<string, Set<string>> = {};
        allData.forEach((r) => {
          if (!r.user || !r.created_at) return;
          const day = r.created_at.substring(0, 10);
          if (!daily[day]) daily[day] = new Set();
          daily[day].add(r.user);
        });

        return json(
          Object.entries(daily)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, users]) => ({ date, dau: users.size }))
        );
      }

      case "engagement_dau_wau_mau": {
        const now = new Date();
        const today = now.toISOString().substring(0, 10);
        const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
        const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

        const [expenses, items, fb] = await Promise.all([
          db.from("expenses").select("payer_id, created_at").filter("created_at", "gt", monthAgo),
          db.from("itinerary_items").select("created_by, created_at").filter("created_at", "gt", monthAgo),
          db.from("feedback").select("user_id, created_at").filter("created_at", "gt", monthAgo),
        ]);

        const getUnique = (data: any[], field: string, after: string) => {
          return new Set(data.filter((r: any) => r.created_at > after).map((r: any) => r[field]).filter(Boolean));
        };

        const allData = [
          ...(expenses.data || []).map((r: any) => ({ user: r.payer_id, created_at: r.created_at })),
          ...(items.data || []).map((r: any) => ({ user: r.created_by, created_at: r.created_at })),
          ...(fb.data || []).map((r: any) => ({ user: r.user_id, created_at: r.created_at })),
        ];

        const dauSet = new Set(allData.filter((r) => r.created_at.substring(0, 10) === today).map((r) => r.user).filter(Boolean));
        const wauSet = new Set(allData.filter((r) => r.created_at > weekAgo).map((r) => r.user).filter(Boolean));
        const mauSet = new Set(allData.filter((r) => r.created_at > monthAgo).map((r) => r.user).filter(Boolean));

        return json({
          dau: dauSet.size,
          wau: wauSet.size,
          mau: mauSet.size,
          stickiness: mauSet.size > 0 ? ((dauSet.size / mauSet.size) * 100).toFixed(1) : "0",
        });
      }

      case "engagement_activity_chart": {
        const p = period || "30d";
        const pd = periodDate(p);
        const [expenses, items, fb] = await Promise.all([
          db.from("expenses").select("created_at").filter("created_at", "gt", pd),
          db.from("itinerary_items").select("created_at").filter("created_at", "gt", pd),
          db.from("feedback").select("created_at").filter("created_at", "gt", pd),
        ]);

        const daily: Record<string, { expenses: number; itinerary: number; feedback: number }> = {};
        const add = (data: any[], key: string) => {
          (data || []).forEach((r: any) => {
            const day = r.created_at.substring(0, 10);
            if (!daily[day]) daily[day] = { expenses: 0, itinerary: 0, feedback: 0 };
            (daily[day] as any)[key]++;
          });
        };
        add(expenses.data || [], "expenses");
        add(items.data || [], "itinerary");
        add(fb.data || [], "feedback");

        return json(Object.entries(daily).sort().map(([date, d]) => ({ date, ...d })));
      }

      case "engagement_top_trips": {
        const p = period || "30d";
        const pd = periodDate(p);
        const [expenses, items] = await Promise.all([
          db.from("expenses").select("trip_id").filter("created_at", "gt", pd),
          db.from("itinerary_items").select("trip_id").filter("created_at", "gt", pd),
        ]);

        const tripCounts: Record<string, { expenses: number; itinerary: number }> = {};
        (expenses.data || []).forEach((r: any) => {
          if (!tripCounts[r.trip_id]) tripCounts[r.trip_id] = { expenses: 0, itinerary: 0 };
          tripCounts[r.trip_id].expenses++;
        });
        (items.data || []).forEach((r: any) => {
          if (!tripCounts[r.trip_id]) tripCounts[r.trip_id] = { expenses: 0, itinerary: 0 };
          tripCounts[r.trip_id].itinerary++;
        });

        const topTripIds = Object.entries(tripCounts)
          .sort((a, b) => (b[1].expenses + b[1].itinerary) - (a[1].expenses + a[1].itinerary))
          .slice(0, 10)
          .map(([id]) => id);

        let tripDetails: any[] = [];
        let memberCounts: Record<string, number> = {};
        if (topTripIds.length > 0) {
          const [td, mc] = await Promise.all([
            db.from("trips").select("id, name, destination").in("id", topTripIds),
            db.from("trip_members").select("trip_id").in("trip_id", topTripIds),
          ]);
          tripDetails = td.data || [];
          (mc.data || []).forEach((r: any) => { memberCounts[r.trip_id] = (memberCounts[r.trip_id] || 0) + 1; });
        }

        const tripMap = Object.fromEntries(tripDetails.map((t: any) => [t.id, t]));

        return json(topTripIds.map((id) => ({
          trip_id: id,
          name: tripMap[id]?.name || "Unknown",
          destination: tripMap[id]?.destination || null,
          members: memberCounts[id] || 0,
          expenses: tripCounts[id].expenses,
          itinerary: tripCounts[id].itinerary,
        })));
      }

      case "engagement_distribution": {
        const { data: profiles } = await db.from("profiles").select("id");
        const { data: tripMembers } = await db.from("trip_members").select("user_id");

        const tripCounts: Record<string, number> = {};
        (tripMembers || []).forEach((r: any) => {
          tripCounts[r.user_id] = (tripCounts[r.user_id] || 0) + 1;
        });

        const buckets = { "0": 0, "1": 0, "2-3": 0, "4+": 0 };
        (profiles || []).forEach((p: any) => {
          const c = tripCounts[p.id] || 0;
          if (c === 0) buckets["0"]++;
          else if (c === 1) buckets["1"]++;
          else if (c <= 3) buckets["2-3"]++;
          else buckets["4+"]++;
        });

        return json(Object.entries(buckets).map(([bucket, count]) => ({ bucket, count })));
      }

      case "feature_adoption": {
        const p = period || "all";
        let tripsQuery = db.from("trips").select("id, enabled_modules, vibe_board_active, route_locked");
        if (p !== "all") {
          tripsQuery = tripsQuery.filter("created_at", "gt", periodDate(p));
        }
        const { data: trips } = await tripsQuery;
        const totalTrips = (trips || []).length;
        if (totalTrips === 0) return json({ total: 0, features: [] });

        const tripIds = (trips || []).map((t: any) => t.id);

        const [expenseTrips, itemTrips, pollTrips, memberData] = await Promise.all([
          db.from("expenses").select("trip_id").in("trip_id", tripIds),
          db.from("itinerary_items").select("trip_id").in("trip_id", tripIds),
          db.from("polls").select("trip_id").in("trip_id", tripIds),
          db.from("trip_members").select("trip_id").in("trip_id", tripIds),
        ]);

        const uniqueTrips = (data: any[]) => new Set(data.map((r: any) => r.trip_id)).size;
        const memberCountByTrip: Record<string, number> = {};
        (memberData.data || []).forEach((r: any) => {
          memberCountByTrip[r.trip_id] = (memberCountByTrip[r.trip_id] || 0) + 1;
        });
        const tripsWithMultiMembers = Object.values(memberCountByTrip).filter((c) => c > 2).length;

        const vibeActive = (trips || []).filter((t: any) => t.vibe_board_active).length;
        const routeLocked = (trips || []).filter((t: any) => t.route_locked).length;

        const features = [
          { name: "Expense logged", count: uniqueTrips(expenseTrips.data || []), total: totalTrips },
          { name: "Itinerary item", count: uniqueTrips(itemTrips.data || []), total: totalTrips },
          { name: "Decision/poll", count: uniqueTrips(pollTrips.data || []), total: totalTrips },
          { name: "Vibe board active", count: vibeActive, total: totalTrips },
          { name: "Route locked", count: routeLocked, total: totalTrips },
          { name: "3+ members", count: tripsWithMultiMembers, total: totalTrips },
        ];

        // Module adoption
        const moduleCounts: Record<string, number> = {};
        (trips || []).forEach((t: any) => {
          const mods = t.enabled_modules || {};
          Object.entries(mods).forEach(([mod, enabled]) => {
            if (enabled) moduleCounts[mod] = (moduleCounts[mod] || 0) + 1;
          });
        });

        return json({
          total: totalTrips,
          features: features.map((f) => ({ ...f, pct: ((f.count / f.total) * 100).toFixed(1) })),
          modules: Object.entries(moduleCounts).map(([name, count]) => ({
            name, count, pct: ((count / totalTrips) * 100).toFixed(1),
          })),
        });
      }

      case "feedback_list": {
        const { status_filter, category_filter, severity_filter, filter: legacyFilter } = params;
        let query = db.from("feedback").select("*").order("created_at", { ascending: false }).limit(200);

        // New multi-filter approach
        const sf = status_filter || legacyFilter || "all";
        if (sf === "unresolved") {
          query = query.or("status.is.null,status.neq.done");
        } else if (sf === "new") {
          query = query.or("status.is.null,status.eq.new");
        } else if (sf === "reviewing") {
          query = query.eq("status", "reviewing");
        } else if (sf === "done") {
          query = query.eq("status", "done");
        } else if (sf === "dismissed") {
          query = query.eq("status", "dismissed");
        }
        // Legacy filter compat
        else if (sf === "critical") {
          query = query.eq("ai_severity", "critical");
        } else if (sf === "high") {
          query = query.eq("ai_severity", "high");
        }

        if (category_filter && category_filter !== "all") {
          query = query.eq("ai_category", category_filter);
        }

        if (severity_filter && severity_filter !== "all") {
          query = query.eq("ai_severity", severity_filter);
        }

        const { data } = await query;

        // Resolve user names
        const userIds = [...new Set((data || []).map((f: any) => f.user_id).filter(Boolean))];
        let userNames: Record<string, string> = {};
        if (userIds.length > 0) {
          const { data: profiles } = await db.from("profiles").select("id, display_name").in("id", userIds);
          (profiles || []).forEach((p: any) => { userNames[p.id] = p.display_name; });
        }

        return json((data || []).map((f: any) => ({ ...f, display_name: userNames[f.user_id] || "Unknown" })));
      }

      case "feedback_update": {
        const { feedback_id, status, admin_notes } = params;
        if (!feedback_id) return err("feedback_id required");
        const updates: any = {};
        if (status !== undefined) updates.status = status;
        if (admin_notes !== undefined) updates.admin_notes = admin_notes;
        const { error } = await db.from("feedback").update(updates).eq("id", feedback_id);
        if (error) return err(error.message);
        return json({ success: true });
      }

      case "feedback_reanalyze": {
        const { feedback_id } = params;
        if (!feedback_id) return err("feedback_id required");

        const { data: fb, error: fbErr } = await db
          .from("feedback")
          .select("id, body, category, route")
          .eq("id", feedback_id)
          .single();
        if (fbErr || !fb) return err("Feedback not found");

        // Call analyze-feedback edge function with service role
        const fnUrl = `${supabaseUrl}/functions/v1/analyze-feedback`;
        const res = await fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": Deno.env.get("SUPABASE_ANON_KEY")!,
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            feedbackId: fb.id,
            category: fb.category || "general",
            message: fb.body || "",
            route: fb.route || "",
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error("Re-analyze failed:", res.status, errText);
          return err(`Re-analyze failed: ${res.status}`);
        }

        return json({ success: true });
      }

      case "feedback_delete": {
        const { feedback_id } = params;
        if (!feedback_id) return err("feedback_id required");
        const { error } = await db.from("feedback").delete().eq("id", feedback_id);
        if (error) return err(error.message);
        return json({ success: true });
      }


      case "profile_update_notes": {
        const { user_id, admin_notes } = params;
        if (!user_id) return err("user_id required");
        const { error } = await db.from("profiles").update({ admin_notes }).eq("id", user_id);
        if (error) return err(error.message);
        return json({ success: true });
      }

      case "system_status": {
        const [exchangeRate, unresolvedFb, criticalFb, recentSignups, priorSignups, aiToday, aiWeekly] = await Promise.all([
          db.from("exchange_rate_cache").select("fetched_at").eq("base_currency", "EUR").maybeSingle(),
          db.from("feedback").select("id", { count: "exact", head: true }).or("status.is.null,status.neq.done"),
          db.from("feedback").select("id, body, ai_summary, created_at").eq("ai_severity", "critical").or("status.is.null,status.neq.done"),
          db.from("profiles").select("id", { count: "exact", head: true }).filter("created_at", "gt", new Date(Date.now() - 7 * 86400000).toISOString()),
          db.from("profiles").select("id", { count: "exact", head: true })
            .filter("created_at", "gt", new Date(Date.now() - 14 * 86400000).toISOString())
            .filter("created_at", "lte", new Date(Date.now() - 7 * 86400000).toISOString()),
          db.from("analytics_events").select("id", { count: "exact", head: true })
            .like("event_name", "ai_%")
            .filter("created_at", "gt", new Date().toISOString().substring(0, 10)),
          db.from("analytics_events").select("id", { count: "exact", head: true })
            .like("event_name", "ai_%")
            .filter("created_at", "gt", new Date(Date.now() - 7 * 86400000).toISOString()),
        ]);

        const fetchedAt = exchangeRate.data?.fetched_at;
        const hoursAgo = fetchedAt ? (Date.now() - new Date(fetchedAt).getTime()) / 3600000 : null;

        const dormantQuery = await db.from("profiles").select("id").filter("created_at", "lt", new Date(Date.now() - 14 * 86400000).toISOString());
        const { data: memberUsers } = await db.from("trip_members").select("user_id");
        const memberSet = new Set((memberUsers || []).map((r: any) => r.user_id));
        const dormantCount = (dormantQuery.data || []).filter((u: any) => !memberSet.has(u.id)).length;

        return json({
          exchange_rate: {
            fetched_at: fetchedAt,
            hours_ago: hoursAgo ? Math.round(hoursAgo) : null,
            status: hoursAgo === null ? "critical" : hoursAgo < 25 ? "fresh" : hoursAgo < 48 ? "stale" : "critical",
          },
          feedback_backlog: unresolvedFb.count || 0,
          critical_feedback: (criticalFb.data || []),
          growth_momentum: {
            recent: recentSignups.count || 0,
            prior: priorSignups.count || 0,
            pct: (priorSignups.count || 0) > 0
              ? ((((recentSignups.count || 0) - (priorSignups.count || 0)) / (priorSignups.count || 1)) * 100).toFixed(1)
              : "0",
          },
          ai_anomaly: {
            today: aiToday.count || 0,
            weekly_avg: Math.round((aiWeekly.count || 0) / 7),
            is_anomaly: (aiToday.count || 0) > ((aiWeekly.count || 0) / 7) * 3,
          },
          dormant_users: dormantCount,
        });
      }

      case "weekly_digest": {
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();

        const [
          newUsers, priorUsers, newTrips,
          expenses, items, fb,
          aiEvents, landingViews, referralShares, invitesSent,
          exchangeRate
        ] = await Promise.all([
          db.from("profiles").select("id, referred_by", { count: "exact" }).filter("created_at", "gt", weekAgo),
          db.from("profiles").select("id", { count: "exact", head: true }).filter("created_at", "gt", twoWeeksAgo).filter("created_at", "lte", weekAgo),
          db.from("trips").select("id", { count: "exact", head: true }).filter("created_at", "gt", weekAgo),
          db.from("expenses").select("id", { count: "exact", head: true }).filter("created_at", "gt", weekAgo),
          db.from("itinerary_items").select("id", { count: "exact", head: true }).filter("created_at", "gt", weekAgo),
          db.from("feedback").select("ai_severity, status", { count: "exact" }).filter("created_at", "gt", weekAgo),
          db.from("analytics_events").select("event_name").like("event_name", "ai_%").filter("created_at", "gt", weekAgo),
          db.from("analytics_events").select("id, properties").eq("event_name", "landing_page_view").filter("created_at", "gt", weekAgo),
          db.from("analytics_events").select("id", { count: "exact", head: true }).eq("event_name", "referral_link_shared").filter("created_at", "gt", weekAgo),
          db.from("analytics_events").select("id", { count: "exact", head: true }).eq("event_name", "trip_invite_sent").filter("created_at", "gt", weekAgo),
          db.from("exchange_rate_cache").select("fetched_at").eq("base_currency", "EUR").maybeSingle(),
        ]);

        // New users with trips
        const { data: tripMembers } = await db.from("trip_members").select("user_id").filter("joined_at", "gt", weekAgo);
        const newUserIds = new Set((newUsers.data || []).map((u: any) => u.id));
        const activatedCount = (tripMembers || []).filter((r: any) => newUserIds.has(r.user_id)).length;

        // AI counts
        const aiCounts: Record<string, number> = {};
        (aiEvents.data || []).forEach((r: any) => {
          aiCounts[r.event_name] = (aiCounts[r.event_name] || 0) + 1;
        });
        const totalAI = Object.values(aiCounts).reduce((a, b) => a + b, 0);
        const aiCost = (totalAI * 500 * 3 / 1000000).toFixed(2); // rough avg 500 tokens

        // Feedback breakdown
        const fbData = fb.data || [];
        const criticalFb = fbData.filter((f: any) => f.ai_severity === "critical");
        const highFb = fbData.filter((f: any) => f.ai_severity === "high");
        const unresolvedCritical = criticalFb.filter((f: any) => f.status !== "resolved");

        // UTM top source
        const utmSources: Record<string, number> = {};
        (landingViews.data || []).forEach((r: any) => {
          const src = (r.properties as any)?.utm_source || "direct";
          utmSources[src] = (utmSources[src] || 0) + 1;
        });
        const topUtm = Object.entries(utmSources).sort((a, b) => b[1] - a[1])[0];

        const fetchedAt = exchangeRate.data?.fetched_at;
        const hoursAgo = fetchedAt ? Math.round((Date.now() - new Date(fetchedAt).getTime()) / 3600000) : null;

        return json({
          growth: {
            new_users: newUsers.count || 0,
            prior_users: priorUsers.count || 0,
            pct_change: (priorUsers.count || 0) > 0
              ? ((((newUsers.count || 0) - (priorUsers.count || 0)) / (priorUsers.count || 1)) * 100).toFixed(1)
              : "0",
            organic: (newUsers.data || []).filter((u: any) => !u.referred_by).length,
            referred: (newUsers.data || []).filter((u: any) => u.referred_by).length,
          },
          activation: {
            new_users: newUsers.count || 0,
            activated: activatedCount,
            rate: (newUsers.count || 0) > 0 ? ((activatedCount / (newUsers.count || 1)) * 100).toFixed(1) : "0",
          },
          engagement: {
            expenses: expenses.count || 0,
            itinerary_items: items.count || 0,
          },
          ai: {
            total: totalAI,
            by_feature: aiCounts,
            estimated_cost: aiCost,
          },
          acquisition: {
            landing_views: landingViews.count || (landingViews.data || []).length,
            referral_shares: referralShares.count || 0,
            invites_sent: invitesSent.count || 0,
            top_utm: topUtm ? { source: topUtm[0], count: topUtm[1] } : null,
          },
          feedback: {
            total: fb.count || fbData.length,
            critical: criticalFb.length,
            high: highFb.length,
            unresolved_critical: unresolvedCritical.length,
          },
          health: {
            exchange_rate_hours: hoursAgo,
            exchange_rate_status: hoursAgo === null ? "critical" : hoursAgo < 25 ? "fresh" : hoursAgo < 48 ? "stale" : "critical",
          },
        });
      }

      case "error_overview": {
        const now24 = new Date(Date.now() - 24 * 3600000).toISOString();
        const now48 = new Date(Date.now() - 48 * 3600000).toISOString();

        const [total24, critical24, total_prior] = await Promise.all([
          db.from("analytics_events").select("id", { count: "exact", head: true })
            .eq("event_name", "app_error").filter("created_at", "gt", now24),
          db.from("analytics_events").select("id", { count: "exact", head: true })
            .eq("event_name", "app_error")
            .filter("created_at", "gt", now24)
            .eq("properties->>severity", "critical"),
          db.from("analytics_events").select("id", { count: "exact", head: true })
            .eq("event_name", "app_error")
            .filter("created_at", "gt", now48)
            .filter("created_at", "lte", now24),
        ]);

        const cur = total24.count || 0;
        const prev = total_prior.count || 0;
        const trendPct = prev > 0 ? (((cur - prev) / prev) * 100).toFixed(1) : cur > 0 ? "100" : "0";

        return json({
          errors_24h: cur,
          critical_24h: critical24.count || 0,
          prior_24h: prev,
          trend_pct: trendPct,
        });
      }

      case "error_chart": {
        const chartPeriod = params.chart_period || "24h";
        const since = chartPeriod === "24h"
          ? new Date(Date.now() - 24 * 3600000).toISOString()
          : new Date(Date.now() - 30 * 86400000).toISOString();

        const { data } = await db.from("analytics_events")
          .select("created_at, properties")
          .eq("event_name", "app_error")
          .filter("created_at", "gt", since)
          .order("created_at", { ascending: true });

        const buckets: Record<string, { count: number; breakdown: Record<string, number> }> = {};

        (data || []).forEach((r: any) => {
          const dt = new Date(r.created_at);
          const label = chartPeriod === "24h"
            ? dt.toISOString().substring(0, 13) + ":00"
            : dt.toISOString().substring(0, 10);
          if (!buckets[label]) buckets[label] = { count: 0, breakdown: {} };
          buckets[label].count++;
          const errType = (r.properties as any)?.type || "unknown";
          buckets[label].breakdown[errType] = (buckets[label].breakdown[errType] || 0) + 1;
        });

        return json(Object.entries(buckets).sort().map(([label, v]) => ({ label, count: v.count, breakdown: v.breakdown })));
      }

      case "error_feed": {
        const { error_filter } = params;
        let query = db.from("analytics_events")
          .select("id, created_at, user_id, properties")
          .eq("event_name", "app_error")
          .order("created_at", { ascending: false })
          .limit(20);

        if (error_filter === "critical") {
          query = query.eq("properties->>severity", "critical");
        } else if (error_filter === "high") {
          query = query.eq("properties->>severity", "high");
        } else if (error_filter === "medium") {
          query = query.eq("properties->>severity", "medium");
        } else if (error_filter === "react_crash") {
          query = query.eq("properties->>type", "react_crash");
        } else if (error_filter === "query_error") {
          query = query.eq("properties->>type", "query_error");
        }

        const { data } = await query;

        const userIds = [...new Set((data || []).map((r: any) => r.user_id).filter(Boolean))];
        let userNames: Record<string, string> = {};
        if (userIds.length > 0) {
          const { data: profiles } = await db.from("profiles").select("id, display_name").in("id", userIds);
          (profiles || []).forEach((p: any) => { userNames[p.id] = p.display_name; });
        }

        return json((data || []).map((r: any) => ({
          id: r.id,
          created_at: r.created_at,
          user_id: r.user_id,
          display_name: r.user_id ? (userNames[r.user_id] || "Unknown") : "Anonymous",
          properties: r.properties,
        })));
      }

      case "notifications_list": {
        const { data } = await db.from("admin_notifications")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50);
        return json(data || []);
      }

      case "notifications_unread_count": {
        const { count } = await db.from("admin_notifications")
          .select("id", { count: "exact", head: true })
          .eq("read", false);
        return json({ count: count || 0 });
      }

      case "notifications_mark_read": {
        const { id } = params;
        if (!id) return err("id required");
        const { error: updateErr } = await db.from("admin_notifications")
          .update({ read: true, read_at: new Date().toISOString() })
          .eq("id", id);
        if (updateErr) return err(updateErr.message);
        return json({ success: true });
      }

      case "feedback_unread_count": {
        const { count } = await db.from("feedback")
          .select("id", { count: "exact", head: true })
          .is("read_at", null);
        return json({ count: count || 0 });
      }

      case "feedback_mark_read": {
        const { feedback_id } = params;
        if (!feedback_id) return err("feedback_id required");
        const { error } = await db.from("feedback")
          .update({ read_at: new Date().toISOString() })
          .eq("id", feedback_id)
          .is("read_at", null);
        if (error) return err(error.message);
        return json({ success: true });
      }

      case "notifications_mark_all_read": {
        const { error: updateErr } = await db.from("admin_notifications")
          .update({ read: true, read_at: new Date().toISOString() })
          .eq("read", false);
        if (updateErr) return err(updateErr.message);
        return json({ success: true });
      }

      default:
        return err(`Unknown query type: ${type}`);
    }
  } catch (e: any) {
    console.error("Admin query error:", e);
    return err(e.message || "Internal error", 500);
  }
});

function periodDate(p: string): string {
  const days = p === "24h" ? 1 : p === "7d" ? 7 : p === "30d" ? 30 : p === "90d" ? 90 : 0;
  if (days === 0) return "1970-01-01T00:00:00Z";
  return new Date(Date.now() - days * 86400000).toISOString();
}

function priorPeriodDate(p: string): string {
  const days = p === "7d" ? 14 : p === "30d" ? 60 : p === "90d" ? 180 : 0;
  if (days === 0) return "1970-01-01T00:00:00Z";
  return new Date(Date.now() - days * 86400000).toISOString();
}
