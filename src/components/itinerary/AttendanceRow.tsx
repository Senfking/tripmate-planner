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

const dotColors: Record<MemberStatus, string> = {
  in: "bg-teal-500",
  maybe: "bg-amber-500",
  out: "bg-red-500",
};

interface Props {
  members: TripMember[];
  attendance: AttendanceRecord[];
  itemId: string;
  currentUserId: string;
  onCycle: () => void;
}

export function AttendanceRow({ members, attendance, itemId, currentUserId, onCycle }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const itemAttendance = attendance.filter((a) => a.itinerary_item_id === itemId);

  const sorted = [...members].sort((a, b) => {
    if (a.user_id === currentUserId) return -1;
    if (b.user_id === currentUserId) return 1;
    return (a.display_name || "").localeCompare(b.display_name || "");
  });

  const showCount = members.length <= 4 ? members.length : 3;
  const visible = sorted.slice(0, showCount);
  const remaining = members.length - showCount;

  return (
    <>
      <div
        className="flex min-w-0 items-center gap-1.5 py-0.5 cursor-pointer"
        onClick={() => setSheetOpen(true)}
        role="button"
        tabIndex={0}
      >
        {visible.map((member) => {
          const status = getStatus(member, itemAttendance);
          const isMe = member.user_id === currentUserId;

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
                "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold transition-colors shadow-sm",
                status === "out"
                  ? "bg-muted text-muted-foreground/40 border-muted"
                  : "bg-secondary text-secondary-foreground border-border/50",
                isMe && "ring-1 ring-primary/30 cursor-pointer",
                !isMe && "cursor-default"
              )}
              title={
                isMe
                  ? `You: ${status === "in" ? "Attending" : status === "maybe" ? "Maybe" : "Out"} — tap to change`
                  : `${member.display_name || "?"}: ${status === "in" ? "Attending" : status === "maybe" ? "Maybe" : "Out"}`
              }
            >
              {getInitials(member.display_name)}
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-background dark:border-card",
                  dotColors[status]
                )}
              >
                {status === "in" && <Check className="h-2 w-2 text-white" strokeWidth={3} />}
                {status === "maybe" && <HelpCircle className="h-2 w-2 text-white" strokeWidth={3} />}
                {status === "out" && <X className="h-2 w-2 text-white" strokeWidth={3} />}
              </span>
            </button>
          );
        })}

        {remaining > 0 && (
          <span className="rounded-full bg-muted/60 px-2 py-1 text-[9px] font-medium text-muted-foreground/70">
            +{remaining}
          </span>
        )}
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
