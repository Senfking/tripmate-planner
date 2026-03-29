import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MemberListSheet } from "./MemberListSheet";

interface TripOverviewHeroProps {
  tripId: string;
  routeLocked: boolean;
  startDate: string | null;
  endDate: string | null;
}

function getInitial(name: string | null | undefined) {
  return (name || "?").charAt(0).toUpperCase();
}

export function TripOverviewHero({ tripId, routeLocked, startDate, endDate }: TripOverviewHeroProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: stops } = useQuery({
    queryKey: ["trip-route-stops", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_route_stops")
        .select("*")
        .eq("trip_id", tripId)
        .order("start_date");
      if (error) throw error;
      return data;
    },
  });

  const { data: members } = useQuery({
    queryKey: ["trip-members-full", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_members")
        .select("user_id, role, joined_at")
        .eq("trip_id", tripId)
        .order("joined_at");
      if (error) throw error;

      // Fetch profiles for all members
      const userIds = data.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);
      return data.map((m) => ({
        ...m,
        profile: profileMap.get(m.user_id) as { display_name: string | null; avatar_url?: string | null } | undefined,
      }));
    },
  });

  // Status summary
  let statusLine: string;
  let statusSub: string | null = null;

  if (routeLocked && stops && stops.length > 0) {
    const first = stops[0];
    const last = stops[stops.length - 1];
    const days = Math.ceil(
      (new Date(last.end_date).getTime() - new Date(first.start_date).getTime()) / (1000 * 60 * 60 * 24)
    );
    statusLine = `🗺️ ${stops.length} stop${stops.length > 1 ? "s" : ""} · ${format(new Date(first.start_date), "MMM d")} – ${format(new Date(last.end_date), "MMM d, yyyy")}`;
    statusSub = `${days} day${days !== 1 ? "s" : ""}`;
  } else if (startDate || endDate) {
    const parts: string[] = [];
    if (startDate && endDate) {
      parts.push(`${format(new Date(startDate), "MMM d")} – ${format(new Date(endDate), "MMM d")}`);
    } else if (startDate) {
      parts.push(`From ${format(new Date(startDate), "MMM d")}`);
    } else {
      parts.push(`Until ${format(new Date(endDate!), "MMM d")}`);
    }
    parts.push("Planning in progress");
    statusLine = parts.join(" · ");
  } else {
    statusLine = "Dates TBD · Planning in progress";
  }

  const visibleMembers = members?.slice(0, 5) ?? [];
  const extraCount = (members?.length ?? 0) - 5;

  return (
    <>
      <div
        className="rounded-xl p-4 flex items-center gap-3"
        style={{
          background: "rgba(255, 255, 255, 0.7)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(255, 255, 255, 0.5)",
          boxShadow: "0 4px 24px rgba(13, 148, 136, 0.08)",
        }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{statusLine}</p>
          {statusSub && <p className="text-xs text-muted-foreground mt-0.5">{statusSub}</p>}
        </div>

        {/* Avatar group */}
        <button
          onClick={() => setSheetOpen(true)}
          className="flex items-center shrink-0 -space-x-2"
        >
          {visibleMembers.map((m) => (
            <Avatar key={m.user_id} className="h-8 w-8" style={{ border: "2px solid rgba(255,255,255,0.9)", boxShadow: "0 2px 8px rgba(0,0,0,0.1)", borderRadius: "9999px" }}>
              {m.profile?.avatar_url && (
                <AvatarImage src={m.profile.avatar_url} alt={m.profile?.display_name || ""} />
              )}
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                {getInitial(m.profile?.display_name)}
              </AvatarFallback>
            </Avatar>
          ))}
          {extraCount > 0 && (
            <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-muted text-xs font-medium text-muted-foreground">
              +{extraCount}
            </span>
          )}
        </button>
      </div>

      <MemberListSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        members={members ?? []}
      />
    </>
  );
}
