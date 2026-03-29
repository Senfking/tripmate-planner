import { useState, useEffect } from "react";
import { Plane, Hotel, Activity, Link2, File, Trash2, ExternalLink, MapPin, Calendar, Clock, Hash, Users, ChevronDown, Sparkles } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
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

const TYPE_ICON_COLORS: Record<string, string> = {
  flight: "bg-blue-50 text-blue-600",
  hotel: "bg-amber-50 text-amber-600",
  activity: "bg-green-50 text-green-600",
  link: "bg-teal-50 text-teal-600",
  other: "bg-slate-100 text-slate-500",
};

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif)$/i;

function cleanTitle(title: string): string {
  return title.replace(/^[a-f0-9-]{36,}-/, "");
}

function decodeHtml(html: string): string {
  const txt = document.createElement("textarea");
  txt.innerHTML = html;
  return txt.value;
}

interface Props {
  attachment: AttachmentRow;
  canDelete: boolean;
  isMine?: boolean;
  isExtracting?: boolean;
  isFetching?: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onUploadPrompt?: () => void;
  getSignedUrl?: (filePath: string) => Promise<string>;
}

export function AttachmentCard({ attachment, canDelete, isMine, isExtracting, isFetching, onOpen, onDelete, onUploadPrompt, getSignedUrl }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const Icon = TYPE_ICONS[attachment.type] || File;
  const iconColor = TYPE_ICON_COLORS[attachment.type] || TYPE_ICON_COLORS.other;
  const addedBy = attachment.profiles?.display_name || "Unknown";
  const timeAgo = formatDistanceToNow(new Date(attachment.created_at), { addSuffix: true });

  const rawTitle = attachment.og_title || cleanTitle(attachment.title);
  const displayTitle = decodeHtml(rawTitle);
  const rawDesc = attachment.og_description;
  const displayDesc = rawDesc ? decodeHtml(rawDesc) : null;
  const booking = attachment.booking_data as Record<string, unknown> | null;
  const isLinkWithNoData = attachment.type === "link" && !booking && !attachment.og_image_url && !isExtracting;

  const isImageFile = attachment.file_path && IMAGE_EXTENSIONS.test(attachment.file_path);
  const bannerSrc = attachment.og_image_url || imageUrl;

  useEffect(() => {
    if (!attachment.og_image_url && isImageFile && attachment.file_path && getSignedUrl) {
      getSignedUrl(attachment.file_path).then(setImageUrl).catch(() => {});
    }
  }, [attachment.og_image_url, isImageFile, attachment.file_path, getSignedUrl]);

  const handleConfirmDelete = () => {
    setConfirmOpen(false);
    onDelete();
  };

  const compactBookingSummary = buildCompactSummary(attachment.type, booking);

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
      <div
        className="overflow-hidden rounded-xl border bg-card shadow-sm transition-all cursor-pointer"
        onClick={() => setExpanded((p) => !p)}
      >
        {/* Compact row — always visible */}
        <div className="flex items-start gap-3 p-3">
          {/* Type icon */}
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconColor}`}>
            <Icon className="h-[18px] w-[18px]" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm leading-snug truncate flex-1">{displayTitle}</p>
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
            </div>

            {!expanded && displayDesc && (
              <p className="text-xs text-muted-foreground truncate">{displayDesc}</p>
            )}

            {!expanded && compactBookingSummary && (
              <p className="text-xs text-muted-foreground truncate">{compactBookingSummary}</p>
            )}

            {isFetching && (
              <p className="text-[11px] font-medium animate-pulse flex items-center gap-1" style={{ color: "#0D9488" }}>
                ✦ Fetching details…
              </p>
            )}

            {isExtracting && (
              <p className="text-[11px] font-medium animate-pulse flex items-center gap-1" style={{ color: "#0D9488" }}>
                <Sparkles className="h-3 w-3" /> AI is reading this document…
              </p>
            )}

            {!isExtracting && !isFetching && isLinkWithNoData && onUploadPrompt && (
              <button
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors text-left"
                onClick={(e) => { e.stopPropagation(); onUploadPrompt(); }}
              >
                Upload a screenshot to extract more details
              </button>
            )}

            <div className="flex items-center gap-1.5 pt-0.5">
              {isMine && (
                <span className="inline-flex items-center rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-medium leading-none">You</span>
              )}
              <span className="text-[11px] text-muted-foreground">{addedBy} · {timeAgo}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-0.5 shrink-0 -mr-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onOpen(); }}>
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
            {canDelete && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); setConfirmOpen(true); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="border-t px-3 pb-3 pt-2 space-y-2 animate-fade-in">
            {bannerSrc && (
              <div
                className="relative h-[100px] overflow-hidden rounded-lg cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onOpen(); }}
              >
                <img src={bannerSrc} alt="" className="h-full w-full object-cover" />
              </div>
            )}

            {displayDesc && (
              <p className="text-[13px] text-muted-foreground line-clamp-3">{displayDesc}</p>
            )}

            {booking && <BookingDetails type={attachment.type} data={booking} />}
          </div>
        )}
      </div>
      {canDelete && confirmUI}
    </>
  );
}

/* ---------- Date formatting helper ---------- */

function fmtDate(val: unknown): string | null {
  if (!val || typeof val !== "string") return null;
  try {
    const d = parseISO(val);
    return isValid(d) ? format(d, "MMM d, yyyy") : String(val);
  } catch {
    return String(val);
  }
}

/* ---------- Compact one-line summary ---------- */

function buildCompactSummary(type: string, data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  const parts: string[] = [];
  if (type === "flight") {
    if (data.departure && data.destination) parts.push(`${data.departure} → ${data.destination}`);
    if (data.departure_time) parts.push(String(data.departure_time));
    if (data.booking_reference) parts.push(`Ref: ${data.booking_reference}`);
  } else if (type === "hotel") {
    if (data.provider) parts.push(String(data.provider));
    if (data.check_in) parts.push(`In: ${fmtDate(data.check_in)}`);
    if (data.check_out) parts.push(`Out: ${fmtDate(data.check_out)}`);
  } else if (type === "activity") {
    if (data.check_in) parts.push(fmtDate(data.check_in) || String(data.check_in));
    if (data.booking_reference) parts.push(`Ref: ${data.booking_reference}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/* ---------- Full structured booking details ---------- */

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
    <div className="space-y-1">
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
