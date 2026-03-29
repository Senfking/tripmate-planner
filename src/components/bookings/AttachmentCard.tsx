import { Plane, Hotel, Activity, Link2, File, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import type { AttachmentRow } from "@/hooks/useAttachments";

const TYPE_ICONS: Record<string, React.ElementType> = {
  flight: Plane,
  hotel: Hotel,
  activity: Activity,
  link: Link2,
  other: File,
};

interface Props {
  attachment: AttachmentRow;
  canDelete: boolean;
  onOpen: () => void;
  onDelete: () => void;
}

export function AttachmentCard({ attachment, canDelete, onOpen, onDelete }: Props) {
  const Icon = TYPE_ICONS[attachment.type] || File;
  const addedBy = attachment.profiles?.display_name || "Unknown";
  const timeAgo = formatDistanceToNow(new Date(attachment.created_at), { addSuffix: true });

  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{attachment.title}</p>
        {attachment.notes && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{attachment.notes}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {addedBy} · {timeAgo}
        </p>
      </div>
      <div className="flex gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpen}>
          <ExternalLink className="h-4 w-4" />
        </Button>
        {canDelete && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
