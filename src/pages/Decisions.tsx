import { useGlobalDecisions, type PendingItem } from "@/hooks/useGlobalDecisions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { CircleCheck, Vote, MapPin, CalendarDays, MessageSquare, ArrowRight, Plane } from "lucide-react";
import { TabHeroHeader, type HeroPill } from "@/components/ui/TabHeroHeader";
import { DesktopFooter } from "@/components/DesktopFooter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";

const typeConfig = {
  vibe: { label: "Vibe Board", icon: MessageSquare },
  destination: { label: "Destination vote", icon: MapPin },
  date: { label: "Date vote", icon: CalendarDays },
  poll: { label: "Preference poll", icon: Vote },
  attendance: { label: "RSVP", icon: Plane },
} as const;

function AttendanceCard({ item }: { item: PendingItem }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const updateAttendance = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase
        .from("trip_members")
        .update({ attendance_status: status } as any)
        .eq("trip_id", item.tripId)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: (_, status) => {
      qc.invalidateQueries({ queryKey: ["global-decisions"] });
      qc.invalidateQueries({ queryKey: ["my-trip-membership", item.tripId] });
      qc.invalidateQueries({ queryKey: ["trip-members-full", item.tripId] });
      if (status === "going") toast.success("You're in! 🎉");
      else toast.success("Marked as maybe");
    },
    onError: () => toast.error("Failed to update"),
  });

  const goingAvatars = item.goingAvatars ?? [];

  return (
    <div className="bg-white rounded-2xl border-l-4 border-[#0D9488] shadow-sm p-4">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
        <span>{item.tripEmoji ?? "✈️"}</span>
        <span className="truncate">{item.tripName}</span>
      </div>
      <p className="text-[16px] font-bold text-foreground">Are you going?</p>
      <p className="text-[13px] text-muted-foreground mt-0.5">
        {item.respondedCount
          ? `${item.respondedCount} member${item.respondedCount !== 1 ? "s" : ""} already responded`
          : "Be the first to respond"}
      </p>

      {goingAvatars.length > 0 && (
        <div className="flex items-center gap-1.5 mt-2">
          <div className="flex -space-x-1.5">
            {goingAvatars.map((a, i) => (
              <Avatar key={i} className="h-6 w-6 ring-2 ring-white">
                {a.avatar_url && <AvatarImage src={a.avatar_url} />}
                <AvatarFallback className="bg-primary text-primary-foreground text-[9px]">
                  {(a.display_name || "?").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground">going</span>
        </div>
      )}

      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={() => updateAttendance.mutate("going")}
          disabled={updateAttendance.isPending}
          className="h-8 px-4 rounded-lg text-[13px] font-semibold text-white"
          style={{ background: "#0D9488" }}
        >
          Going ✓
        </button>
        <button
          onClick={() => updateAttendance.mutate("maybe")}
          disabled={updateAttendance.isPending}
          className="h-8 px-4 rounded-lg text-[13px] font-semibold border-2"
          style={{ borderColor: "#0D9488", color: "#0D9488" }}
        >
          Maybe
        </button>
        <Link
          to={`/app/trips/${item.tripId}`}
          className="ml-auto text-[12px] font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          See trip <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

const Decisions = () => {
  const { data, isLoading } = useGlobalDecisions();
  const items = data?.items ?? [];
  const tripIds = new Set(items.map((i) => i.tripId));

  const subtitle = (() => {
    if (isLoading) return "Loading…";
    if (items.length === 0) return "No pending votes — you're all caught up";
    return `${items.length} vote${items.length !== 1 ? "s" : ""} across ${tripIds.size} trip${tripIds.size !== 1 ? "s" : ""}`;
  })();

  const pills: HeroPill[] = [];
  if (!isLoading && items.length > 0) {
    const destVotes = items.filter((i) => i.type === "destination" || i.type === "date").length;
    const pollVotes = items.filter((i) => i.type === "poll").length;
    const vibeVotes = items.filter((i) => i.type === "vibe").length;
    if (destVotes > 0) pills.push({ icon: <MapPin className="h-3 w-3" />, label: `${destVotes} trip vote${destVotes !== 1 ? "s" : ""}` });
    if (pollVotes > 0) pills.push({ icon: <Vote className="h-3 w-3" />, label: `${pollVotes} poll${pollVotes !== 1 ? "s" : ""}` });
    if (vibeVotes > 0) pills.push({ icon: <MessageSquare className="h-3 w-3" />, label: `${vibeVotes} vibe check${vibeVotes !== 1 ? "s" : ""}` });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: "#F1F5F9" }}>
        <TabHeroHeader title="Decisions" subtitle="Loading…" />
        <div className="px-4 mt-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[72px] rounded-[14px] skeleton-shimmer" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F1F5F9" }}>
      <TabHeroHeader title="Decisions" subtitle={subtitle} pills={pills} />

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center pt-24 text-center px-4 mt-4 md:max-w-[900px] md:mx-auto md:px-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0D9488]/10">
            <CircleCheck className="h-8 w-8 text-[#0D9488]" />
          </div>
          <h2 className="mt-5 text-lg font-bold text-foreground">You're all caught up!</h2>
          <p className="mt-2 max-w-[260px] text-[15px] leading-relaxed text-muted-foreground">
            No pending decisions across your trips.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5 px-4 mt-4 pb-32 md:max-w-[900px] md:mx-auto md:px-8">
          {items.map((item) => {
            // Attendance cards get special rendering
            if (item.type === "attendance") {
              return <AttendanceCard key={item.id} item={item} />;
            }

            const cfg = typeConfig[item.type];
            const Icon = cfg.icon;
            return (
              <Link
                key={item.id}
                to={`/app/trips/${item.tripId}/decisions?scrollTo=${{
                  vibe: "vibe",
                  destination: "where",
                  date: "where",
                  poll: "polls",
                }[item.type]}${item.pollId ? `&pollId=${item.pollId}` : ""}`}
                className="group flex items-center gap-3 bg-white rounded-[14px] border border-[#F1F5F9] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 active:scale-[0.98] transition-transform"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: "rgba(13,148,136,0.08)" }}
                >
                  <Icon className="h-5 w-5 text-[#0D9488]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-0.5">
                    <span>{item.tripEmoji ?? "✈️"}</span>
                    <span className="truncate">{item.tripName}</span>
                  </div>
                  <p className="text-[14px] font-medium text-foreground leading-snug truncate">
                    {item.description}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground/50 shrink-0 group-hover:text-foreground transition-colors" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Decisions;
