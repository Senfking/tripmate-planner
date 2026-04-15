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
    queryKey: ["members", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_members")
        .select("user_id, role, joined_at, attendance_status")
        .eq("trip_id", tripId)
        .order("joined_at");
      if (error) throw error;

      const userIds = data.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .rpc("get_public_profiles", { _user_ids: userIds });

      const profileMap = new Map(profiles?.map((p) => [p.id, { name: p.display_name || "Member", avatar: p.avatar_url }]) ?? []);
      return data.map((m) => ({
        userId: m.user_id,
        displayName: profileMap.get(m.user_id)?.name || "Member",
        avatarUrl: profileMap.get(m.user_id)?.avatar || null,
        role: m.role,
        joinedAt: m.joined_at,
        attendanceStatus: (m as any).attendance_status ?? "pending",
      }));
    },
  });

  // Status summary
  let statusLine: string;
  let statusAccent: string | null = null;

  if (routeLocked && stops && stops.length > 0) {
    const first = stops[0];
    const last = stops[stops.length - 1];
    statusLine = `${stops.length} stop${stops.length > 1 ? "s" : ""} · ${format(new Date(first.start_date), "MMM d")} – ${format(new Date(last.end_date), "MMM d")}`;
    const days = Math.ceil(
      (new Date(last.end_date).getTime() - new Date(first.start_date).getTime()) / (1000 * 60 * 60 * 24)
    );
    statusAccent = `${days} day${days !== 1 ? "s" : ""}`;
  } else if (startDate || endDate) {
    const parts: string[] = [];
    if (startDate && endDate) {
      parts.push(`${format(new Date(startDate), "MMM d")} – ${format(new Date(endDate), "MMM d")}`);
    } else if (startDate) {
      parts.push(`From ${format(new Date(startDate), "MMM d")}`);
    } else {
      parts.push(`Until ${format(new Date(endDate!), "MMM d")}`);
    }
    statusLine = parts.join(" · ");
    statusAccent = "Planning in progress";
  } else {
    statusLine = "Dates TBD";
    statusAccent = "Planning in progress";
  }

  const visibleMembers = members?.slice(0, 5) ?? [];
  const memberCount = members?.length ?? 0;

  return (
    <>
      <div
        className="rounded-2xl p-4 flex items-center gap-3 border-none shadow-md"
        style={{
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-medium" style={{ color: "#0F172A" }}>{statusLine}</p>
          {statusAccent && (
            <p className="text-[13px] mt-1 font-medium" style={{ color: "#0D9488" }}>
              {statusAccent}
            </p>
          )}
        </div>

        {/* Avatar group + member count */}
        <button
          onClick={() => setSheetOpen(true)}
          className="flex items-center gap-2 shrink-0"
        >
          <div className="flex items-center -space-x-2">
            {visibleMembers.map((m) => (
              <Avatar
                key={m.userId}
                className="h-8 w-8 ring-2 ring-white"
              >
                {m.avatarUrl && (
                  <AvatarImage src={m.avatarUrl} alt={m.displayName || ""} />
                )}
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                  {getInitial(m.displayName)}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
          {memberCount > 0 && (
            <span className="text-[12px] text-muted-foreground whitespace-nowrap">
              {memberCount} member{memberCount !== 1 ? "s" : ""}
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
