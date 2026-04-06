import { useState, useEffect } from "react";
import { Plane, Hotel, Activity, Link2, File, Trash2, ExternalLink, MapPin, Calendar, Clock, Hash, Users, ChevronDown, Sparkles, Download, Maximize2, StickyNote, Pencil, Check, X, CreditCard, Info, WifiOff, CloudDownload } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { saveDocument, getDocument, listCachedPaths } from "@/lib/offlineDocuments";
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
const PDF_EXTENSION = /\.pdf$/i;

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
  isNew?: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onUploadPrompt?: () => void;
  onUpdateNotes?: (id: string, notes: string) => void;
  getSignedUrl?: (filePath: string) => Promise<string>;
}

export function AttachmentCard({ attachment, canDelete, isMine, isExtracting, isFetching, isNew, onOpen, onDelete, onUploadPrompt, onUpdateNotes, getSignedUrl }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [noteDraft, setNoteDraft] = useState(attachment.notes || "");
  const [offlineCached, setOfflineCached] = useState(false);
  const [savingOffline, setSavingOffline] = useState(false);
  const isMobile = useIsMobile();

  // Check if this document is already cached offline
  useEffect(() => {
    if (!attachment.file_path) return;
    listCachedPaths().then((paths) => {
      setOfflineCached(paths.includes(attachment.file_path!));
    }).catch(() => {});
  }, [attachment.file_path]);
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
  const isPdfFile = attachment.file_path && PDF_EXTENSION.test(attachment.file_path);
  const hasFile = !!attachment.file_path;
  const hasUrl = !!attachment.url;
  const canOpen = hasFile || hasUrl;
  const bannerSrc = attachment.og_image_url || imageUrl;

  // Fetch signed URL for image preview
  useEffect(() => {
    if (!attachment.og_image_url && isImageFile && attachment.file_path && getSignedUrl) {
      getSignedUrl(attachment.file_path).then(setImageUrl).catch(() => {});
    }
  }, [attachment.og_image_url, isImageFile, attachment.file_path, getSignedUrl]);


  const handleConfirmDelete = () => {
    setConfirmOpen(false);
    onDelete();
  };

  // Unified download: saves to IndexedDB for offline viewing AND triggers device download
  const handleSaveOffline = async (e: React.MouseEvent) => {
    e.stopPropagation();
    // no-op, kept for compatibility
  };

  const cacheAndServeBlob = async (filePath: string): Promise<string | null> => {
    // Try IndexedDB first
    const cached = await getDocument(filePath);
    if (cached) return URL.createObjectURL(cached);
    // Not cached — fetch via signed URL and auto-cache
    if (!getSignedUrl) return null;
    try {
      const url = await getSignedUrl(filePath);
      const res = await fetch(url);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      // Auto-cache on first open
      saveDocument(filePath, blob).then(() => setOfflineCached(true)).catch(() => {});
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  };

  const handleOpen = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (hasUrl) {
      window.open(attachment.url!, "_blank", "noopener");
    } else if (hasFile && attachment.file_path) {
      const tab = window.open("about:blank", "_blank");
      const blobUrl = await cacheAndServeBlob(attachment.file_path);
      if (blobUrl) {
        if (tab) {
          tab.location.href = blobUrl;
        } else {
          window.location.href = blobUrl;
        }
      } else {
        tab?.close();
        if (!navigator.onLine) {
          toast.error("Save this document while online to access it offline");
        }
      }
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const fileName = cleanTitle(attachment.title);
    setSavingOffline(true);
    try {
      let blob: Blob | null = null;

      // Try offline cache first
      if (attachment.file_path) {
        blob = await getDocument(attachment.file_path);
      }

      // Fetch via signed URL if not cached
      if (!blob && attachment.file_path && getSignedUrl) {
        const url = await getSignedUrl(attachment.file_path);
        const res = await fetch(url);
        if (!res.ok) throw new Error("Download failed");
        blob = await res.blob();
      }

      // Fallback for link-type attachments
      if (!blob && attachment.url) {
        window.open(attachment.url, "_blank", "noopener");
        return;
      }

      if (blob) {
        // Save to IndexedDB for offline viewing
        if (attachment.file_path) {
          await saveDocument(attachment.file_path, blob).catch(() => {});
          setOfflineCached(true);
        }

        // Trigger device download
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        toast.success("Downloaded — also available offline");
      }
    } catch {
      toast.error("Download failed");
    } finally {
      setSavingOffline(false);
    }
  };

  const handleSaveNotes = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdateNotes?.(attachment.id, noteDraft.trim());
    setEditingNotes(false);
  };

  const handleCancelNotes = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNoteDraft(attachment.notes || "");
    setEditingNotes(false);
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
        className={`overflow-hidden rounded-xl border bg-card shadow-sm transition-all cursor-pointer ${isNew ? "animate-realtime-flash" : ""}`}
        onClick={() => setExpanded((p) => !p)}
      >
        {/* Compact row — always visible */}
        <div className="flex items-center gap-3 p-3">
          {/* Type icon — centered vertically */}
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconColor}`}>
            <Icon className="h-[18px] w-[18px]" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm leading-snug truncate flex-1">{displayTitle}</p>
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
            </div>

            {!expanded && !booking && displayDesc && (
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
              {offlineCached && hasFile && (
                <span className="inline-flex items-center gap-0.5 rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.5 text-[10px] font-medium leading-none">
                  <WifiOff className="h-2.5 w-2.5" /> Offline
                </span>
              )}
              <span className="text-[11px] text-muted-foreground">{addedBy} · {timeAgo}</span>
            </div>
          </div>

          {/* Actions — compact */}
          <div className="flex flex-col gap-0.5 shrink-0 -mr-1">
            {canOpen && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleOpen}>
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            )}
            {hasFile && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={handleDownload} disabled={savingOffline} title="Download">
                <Download className={`h-3.5 w-3.5 ${savingOffline ? "animate-pulse" : ""}`} />
              </Button>
            )}
            {canDelete && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); setConfirmOpen(true); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="border-t px-3 pb-3 pt-2 space-y-3 animate-fade-in">
            {/* Image / file preview */}
            {bannerSrc && (
              <div
                className="relative h-[140px] overflow-hidden rounded-lg cursor-pointer group"
                onClick={handleOpen}
              >
                <img src={bannerSrc} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <Maximize2 className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            )}

            {/* PDF indicator */}
            {isPdfFile && !bannerSrc && (
              <button
                type="button"
                className="w-full flex items-center gap-3 rounded-lg bg-muted/50 border border-border p-3 hover:bg-muted transition-colors"
                onClick={handleOpen}
              >
                <File className="h-8 w-8 text-red-500 shrink-0" />
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium truncate">{cleanTitle(attachment.title)}</p>
                  <p className="text-xs text-muted-foreground">PDF document — tap to view</p>
                </div>
                <Maximize2 className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            )}

            {/* Non-image file indicator */}
            {hasFile && !isImageFile && !isPdfFile && (
              <button
                type="button"
                className="w-full flex items-center gap-3 rounded-lg bg-muted/50 border border-border p-3 hover:bg-muted transition-colors"
                onClick={handleOpen}
              >
                <File className="h-8 w-8 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium truncate">{cleanTitle(attachment.title)}</p>
                  <p className="text-xs text-muted-foreground">Tap to open file</p>
                </div>
                <Maximize2 className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            )}

            {displayDesc && !booking && (
              <p className="text-[13px] text-muted-foreground line-clamp-3">{displayDesc}</p>
            )}

            {booking && <BookingDetails type={attachment.type} data={booking} />}

            {/* Notes section */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <StickyNote className="h-3 w-3" />
                  Notes
                </div>
                {!editingNotes && (isMine || canDelete) && (
                  <button
                    type="button"
                    className="text-[11px] text-primary flex items-center gap-1 hover:underline"
                    onClick={(e) => { e.stopPropagation(); setEditingNotes(true); setNoteDraft(attachment.notes || ""); }}
                  >
                    <Pencil className="h-3 w-3" />
                    {attachment.notes ? "Edit" : "Add"}
                  </button>
                )}
              </div>

              {editingNotes ? (
                <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                  <Textarea
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    rows={3}
                    placeholder="Add notes, confirmation numbers, details…"
                    className="text-sm"
                    autoFocus
                  />
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleCancelNotes}>
                      <X className="h-3 w-3 mr-1" /> Cancel
                    </Button>
                    <Button size="sm" className="h-7 text-xs" onClick={handleSaveNotes}>
                      <Check className="h-3 w-3 mr-1" /> Save
                    </Button>
                  </div>
                </div>
              ) : attachment.notes ? (
                <p className="text-[13px] text-foreground/80 whitespace-pre-wrap">{attachment.notes}</p>
              ) : (
                <p className="text-[12px] text-muted-foreground/60 italic">No notes yet</p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-1">
              {canOpen && (
                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1.5" onClick={handleOpen}>
                  <Maximize2 className="h-3.5 w-3.5" />
                  Open
                </Button>
              )}
              {(hasFile || hasUrl) && (
                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1.5" onClick={handleDownload}>
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
              )}
              {hasFile && !offlineCached && (
                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1.5" onClick={handleSaveOffline} disabled={savingOffline}>
                  <CloudDownload className={`h-3.5 w-3.5 ${savingOffline ? "animate-pulse" : ""}`} />
                  {savingOffline ? "Saving..." : "Save Offline"}
                </Button>
              )}
              {hasFile && offlineCached && (
                <div className="flex items-center gap-1 text-xs text-emerald-600 px-2">
                  <WifiOff className="h-3.5 w-3.5" /> Available offline
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {canDelete && confirmUI}
    </>
  );
}

/* ---------- Platform name check ---------- */

const PLATFORM_NAMES = ["booking.com", "agoda", "expedia", "hotels.com", "airbnb", "trip.com", "hostelworld"];
function isPlatformName(name: string): boolean {
  return PLATFORM_NAMES.some((p) => name.toLowerCase().includes(p));
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
    if (data.destination) parts.push(String(data.destination));
    else if (data.provider && !isPlatformName(String(data.provider))) parts.push(String(data.provider));
    if (data.check_in) parts.push(`In: ${fmtDate(data.check_in)}`);
    if (data.check_out) parts.push(`Out: ${fmtDate(data.check_out)}`);
  } else if (type === "activity") {
    if (data.check_in && data.check_out) {
      parts.push(`${fmtDate(data.check_in)} – ${fmtDate(data.check_out)}`);
    } else if (data.check_in) {
      parts.push(fmtDate(data.check_in) || String(data.check_in));
    }
    if (data.booking_reference) parts.push(`Ref: ${data.booking_reference}`);
  }
  if (data.total_price) parts.push(String(data.total_price));
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
    if (data.destination) {
      items.push({ icon: MapPin, text: String(data.destination) });
    } else {
      const provider = data.provider ? String(data.provider) : null;
      if (provider && !isPlatformName(provider)) {
        items.push({ icon: MapPin, text: provider });
      }
    }
    if (data.check_in || data.check_out) {
      const parts = [data.check_in && `In: ${fmtDate(data.check_in)}`, data.check_out && `Out: ${fmtDate(data.check_out)}`].filter(Boolean).join(" · ");
      items.push({ icon: Calendar, text: parts });
    }
    if (data.booking_reference) items.push({ icon: Hash, text: `Ref: ${data.booking_reference}` });
  } else if (type === "activity") {
    if (data.provider) items.push({ icon: MapPin, text: String(data.provider) });
    if (data.destination && !data.provider) items.push({ icon: MapPin, text: String(data.destination) });
    if (data.check_in && data.check_out) {
      const text = `${fmtDate(data.check_in)} – ${fmtDate(data.check_out)}`;
      items.push({ icon: Calendar, text });
    } else if (data.check_in) {
      const text = data.departure_time ? `${fmtDate(data.check_in)} at ${data.departure_time}` : (fmtDate(data.check_in) || String(data.check_in));
      items.push({ icon: Calendar, text });
    }
    if (data.booking_reference) items.push({ icon: Hash, text: `Ref: ${data.booking_reference}` });
    if (Array.isArray(data.passenger_names) && data.passenger_names.length > 0) {
      items.push({ icon: Users, text: data.passenger_names.join(", ") });
    }
  }

  // Common fields across all types
  if (data.total_price) items.push({ icon: CreditCard, text: String(data.total_price) });

  if (items.length === 0) return null;

  const notesText = data.notes ? String(data.notes) : null;

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
      {notesText && (
        <div className="flex gap-1.5 text-[12px] text-muted-foreground/80 pt-0.5">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span className="line-clamp-3 whitespace-pre-wrap">{notesText}</span>
        </div>
      )}
    </div>
  );
}
