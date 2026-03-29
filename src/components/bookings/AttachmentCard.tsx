import { useState } from "react";
import { Plane, Hotel, Activity, Link2, File, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription,
  DrawerFooter, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
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
  isMine?: boolean;
  onOpen: () => void;
  onDelete: () => void;
}

export function AttachmentCard({ attachment, canDelete, onOpen, onDelete }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isMobile = useIsMobile();
  const Icon = TYPE_ICONS[attachment.type] || File;
  const addedBy = attachment.profiles?.display_name || "Unknown";
  const timeAgo = formatDistanceToNow(new Date(attachment.created_at), { addSuffix: true });

  const handleConfirmDelete = () => {
    setConfirmOpen(false);
    onDelete();
  };

  const confirmUI = isMobile ? (
    <Drawer open={confirmOpen} onOpenChange={setConfirmOpen}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Delete this item?</DrawerTitle>
          <DrawerDescription>
            "{attachment.title}" will be permanently removed.
          </DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <Button variant="destructive" onClick={handleConfirmDelete}>Delete</Button>
          <DrawerClose asChild>
            <Button variant="outline">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  ) : (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this item?</AlertDialogTitle>
          <AlertDialogDescription>
            "{attachment.title}" will be permanently removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={handleConfirmDelete}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return (
    <>
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
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      {canDelete && confirmUI}
    </>
  );
}
