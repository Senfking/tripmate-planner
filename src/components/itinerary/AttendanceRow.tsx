import { useState } from "react";
import { Check, HelpCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AttendanceRecord, TripMember } from "@/hooks/useItineraryAttendance";
import { AttendanceSheet } from "./AttendanceSheet";

type MemberStatus = "in" | "maybe" | "out";

function getStatus(member: TripMember, attendance: AttendanceRecord[]): MemberStatus {
  const rec = attendance.find((a) => a.user_id === member.user_id);
  if (!rec) return "in";
  return rec.status as MemberStatus;
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

const DOT: Record<MemberStatus, string> = {
  in: "#0d9488",
  maybe: "#d97706",
  out: "#ef4444",
};

const RSVP_LABEL: Record<MemberStatus, string> = {
  in: "Going",
  maybe: "Maybe",
  out: "Out",
};

const RSVP_STYLE: Record<MemberStatus, { color: string; bg: string }> = {
  in:    { color: "hsl(175 84% 32%)", bg: "hsl(175 84% 32% / 0.12)" },
  maybe: { color: "hsl(38 92% 50%)",  bg: "hsl(38 92% 50% / 0.12)" },
  out:   { color: "hsl(0 84% 60%)",   bg: "hsl(0 84% 60% / 0.10)" },
};

interface Props {
  members: TripMember[];
  attendance: AttendanceRecord[];
  itemId: string;
  currentUserId: string;
  onCycle: () => void;
  compact?: boolean;
}

export function AttendanceRow({ members, attendance, itemId, currentUserId, onCycle, compact }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const itemAttendance = attendance.filter((a) => a.itinerary_item_id === itemId);

  const sorted = [...members].sort((a, b) => {
    if (a.user_id === currentUserId) return -1;
    if (b.user_id === currentUserId) return 1;
    return (a.display_name || "").localeCompare(b.display_name || "");
  });

  const me = members.find((m) => m.user_id === currentUserId);
  const myStatus = me ? getStatus(me, itemAttendance) : "in";
  const rsvpStyle = RSVP_STYLE[myStatus];

  const maxShow = members.length <= 5 ? members.length : 4;
  const visible = sorted.slice(0, maxShow);
  const remaining = members.length - maxShow;

  if (compact) {
    return (
      <>
        {/* Left: avatars */}
        <div
          className="flex items-center -space-x-1 cursor-pointer"
          onClick={() => setSheetOpen(true)}
          role="button"
          tabIndex={0}
        >
          {visible.map((member) => {
            const status = getStatus(member, itemAttendance);
            return (
              <div
                key={member.user_id}
                className={cn(
                  "relative flex shrink-0 items-center justify-center rounded-full text-[8px] font-semibold border-[1.5px] border-card overflow-hidden",
                  !member.avatar_url && (status === "out"
                    ? "bg-muted/60 text-muted-foreground/40"
                    : "bg-secondary text-secondary-foreground"),
                )}
                style={{ height: 22, width: 22 }}
                title={`${member.display_name || "?"}: ${RSVP_LABEL[status]}`}
              >
                {member.avatar_url ? (
                  <img
                    src={member.avatar_url}
                    alt={member.display_name || ""}
                    className={cn("h-full w-full object-cover", status === "out" && "opacity-40 grayscale")}
                  />
                ) : (
                  getInitials(member.display_name)
                )}
                <span
                  className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full border border-card"
                  style={{ backgroundColor: DOT[status] }}
                >
                  {status === "in" && <Check className="h-1.5 w-1.5 text-white" strokeWidth={3} />}
                  {status === "maybe" && <HelpCircle className="h-1.5 w-1.5 text-white" strokeWidth={3} />}
                  {status === "out" && <X className="h-1.5 w-1.5 text-white" strokeWidth={3} />}
                </span>
              </div>
            );
          })}
          {remaining > 0 && (
            <span className="flex items-center justify-center rounded-full border-[1.5px] border-card bg-muted/50 text-[8px] font-medium text-muted-foreground/60" style={{ height: 22, width: 22 }}>
              +{remaining}
            </span>
          )}
        </div>

        {/* Right: RSVP toggle */}
        <button
          data-rsvp
          onClick={(e) => { e.stopPropagation(); onCycle(); }}
          className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-colors active:scale-95"
          style={{ color: rsvpStyle.color, backgroundColor: rsvpStyle.bg }}
        >
          {RSVP_LABEL[myStatus]}
        </button>

        <AttendanceSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          members={members}
          attendance={itemAttendance}
          currentUserId={currentUserId}
        />
      </>
    );
  }

  // Full (non-compact) layout — kept for other usages
  return (
    <>
      <div className="space-y-1">
        <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
          Attending
        </span>
        <div
          className="flex items-center -space-x-1.5 cursor-pointer"
          onClick={() => setSheetOpen(true)}
          role="button"
          tabIndex={0}
        >
          {visible.map((member) => {
            const status = getStatus(member, itemAttendance);
            const isMe = member.user_id === currentUserId;
            const dotColor = DOT[status];

            return (
              <button
                key={member.user_id}
                type="button"
                disabled={!isMe}
                onClick={(e) => {
                  if (!isMe) return;
                  e.stopPropagation();
                  onCycle();
                }}
                className={cn(
                  "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold border-2 border-white dark:border-card transition-colors overflow-hidden",
                  !member.avatar_url && (status === "out"
                    ? "bg-muted/60 text-muted-foreground/40"
                    : "bg-secondary text-secondary-foreground"),
                  isMe && "ring-2 ring-primary/20 z-10 cursor-pointer",
                  !isMe && "cursor-default",
                )}
                title={
                  isMe
                    ? `You: ${status === "in" ? "Attending" : status === "maybe" ? "Maybe" : "Out"} — tap to change`
                    : `${member.display_name || "?"}: ${status === "in" ? "Attending" : status === "maybe" ? "Maybe" : "Out"}`
                }
              >
                {member.avatar_url ? (
                  <img
                    src={member.avatar_url}
                    alt={member.display_name || ""}
                    className={cn("h-full w-full object-cover", status === "out" && "opacity-40 grayscale")}
                  />
                ) : (
                  getInitials(member.display_name)
                )}
                <span
                  className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full border-[1.5px] border-white dark:border-card"
                  style={{ backgroundColor: dotColor }}
                >
                  {status === "in" && <Check className="h-1.5 w-1.5 text-white" strokeWidth={3} />}
                  {status === "maybe" && <HelpCircle className="h-1.5 w-1.5 text-white" strokeWidth={3} />}
                  {status === "out" && <X className="h-1.5 w-1.5 text-white" strokeWidth={3} />}
                </span>
              </button>
            );
          })}

          {remaining > 0 && (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-white dark:border-card bg-muted/50 text-[9px] font-medium text-muted-foreground/60">
              +{remaining}
            </span>
          )}
        </div>
      </div>

      <AttendanceSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        members={members}
        attendance={itemAttendance}
        currentUserId={currentUserId}
      />
    </>
  );
}
