import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, GripVertical, MapPin } from "lucide-react";
import { ItemComments } from "./ItemComments";
import { AttendanceRow } from "./AttendanceRow";
import type { ItineraryItem } from "@/hooks/useItinerary";
import type { AttendanceRecord, TripMember } from "@/hooks/useItineraryAttendance";
import { useAuth } from "@/contexts/AuthContext";

const statusConfig: Record<string, { label: string; className: string }> = {
  idea: { label: "Idea", className: "bg-muted text-muted-foreground" },
  planned: { label: "Planned", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  booked: { label: "Booked", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  confirmed: { label: "Confirmed", className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
};

interface Props {
  item: ItineraryItem;
  tripId: string;
  myRole?: string;
  members: TripMember[];
  attendance: AttendanceRecord[];
  draggable?: boolean;
  onCycleAttendance: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export function ItineraryItemCard({ item, tripId, myRole, members, attendance, onCycleAttendance, onEdit, onDelete, onDragStart, onDragOver, onDrop }: Props) {
  const { user } = useAuth();
  const status = statusConfig[item.status] || statusConfig.idea;
  const canDelete = item.created_by === user?.id || myRole === "owner" || myRole === "admin";
  const timeStr = item.start_time ? item.start_time.slice(0, 5) : null;
  const endStr = (item as any).end_time ? (item as any).end_time.slice(0, 5) : null;
  const timeDisplay = timeStr ? (endStr ? `${timeStr}–${endStr}` : timeStr) : null;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="rounded-lg border bg-card p-3 space-y-2 cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-start gap-2">
        <GripVertical className="h-4 w-4 text-muted-foreground/50 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {timeDisplay && (
              <span className="text-xs font-mono text-muted-foreground">{timeDisplay}</span>
            )}
            <span className="font-medium text-sm truncate">{item.title}</span>
          </div>
          {item.location_text && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{item.location_text}</span>
            </div>
          )}
        </div>
        <Badge className={`shrink-0 text-[10px] px-1.5 py-0 border-0 ${status.className}`}>
          {status.label}
        </Badge>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 justify-end md:justify-start">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        {canDelete && (
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Attendance */}
      {user && members.length > 0 && (
        <AttendanceRow
          members={members}
          attendance={attendance}
          itemId={item.id}
          currentUserId={user.id}
          onCycle={onCycleAttendance}
        />
      )}

      {/* Comments */}
      <ItemComments tripId={tripId} itemId={item.id} />
    </div>
  );
}
