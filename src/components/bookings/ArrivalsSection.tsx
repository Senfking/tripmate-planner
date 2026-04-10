import { useMemo, useState } from "react";
import { format, formatDistanceToNow, isToday, isTomorrow, isBefore, parseISO, isValid, differenceInDays } from "date-fns";
import { Plane, PlaneTakeoff, PlaneLanding, ChevronRight, X, ArrowRight } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import type { AttachmentRow } from "@/hooks/useAttachments";

interface FlightEntry {
  id: string;
  memberName: string;
  memberId: string | null;
  departure: string | null;
  destination: string | null;
  date: Date;
  time: string | null;
  direction: "arrival" | "departure" | "transit";
  status: "upcoming" | "today" | "past";
}

interface Props {
  attachments: AttachmentRow[];
  compact?: boolean;
}

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function extractFlights(attachments: AttachmentRow[]): FlightEntry[] {
  const now = new Date();
  const entries: FlightEntry[] = [];

  for (const att of attachments) {
    if (att.type !== "flight") continue;
    const bd = att.booking_data as Record<string, unknown> | null;
    if (!bd) continue;

    const departure = bd.departure ? String(bd.departure) : null;
    const destination = bd.destination ? String(bd.destination) : null;
    if (!destination && !departure) continue;

    const arrivalTimeStr = bd.arrival_time ? String(bd.arrival_time) : null;
    const departureTimeStr = bd.departure_time ? String(bd.departure_time) : null;

    // Try multiple date sources: flight_date, check_in, or created_at as last resort
    const tryParseDate = (...sources: (unknown | undefined)[]): Date | null => {
      for (const src of sources) {
        if (!src) continue;
        const parsed = parseISO(String(src));
        if (isValid(parsed)) return parsed;
      }
      return null;
    };

    const flightDate = tryParseDate(bd.flight_date, bd.check_in);
    const returnDate = tryParseDate(bd.check_out);

    // If we have a flight date, add the outbound entry
    if (flightDate) {
      let status: FlightEntry["status"] = "upcoming";
      if (isToday(flightDate)) status = "today";
      else if (isBefore(flightDate, now)) status = "past";

      const memberName = att.profiles?.display_name || "Unknown";

      entries.push({
        id: att.id,
        memberName,
        memberId: att.created_by,
        departure,
        destination,
        date: flightDate,
        time: departureTimeStr || arrivalTimeStr,
        direction: "arrival",
        status,
      });

      // If there's a return date, add a departure entry
      if (returnDate && returnDate.getTime() !== flightDate.getTime()) {
        let returnStatus: FlightEntry["status"] = "upcoming";
        if (isToday(returnDate)) returnStatus = "today";
        else if (isBefore(returnDate, now)) returnStatus = "past";

        entries.push({
          id: att.id + "-return",
          memberName,
          memberId: att.created_by,
          departure: destination,
          destination: departure,
          date: returnDate,
          time: departureTimeStr,
          direction: "departure",
          status: returnStatus,
        });
      }
    } else {
      // No date available — still show the flight but without a specific date
      // Use created_at as a fallback so it at least appears
      const fallbackDate = parseISO(att.created_at);
      const memberName = att.profiles?.display_name || "Unknown";

      entries.push({
        id: att.id,
        memberName,
        memberId: att.created_by,
        departure,
        destination,
        date: fallbackDate,
        time: departureTimeStr || arrivalTimeStr,
        direction: "arrival",
        status: "upcoming",
      });
    }
  }

  entries.sort((a, b) => a.date.getTime() - b.date.getTime());
  return entries;
}

const DIRECTION_CONFIG = {
  arrival: {
    icon: PlaneLanding,
    label: "Arriving",
    gradient: "from-[#0D9488] to-[#0D9488]/70",
    bg: "bg-[#0D9488]/5",
    border: "border-[#0D9488]/15",
    dot: "bg-[#0D9488]",
    text: "text-[#0D9488]",
  },
  departure: {
    icon: PlaneTakeoff,
    label: "Departing",
    gradient: "from-[#E07A5F] to-[#E07A5F]/70",
    bg: "bg-[#E07A5F]/5",
    border: "border-[#E07A5F]/15",
    dot: "bg-[#E07A5F]",
    text: "text-[#E07A5F]",
  },
  transit: {
    icon: Plane,
    label: "Transit",
    gradient: "from-[#6366F1] to-[#6366F1]/70",
    bg: "bg-[#6366F1]/5",
    border: "border-[#6366F1]/15",
    dot: "bg-[#6366F1]",
    text: "text-[#6366F1]",
  },
};

function FlightTimeline({ flights }: { flights: FlightEntry[] }) {
  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, FlightEntry[]>();
    for (const f of flights) {
      const key = format(f.date, "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return Array.from(map.entries()).map(([dateKey, entries]) => ({
      dateKey,
      date: entries[0].date,
      entries,
    }));
  }, [flights]);

  if (flights.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Plane className="h-8 w-8 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">No flights uploaded yet</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Upload flight confirmations to see the timeline</p>
      </div>
    );
  }

  return (
    <div className="relative px-1">
      {/* Vertical timeline line */}
      <div className="absolute left-[23px] top-4 bottom-4 w-px bg-gradient-to-b from-[#0D9488]/40 via-border to-[#E07A5F]/40" />

      <div className="space-y-6">
        {grouped.map((group) => {
          const dateLabel = isToday(group.date)
            ? "Today"
            : isTomorrow(group.date)
            ? "Tomorrow"
            : format(group.date, "EEEE, MMM d");

          const daysAway = differenceInDays(group.date, new Date());
          const daysLabel =
            daysAway === 0
              ? null
              : daysAway > 0
              ? `in ${daysAway}d`
              : `${Math.abs(daysAway)}d ago`;

          return (
            <div key={group.dateKey} className="space-y-2.5">
              {/* Date marker */}
              <div className="flex items-center gap-3">
                <div className={`relative z-10 flex h-[14px] w-[14px] items-center justify-center rounded-full ${
                  isToday(group.date) ? "bg-amber-500 ring-4 ring-amber-500/20" : "bg-muted-foreground/30"
                } ml-[16px]`}>
                  {isToday(group.date) && (
                    <span className="absolute inset-0 rounded-full bg-amber-500 animate-ping opacity-40" />
                  )}
                </div>
                <span className={`text-[12px] font-bold uppercase tracking-wider ${
                  isToday(group.date) ? "text-amber-600" : "text-muted-foreground"
                }`}>
                  {dateLabel}
                </span>
                {daysLabel && (
                  <span className="text-[11px] text-muted-foreground/60">{daysLabel}</span>
                )}
              </div>

              {/* Flight cards */}
              {group.entries.map((flight) => {
                const config = DIRECTION_CONFIG[flight.direction];
                const DirIcon = config.icon;

                return (
                  <div key={flight.id} className="flex items-start gap-3 ml-[10px]">
                    {/* Timeline node */}
                    <div className="flex flex-col items-center pt-3.5">
                      <div className={`h-[10px] w-[10px] rounded-full border-2 border-background ${config.dot} ring-2 ring-background z-10`} />
                    </div>

                    {/* Card */}
                    <div className={`flex-1 rounded-xl border ${config.border} ${config.bg} p-3.5 space-y-2 transition-all`}>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-[10px] font-semibold bg-muted">
                            {getInitials(flight.memberName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold truncate">{flight.memberName}</p>
                          <div className="flex items-center gap-1">
                            <DirIcon className={`h-3 w-3 ${config.text}`} />
                            <span className={`text-[11px] font-medium ${config.text}`}>{config.label}</span>
                          </div>
                        </div>
                        {flight.time && (
                          <span className="text-[13px] font-bold tabular-nums">{flight.time}</span>
                        )}
                      </div>

                      {/* Route visualization */}
                      {(flight.departure || flight.destination) && (
                        <div className="flex items-center gap-2 px-1">
                          {flight.departure && (
                            <span className="text-[12px] font-medium bg-background/80 px-2 py-0.5 rounded-md border">
                              {flight.departure}
                            </span>
                          )}
                          {flight.departure && flight.destination && (
                            <div className="flex-1 flex items-center gap-1 min-w-0">
                              <div className={`flex-1 h-px bg-gradient-to-r ${config.gradient}`} />
                              <Plane className={`h-3 w-3 ${config.text} shrink-0`} />
                              <div className={`flex-1 h-px bg-gradient-to-r ${config.gradient}`} />
                            </div>
                          )}
                          {flight.destination && (
                            <span className="text-[12px] font-medium bg-background/80 px-2 py-0.5 rounded-md border">
                              {flight.destination}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Status badge */}
                      {flight.status === "past" && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                          ✓ Completed
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ArrivalsSection({ attachments, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  const flights = useMemo(() => extractFlights(attachments), [attachments]);

  const upcomingCount = flights.filter((f) => f.status !== "past").length;
  const todayCount = flights.filter((f) => f.status === "today").length;
  const nextFlight = flights.find((f) => f.status !== "past");

  if (flights.length === 0) return null;

  // Compact mode for dashboard card
  if (compact) {
    const nextFlights = flights.filter((a) => a.status !== "past").slice(0, 2);
    if (nextFlights.length === 0) return null;

    return (
      <div className="space-y-2">
        {nextFlights.map((a) => {
          const config = DIRECTION_CONFIG[a.direction];
          const DirIcon = config.icon;
          return (
            <div key={a.id} className="flex items-center gap-3">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-[10px] font-medium bg-muted">
                  {getInitials(a.memberName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{a.memberName}</p>
                <div className="flex items-center gap-1">
                  <DirIcon className={`h-2.5 w-2.5 ${config.text}`} />
                  <p className="text-[11px] text-muted-foreground truncate">
                    {a.departure && a.destination ? `${a.departure} → ${a.destination}` : (a.destination || a.departure)}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] font-medium">{format(a.date, "MMM d")}</p>
                <p className={`text-[10px] ${config.text}`}>
                  {formatDistanceToNow(a.date, { addSuffix: true })}
                </p>
              </div>
            </div>
          );
        })}
        {flights.filter((a) => a.status !== "past").length > 2 && (
          <p className="text-[11px] text-muted-foreground text-center">
            +{flights.filter((a) => a.status !== "past").length - 2} more
          </p>
        )}
      </div>
    );
  }

  // Banner button
  const banner = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="w-full flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-all hover:shadow-sm active:scale-[0.98] group"
    >
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0D9488]/20 to-[#E07A5F]/10">
        <Plane className="h-5 w-5 text-[#0D9488]" />
        {todayCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white ring-2 ring-background">
            {todayCount}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-[13px] font-semibold">Flight Overview</p>
        <p className="text-[11px] text-muted-foreground truncate">
          {todayCount > 0
            ? `${todayCount} flight${todayCount > 1 ? "s" : ""} today`
            : upcomingCount > 0
            ? `${upcomingCount} upcoming · Next: ${nextFlight?.memberName}, ${format(nextFlight!.date, "MMM d")}`
            : `${flights.length} flight${flights.length > 1 ? "s" : ""} tracked`}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
    </button>
  );

  const drawerContent = (
    <div className="pb-6 px-2">
      <FlightTimeline flights={flights} />
    </div>
  );

  const modal = isMobile ? (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <Plane className="h-4 w-4 text-[#0D9488]" />
            Flight Overview
          </DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto px-4">
          {drawerContent}
        </div>
      </DrawerContent>
    </Drawer>
  ) : (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plane className="h-4 w-4 text-[#0D9488]" />
            Flight Overview
          </DialogTitle>
        </DialogHeader>
        {drawerContent}
      </DialogContent>
    </Dialog>
  );

  return (
    <>
      {banner}
      {modal}
    </>
  );
}
