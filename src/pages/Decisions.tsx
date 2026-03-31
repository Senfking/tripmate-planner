import { useGlobalDecisions } from "@/hooks/useGlobalDecisions";
import { Link } from "react-router-dom";
import { CircleCheck, Vote, MapPin, CalendarDays, MessageSquare, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TabHeroHeader } from "@/components/ui/TabHeroHeader";

const typeConfig = {
  vibe: { label: "Vibe Board", icon: MessageSquare },
  destination: { label: "Destination vote", icon: MapPin },
  date: { label: "Date vote", icon: CalendarDays },
  poll: { label: "Preference poll", icon: Vote },
} as const;

const Decisions = () => {
  const { data, isLoading } = useGlobalDecisions();
  const items = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-10rem)] bg-[#F1F5F9] px-4 pb-32 pt-6">
        <div className="h-7 w-32 rounded-lg skeleton-shimmer mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[72px] rounded-[14px] skeleton-shimmer" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-10rem)] bg-[#F1F5F9] px-4 pb-32 pt-6">
      <h1 className="mb-4 text-[22px] font-bold text-foreground">Decisions</h1>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center pt-24 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0D9488]/10">
            <CircleCheck className="h-8 w-8 text-[#0D9488]" />
          </div>
          <h2 className="mt-5 text-lg font-bold text-foreground">You're all caught up!</h2>
          <p className="mt-2 max-w-[260px] text-[15px] leading-relaxed text-muted-foreground">
            No pending decisions across your trips.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
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
                className="block bg-white rounded-[14px] border border-[#F1F5F9] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                  <span>{item.tripEmoji ?? "✈️"}</span>
                  <span className="truncate">{item.tripName}</span>
                </div>
                <p className="text-[15px] font-medium text-foreground leading-snug">
                  {item.description}
                </p>
                <div className="mt-2.5">
                  <Badge
                    variant="outline"
                    className="border-[#0D9488]/30 text-[#0D9488] text-[11px] font-medium px-2 py-0.5 gap-1"
                  >
                    <Icon className="h-3 w-3" />
                    {cfg.label}
                  </Badge>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Decisions;
