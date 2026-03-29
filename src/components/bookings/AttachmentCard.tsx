import { useState, useEffect } from "react";
import { Plane, Hotel, Activity, Link2, File, Trash2, ExternalLink, MapPin, Calendar, Clock, Hash, Users } from "lucide-react";
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

const TYPE_GRADIENTS: Record<string, string> = {
  flight: "from-blue-500 to-blue-600",
  hotel: "from-amber-500 to-amber-600",
  activity: "from-green-500 to-green-600",
  link: "from-teal-500 to-teal-600",
  other: "from-slate-400 to-slate-500",
};

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif)$/i;

function cleanTitle(title: string): string {
  return title.replace(/^[a-f0-9-]{36,}-/, "");
}

interface Props {
  attachment: AttachmentRow;
  canDelete: boolean;
  isMine?: boolean;
  isExtracting?: boolean;
  onOpen: () => void;
  onDelete: () => void;
  getSignedUrl?: (filePath: string) => Promise<string>;
}

export function AttachmentCard({ attachment, canDelete, isMine, isExtracting, onOpen, onDelete, getSignedUrl }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const Icon = TYPE_ICONS[attachment.type] || File;
  const addedBy = attachment.profiles?.display_name || "Unknown";
  const timeAgo = formatDistanceToNow(new Date(attachment.created_at), { addSuffix: true });
  const gradient = TYPE_GRADIENTS[attachment.type] || TYPE_GRADIENTS.other;

  const displayTitle = attachment.og_title || cleanTitle(attachment.title);
  const booking = attachment.booking_data as Record<string, unknown> | null;

  // Resolve banner image
  const isImageFile = attachment.file_path && IMAGE_EXTENSIONS.test(attachment.file_path);
  const bannerSrc = attachment.og_image_url || imageUrl;
  const hasBanner = !!bannerSrc;

  useEffect(() => {
    if (!attachment.og_image_url && isImageFile && attachment.file_path && getSignedUrl) {
      getSignedUrl(attachment.file_path).then(setImageUrl).catch(() => {});
    }
  }, [attachment.og_image_url, isImageFile, attachment.file_path, getSignedUrl]);

  const handleConfirmDelete = () => {
    setConfirmOpen(false);
    onDelete();
  };

  const confirmUI = isMobile ? (
    <Drawer open={confirmOpen} onOpenChange={setConfirmOpen}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Delete this item?</DrawerTitle>
          <DrawerDescription>"{displayTitle}" will be permanently removed.</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <Button variant="destructive" onClick={handleConfirmDelete}>Delete</Button>
          <DrawerClose asChild><Button variant="outline">Cancel</Button></DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  ) : (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this item?</AlertDialogTitle>
          <AlertDialogDescription>"{displayTitle}" will be permanently removed.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleConfirmDelete}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return (
    <>
      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        {/* Banner — only when there's a real image */}
        {hasBanner && (
          <div className="relative h-[100px] overflow-hidden">
            <img src={bannerSrc} alt="" className="h-full w-full object-cover" />
          </div>
        )}

        {/* Body */}
        <div className="p-3 space-y-1.5">
          {/* Title row — with inline icon when no banner */}
          <div className="flex items-center gap-2">
            {!hasBanner && (
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br ${gradient}`}>
                <Icon className="h-4 w-4 text-white/90" />
              </div>
            )}
            <p className="font-medium text-[15px] leading-snug truncate flex-1">{displayTitle}</p>
          </div>

          {attachment.og_description && (
            <p className="text-[13px] text-muted-foreground line-clamp-2">{attachment.og_description}</p>
          )}

          {/* Structured booking data */}
          {booking && <BookingDetails type={attachment.type} data={booking} />}

          {/* AI extraction loading state */}
          {isExtracting && (
            <p className="text-xs font-medium animate-pulse" style={{ color: "#0D9488" }}>
              ✦ Reading document...
            </p>
          )}

          {/* Meta */}
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
            {isMine && (
              <span className="inline-flex items-center rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-medium leading-none">You</span>
            )}
            <span>{addedBy} · {timeAgo}</span>
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-1 border-t px-2 py-1.5">
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

/* ---------- Structured booking details ---------- */

function BookingDetails({ type, data }: { type: string; data: Record<string, unknown> }) {
  const items: { icon: React.ElementType; text: string }[] = [];

  if (type === "flight") {
    if (data.departure && data.destination) items.push({ icon: Plane, text: `${data.departure} → ${data.destination}` });
    if (data.departure_time || data.arrival_time) {
      const parts = [data.departure_time, data.arrival_time].filter(Boolean).join(" – ");
      items.push({ icon: Clock, text: parts });
    }
    if (data.booking_reference) items.push({ icon: Hash, text: `Ref: ${data.booking_reference}` });
    if (Array.isArray(data.passenger_names) && data.passenger_names.length > 0) {
      items.push({ icon: Users, text: data.passenger_names.join(", ") });
    }
  } else if (type === "hotel") {
    if (data.provider) items.push({ icon: MapPin, text: String(data.provider) });
    if (data.check_in || data.check_out) {
      const parts = [data.check_in && `In: ${data.check_in}`, data.check_out && `Out: ${data.check_out}`].filter(Boolean).join(" · ");
      items.push({ icon: Calendar, text: parts });
    }
    if (data.booking_reference) items.push({ icon: Hash, text: `Ref: ${data.booking_reference}` });
  } else if (type === "activity") {
    if (data.check_in) {
      const text = data.departure_time ? `${data.check_in} at ${data.departure_time}` : String(data.check_in);
      items.push({ icon: Calendar, text });
    }
    if (data.booking_reference) items.push({ icon: Hash, text: `Ref: ${data.booking_reference}` });
  }

  if (items.length === 0) return null;

  return (
    <div className="space-y-1 pt-1">
      {items.map((item, i) => {
        const ItemIcon = item.icon;
        return (
          <div key={i} className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <ItemIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{item.text}</span>
          </div>
        );
      })}
    </div>
  );
}
