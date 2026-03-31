import { useGlobalDecisions } from "@/hooks/useGlobalDecisions";
import { Link } from "react-router-dom";
import { CircleCheck, Vote, MapPin, CalendarDays, MessageSquare, CheckCircle, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TabHeroHeader, type HeroPill } from "@/components/ui/TabHeroHeader";

const typeConfig = {
  vibe: { label: "Vibe Board", icon: MessageSquare },
  destination: { label: "Destination vote", icon: MapPin },
  date: { label: "Date vote", icon: CalendarDays },
  poll: { label: "Preference poll", icon: Vote },
} as const;

const Decisions = () => {
  const { data, isLoading } = useGlobalDecisions();
  const items = data?.items ?? [];
  const tripIds = new Set(items.map((i) => i.tripId));

  const subtitle = (() => {
    if (isLoading) return "Loading…";
    if (items.length === 0) return "No pending votes — you're all caught up";
    return `${items.length} vote${items.length !== 1 ? "s" : ""} need${items.length === 1 ? "s" : ""} your input`;
  })();

  // Group by type for pills
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
      <div className="min-h-[calc(100vh-10rem)]" style={{ backgroundColor: "#F1F5F9" }}>
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
    <div className="min-h-[calc(100vh-10rem)]" style={{ backgroundColor: "#F1F5F9" }}>
      <TabHeroHeader title="Decisions" subtitle={subtitle} pills={pills}>
        {/* Pending count badge in header */}
        {items.length > 0 && (
          <div className="mt-4 flex items-center gap-3">
            <div
              className="flex items-center justify-center rounded-full"
              style={{
                width: 44,
                height: 44,
                background: "rgba(255,255,255,0.15)",
                border: "1.5px solid rgba(255,255,255,0.25)",
              }}
            >
              <span className="text-[20px] font-bold text-white">{items.length}</span>
            </div>
            <div>
              <p className="text-[13px] font-semibold text-white/90">Pending</p>
              <p className="text-[11px] text-white/50">across {tripIds.size} trip{tripIds.size !== 1 ? "s" : ""}</p>
            </div>
          </div>
        )}
      </TabHeroHeader>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center pt-24 text-center px-4 mt-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0D9488]/10">
            <CircleCheck className="h-8 w-8 text-[#0D9488]" />
          </div>
          <h2 className="mt-5 text-lg font-bold text-foreground">You're all caught up!</h2>
          <p className="mt-2 max-w-[260px] text-[15px] leading-relaxed text-muted-foreground">
            No pending decisions across your trips.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5 px-4 mt-4 pb-32">
          {items.map((item) => {
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
                {/* Icon */}
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
