import { useMemo, useState } from "react";
import { format, formatDistanceToNow, isToday, isBefore, parseISO, isValid } from "date-fns";
import { Plane, ChevronDown, ChevronUp, Check } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { AttachmentRow } from "@/hooks/useAttachments";

interface ArrivalEntry {
  id: string;
  memberName: string;
  memberId: string | null;
  route: string;
  arrivalDate: Date;
  arrivalTime: string | null;
  status: "upcoming" | "today" | "arrived";
}

interface Props {
  attachments: AttachmentRow[];
  compact?: boolean;
}

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

const STATUS_STYLES = {
  upcoming: {
    dot: "bg-[#0D9488]",
    text: "text-[#0D9488]",
    bg: "bg-[#0D9488]/5",
    border: "border-[#0D9488]/15",
  },
  today: {
    dot: "bg-amber-500 animate-pulse",
    text: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200/50",
  },
  arrived: {
    dot: "bg-emerald-500",
    text: "text-emerald-600",
    bg: "bg-emerald-50/50",
    border: "border-emerald-200/30",
  },
};

export function ArrivalsSection({ attachments, compact = false }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const arrivals = useMemo(() => {
    const now = new Date();
    const entries: ArrivalEntry[] = [];

    for (const att of attachments) {
      if (att.type !== "flight") continue;
      const bd = att.booking_data as Record<string, unknown> | null;
      if (!bd) continue;

      const departure = bd.departure ? String(bd.departure) : null;
      const destination = bd.destination ? String(bd.destination) : null;
      if (!destination) continue;

      // Determine arrival date from check_in or arrival_time
      let arrivalDate: Date | null = null;
      const checkIn = bd.check_in ? String(bd.check_in) : null;
      const arrivalTimeStr = bd.arrival_time ? String(bd.arrival_time) : null;

      if (checkIn) {
        const parsed = parseISO(checkIn);
        if (isValid(parsed)) arrivalDate = parsed;
      }

      if (!arrivalDate) continue;

      const route = departure && destination ? `${departure} → ${destination}` : destination;
      const memberName = att.profiles?.display_name || "Unknown";

      let status: ArrivalEntry["status"] = "upcoming";
      if (isToday(arrivalDate)) {
        status = "today";
      } else if (isBefore(arrivalDate, now)) {
        status = "arrived";
      }

      entries.push({
        id: att.id,
        memberName,
        memberId: att.created_by,
        route,
        arrivalDate,
        arrivalTime: arrivalTimeStr,
        status,
      });
    }

    entries.sort((a, b) => a.arrivalDate.getTime() - b.arrivalDate.getTime());
    return entries;
  }, [attachments]);

  if (arrivals.length === 0) return null;

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, ArrivalEntry[]>();
    for (const a of arrivals) {
      const key = format(a.arrivalDate, "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return Array.from(map.entries()).map(([dateKey, entries]) => ({
      dateKey,
      date: entries[0].arrivalDate,
      entries,
    }));
  }, [arrivals]);

  // Compact summary line
  const summaryLine = useMemo(() => {
    const upcoming = arrivals.filter((a) => a.status !== "arrived");
    if (upcoming.length === 0) return "All members arrived";
    const dates = [...new Set(upcoming.map((a) => format(a.arrivalDate, "MMM d")))];
    if (dates.length === 1) return `${upcoming.length} member${upcoming.length > 1 ? "s" : ""} arriving ${dates[0]}`;
    return `${upcoming.length} member${upcoming.length > 1 ? "s" : ""} arriving ${dates[0]}–${dates[dates.length - 1]}`;
  }, [arrivals]);

  if (compact) {
    const nextArrivals = arrivals.filter((a) => a.status !== "arrived").slice(0, 2);
    if (nextArrivals.length === 0 && arrivals.every((a) => a.status === "arrived")) {
      return null; // Don't show on dashboard if everyone arrived
    }

    return (
      <div className="space-y-2">
        {nextArrivals.map((a) => (
          <div key={a.id} className="flex items-center gap-3">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-[10px] font-medium bg-muted">
                {getInitials(a.memberName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{a.memberName}</p>
              <p className="text-[11px] text-muted-foreground truncate">{a.route}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[11px] font-medium">{format(a.arrivalDate, "MMM d")}</p>
              <p className={`text-[10px] ${STATUS_STYLES[a.status].text}`}>
                {formatDistanceToNow(a.arrivalDate, { addSuffix: true })}
              </p>
            </div>
          </div>
        ))}
        {arrivals.filter((a) => a.status !== "arrived").length > 2 && (
          <p className="text-[11px] text-muted-foreground text-center">
            +{arrivals.filter((a) => a.status !== "arrived").length - 2} more
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((p) => !p)}
        className="flex items-center gap-2 w-full text-left py-2"
      >
        <Plane className="h-4 w-4 text-[#0D9488]" />
        <span className="text-sm font-semibold flex-1">Arrivals</span>
        <span className="text-[11px] text-muted-foreground mr-1">{summaryLine}</span>
        {collapsed ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {!collapsed && (
        <div className="space-y-4 pb-2">
          {grouped.map((group) => (
            <div key={group.dateKey}>
              {/* Day header */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {isToday(group.date)
                    ? "Today"
                    : format(group.date, "EEEE, MMM d")}
                </span>
                {group.entries.length > 1 && (
                  <span className="text-[10px] text-muted-foreground">
                    — {group.entries.length} arriving
                  </span>
                )}
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Arrival cards */}
              <div className="space-y-2">
                {group.entries.map((entry) => {
                  const style = STATUS_STYLES[entry.status];
                  return (
                    <div
                      key={entry.id}
                      className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 ${style.bg} ${style.border}`}
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="text-xs font-medium bg-muted">
                          {getInitials(entry.memberName)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate">{entry.memberName}</p>
                        <p className="text-xs text-muted-foreground truncate">{entry.route}</p>
                      </div>

                      <div className="text-right shrink-0 space-y-0.5">
                        <div className="flex items-center gap-1.5 justify-end">
                          {entry.status === "arrived" ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                          )}
                          <span className={`text-[11px] font-medium ${style.text}`}>
                            {entry.status === "arrived"
                              ? "Arrived"
                              : entry.status === "today"
                              ? "Today"
                              : formatDistanceToNow(entry.arrivalDate, { addSuffix: true })}
                          </span>
                        </div>
                        {entry.arrivalTime && (
                          <p className="text-[11px] text-muted-foreground">{entry.arrivalTime}</p>
                        )}
                        {!isToday(entry.arrivalDate) && (
                          <p className="text-[11px] text-muted-foreground">
                            {format(entry.arrivalDate, "MMM d, h:mm a")}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
