import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Check, HelpCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AttendanceRecord, TripMember } from "@/hooks/useItineraryAttendance";

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

const statusOrder: Record<MemberStatus, number> = { in: 0, maybe: 1, out: 2 };

const statusLabel: Record<MemberStatus, string> = {
  in: "Attending",
  maybe: "Maybe",
  out: "Out",
};

const statusIcon: Record<MemberStatus, React.ReactNode> = {
  in: <Check className="h-4 w-4 text-teal-500" />,
  maybe: <HelpCircle className="h-4 w-4 text-amber-500" />,
  out: <X className="h-4 w-4 text-red-500" />,
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: TripMember[];
  attendance: AttendanceRecord[];
  currentUserId: string;
}

export function AttendanceSheet({
  open,
  onOpenChange,
  members,
  attendance,
  currentUserId,
}: Props) {
  const sorted = [...members].sort((a, b) => {
    const sa = getStatus(a, attendance);
    const sb = getStatus(b, attendance);
    if (statusOrder[sa] !== statusOrder[sb]) return statusOrder[sa] - statusOrder[sb];
    return (a.display_name || "").localeCompare(b.display_name || "");
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Attendance</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6 space-y-2 max-h-[60vh] overflow-y-auto">
          {sorted.map((member) => {
            const status = getStatus(member, attendance);
            const isMe = member.user_id === currentUserId;
            return (
              <div
                key={member.user_id}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2",
                  status === "out" && "opacity-50"
                )}
              >
                <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold text-secondary-foreground shrink-0">
                  {getInitials(member.display_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate block">
                    {member.display_name || "Unknown"}
                    {isMe && (
                      <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                        (You)
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {statusLabel[status]}
                  </span>
                </div>
                {statusIcon[status]}
              </div>
            );
          })}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
