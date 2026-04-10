import { useState, useMemo, useEffect } from "react";
import { useAttachments, type AttachmentRow } from "@/hooks/useAttachments";
import { useAuth } from "@/contexts/AuthContext";
import { AttachmentCard } from "./AttachmentCard";
import { ArrivalsSection } from "./ArrivalsSection";
import { BookingCrossLinkDrawer, extractBookingFields } from "./BookingCrossLinkDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRef } from "react";
import { Camera, Loader2, Search, Plane, Hotel, Activity, File, Sparkles, Upload, Plus, Lock, Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "flight", label: "Flights" },
  { value: "hotel", label: "Hotels" },
  { value: "activity", label: "Activities" },
  { value: "other", label: "Other" },
];

const SECTIONS: { type: string; label: string; icon: React.ElementType }[] = [
  { type: "flight", label: "Flights", icon: Plane },
  { type: "hotel", label: "Hotels", icon: Hotel },
  { type: "activity", label: "Activities", icon: Activity },
  { type: "other", label: "Other / Files", icon: File },
];

interface Props {
  tripId: string;
  myRole: string | undefined;
  newItemIds?: Set<string>;
}

function sortByOwnership(items: AttachmentRow[], userId: string | undefined) {
  return [...items].sort((a, b) => {
    const aIsMine = a.created_by === userId ? 0 : 1;
    const bIsMine = b.created_by === userId ? 0 : 1;
    if (aIsMine !== bIsMine) return aIsMine - bIsMine;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export function BookingsTab({ tripId, myRole, newItemIds }: Props) {
  const { user } = useAuth();
  const { query, uploadFile, addManual, deleteAttachment, updateNotes, getSignedUrl, extractingIds, fetchingIds, lastExtractedId, clearLastExtractedId } = useAttachments(tripId);
  const isMobile = useIsMobile();
  const [crossLinkAttachment, setCrossLinkAttachment] = useState<AttachmentRow | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualType, setManualType] = useState("other");
  const [manualNotes, setManualNotes] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [isPrivate, setIsPrivate] = useState(false);

  const ACCEPT_ALL = ".pdf,.jpg,.jpeg,.png,.webp";

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      Object.defineProperty(file, "__isPrivate", { value: isPrivate });
      uploadFile.mutate(file);
    }
    e.target.value = "";
  };

  const handleManualSubmit = () => {
    if (!manualTitle.trim()) return;
    addManual.mutate(
      { title: manualTitle.trim(), type: manualType, notes: manualNotes.trim() || undefined, is_private: isPrivate },
      {
        onSuccess: () => {
          setShowManualForm(false);
          setManualTitle("");
          setManualType("other");
          setManualNotes("");
        },
      }
    );
  };

  const openManualForm = () => {
    setManualTitle("");
    setManualType("other");
    setManualNotes("");
    setShowManualForm(true);
  };

  const BOOKING_TYPES = [
    { value: "flight", label: "Flight" },
    { value: "hotel", label: "Hotel" },
    { value: "activity", label: "Activity" },
    { value: "other", label: "Other" },
  ];

  const isAdmin = myRole === "owner" || myRole === "admin";
  const allAttachments = query.data ?? [];
  const attachments = useMemo(() =>
    allAttachments.filter((a) => !a.is_private || a.created_by === user?.id),
    [allAttachments, user?.id],
  );

  useEffect(() => {
    if (!lastExtractedId || !attachments.length) return;
    const att = attachments.find((a) => a.id === lastExtractedId);
    if (att && extractBookingFields(att)) {
      setCrossLinkAttachment(att);
    }
    clearLastExtractedId();
  }, [lastExtractedId, attachments]);

  const isSearching = search.trim().length > 0;
  const isGroupedView = filter === "all" && !isSearching;

  const filtered = useMemo(() => {
    let list = attachments;
    if (filter !== "all") list = list.filter((a) => a.type === filter);
    if (isSearching) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.notes && a.notes.toLowerCase().includes(q)),
      );
    }
    return sortByOwnership(list, user?.id);
  }, [attachments, filter, search, isSearching, user?.id]);

  const groupedSections = useMemo(() => {
    if (!isGroupedView) return [];
    return SECTIONS.map((s) => {
      const items = attachments.filter((a) => a.type === s.type);
      return { ...s, items: sortByOwnership(items, user?.id) };
    }).filter((s) => s.items.length > 0);
  }, [attachments, isGroupedView, user?.id]);

  const handleOpen = async (a: AttachmentRow) => {
    if (a.url) {
      window.open(a.url, "_blank");
    } else if (a.file_path) {
      try {
        const url = await getSignedUrl(a.file_path);
        window.open(url, "_blank");
      } catch {}
    }
  };

  const renderCard = (a: AttachmentRow) => (
    <AttachmentCard
      key={a.id}
      attachment={a}
      canDelete={isAdmin || a.created_by === user?.id}
      isMine={a.created_by === user?.id}
      isExtracting={extractingIds.has(a.id)}
      isFetching={fetchingIds.has(a.id)}
      isNew={newItemIds?.has(a.id)}
      onOpen={() => handleOpen(a)}
      onDelete={() => deleteAttachment.mutate(a)}
      onUploadPrompt={() => galleryInputRef.current?.click()}
      onUpdateNotes={(id, notes) => updateNotes.mutate({ id, notes })}
      getSignedUrl={getSignedUrl}
    />
  );

  /* ── Manual form modal ── */
  const manualFormContent = (
    <div className="space-y-4 p-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Title *</Label>
        <Input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} placeholder="e.g. Bangkok Airbnb" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Type</Label>
        <Select value={manualType} onValueChange={setManualType}>
          <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
          <SelectContent>
            {BOOKING_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Notes (optional)</Label>
        <Textarea value={manualNotes} onChange={(e) => setManualNotes(e.target.value)} rows={3} placeholder="Confirmation #, dates, details…" className="text-sm" />
      </div>
      <Button onClick={handleManualSubmit} disabled={!manualTitle.trim() || addManual.isPending} className="w-full">
        {addManual.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
        Add Booking
      </Button>
    </div>
  );

  const manualFormModal = isMobile ? (
    <Drawer open={showManualForm} onOpenChange={setShowManualForm}>
      <DrawerContent>
        <DrawerHeader><DrawerTitle>Add Booking Manually</DrawerTitle></DrawerHeader>
        {manualFormContent}
      </DrawerContent>
    </Drawer>
  ) : (
    <Dialog open={showManualForm} onOpenChange={setShowManualForm}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Booking Manually</DialogTitle></DialogHeader>
        {manualFormContent}
      </DialogContent>
    </Dialog>
  );

  /* ── Compact upload bar ── */
  const uploadBar = (
    <>
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      <input ref={galleryInputRef} type="file" accept={ACCEPT_ALL} className="hidden" onChange={handleFile} />

      {uploadFile.isPending ? (
        <div className="flex items-center justify-center gap-2 py-3 rounded-xl border bg-card text-[13px] font-medium text-[#0D9488]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Processing…
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <Sparkles className="h-3.5 w-3.5 text-[#0D9488] shrink-0" />
            <span className="text-[12px] text-muted-foreground truncate">AI extraction</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    <Lock className="h-3 w-3 text-muted-foreground" />
                    <Switch checked={isPrivate} onCheckedChange={setIsPrivate} className="scale-75" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs max-w-[180px]">
                  Only you can see private documents
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className="w-px h-5 bg-border" />

            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={openManualForm}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Manual
            </Button>

            <Button
              size="sm"
              className="h-7 px-3 text-xs gap-1.5"
              onClick={() => galleryInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload
            </Button>
          </div>
        </div>
      )}
    </>
  );

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Empty state
  if (attachments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 px-2">
        <p className="text-4xl">📄</p>
        <div>
          <p className="text-lg font-semibold text-foreground">No docs saved yet</p>
          <p className="text-sm text-muted-foreground mt-1">Upload a confirmation to get started</p>
        </div>
        <div className="w-full max-w-xs space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-lg border py-2.5 text-[13px] font-medium hover:border-[#0D9488]/40 transition-colors active:scale-[0.97]"
            >
              <Camera className="h-4 w-4 text-[#0D9488]" />
              Take photo
            </button>
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-lg border py-2.5 text-[13px] font-medium hover:border-[#0D9488]/40 transition-colors active:scale-[0.97]"
            >
              <Upload className="h-4 w-4 text-[#0D9488]" />
              Upload file
            </button>
          </div>
          <button
            type="button"
            onClick={openManualForm}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            or add details manually
          </button>
        </div>
        {manualFormModal}
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
        <input ref={galleryInputRef} type="file" accept={ACCEPT_ALL} className="hidden" onChange={handleFile} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {uploadBar}
      {manualFormModal}

      {crossLinkAttachment && (
        <BookingCrossLinkDrawer
          open={!!crossLinkAttachment}
          onOpenChange={(open) => { if (!open) setCrossLinkAttachment(null); }}
          tripId={tripId}
          attachment={crossLinkAttachment}
        />
      )}

      {/* Arrivals section */}
      <ArrivalsSection attachments={attachments} />

      {/* Filters + search */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors ${
                  filter === f.value
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search docs…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>
      )}

      {/* Grouped view — Airbnb-style subtle dividers */}
      {isGroupedView && (
        <div className="space-y-1">
          {groupedSections.map((section, idx) => (
            <div key={section.type}>
              {idx > 0 && <div className="h-px bg-border my-3" />}
              <div className="flex items-center gap-2 py-1.5 px-0.5">
                <section.icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">{section.label}</span>
                <span className="text-[11px] text-muted-foreground/60">{section.items.length}</span>
              </div>
              <div className="space-y-2 mt-1">
                {section.items.map(renderCard)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Flat list */}
      {!isGroupedView && (
        <div className="space-y-2">
          {filtered.map(renderCard)}
          {filtered.length === 0 && attachments.length > 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">
              No results matching your filter
            </p>
          )}
        </div>
      )}
    </div>
  );
}
