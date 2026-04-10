import { useState, useMemo, useEffect, useCallback } from "react";
import { useAttachments, type AttachmentRow } from "@/hooks/useAttachments";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Camera, Loader2, Search, Plane, Hotel, Activity, File, Sparkles, Upload, Plus, Lock, ChevronDown, SlidersHorizontal } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "mine", label: "Mine" },
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
  const { query, uploadFile, addManual, deleteAttachment, updateNotes, updatePrivacy, getSignedUrl, extractingIds, fetchingIds, lastExtractedId, clearLastExtractedId } = useAttachments(tripId);
  const isMobile = useIsMobile();

  // Fetch trip destination for flight direction inference
  const { data: tripDestination } = useQuery({
    queryKey: ["trip-destination", tripId],
    queryFn: async () => {
      // Try trips.destination first
      const { data: trip } = await supabase.from("trips").select("destination").eq("id", tripId).single();
      if (trip?.destination) return trip.destination;
      // Fallback to proposals
      const { data: proposals } = await supabase
        .from("trip_proposals")
        .select("destination")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: true })
        .limit(1);
      return proposals?.[0]?.destination || null;
    },
    enabled: !!user,
  });
  const [crossLinkAttachment, setCrossLinkAttachment] = useState<AttachmentRow | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualType, setManualType] = useState("other");
  const [manualNotes, setManualNotes] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
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
          setIsPrivate(false);
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
    if (filter === "mine") list = list.filter((a) => a.created_by === user?.id);
    else if (filter !== "all") list = list.filter((a) => a.type === filter);
    if (isSearching) {
      const q = search.toLowerCase();
      // Type label mapping for searching by category name
      const typeLabels: Record<string, string> = { flight: "flight flights", hotel: "hotel hotels", activity: "activity activities", other: "other files" };
      list = list.filter((a) => {
        const memberName = a.profiles?.display_name?.toLowerCase() || "";
        const ogTitle = a.og_title?.toLowerCase() || "";
        const ogDesc = a.og_description?.toLowerCase() || "";
        const typeLabel = typeLabels[a.type] || "";
        const bd = a.booking_data as Record<string, unknown> | null;
        const bdStr = bd ? [bd.provider, bd.departure, bd.destination, bd.booking_reference, bd.title, bd.notes]
          .filter(Boolean).map(String).join(" ").toLowerCase() : "";
        return (
          a.title.toLowerCase().includes(q) ||
          (a.notes && a.notes.toLowerCase().includes(q)) ||
          memberName.includes(q) ||
          ogTitle.includes(q) ||
          ogDesc.includes(q) ||
          typeLabel.includes(q) ||
          bdStr.includes(q)
        );
      });
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
      onTogglePrivacy={(id, isPriv) => updatePrivacy.mutate({ id, is_private: isPriv })}
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
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setIsPrivate((p) => !p)}
              className={`w-full flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${
                isPrivate
                  ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700"
                  : "hover:bg-muted/50"
              }`}
            >
              <Lock className={`h-3.5 w-3.5 shrink-0 ${isPrivate ? "text-amber-600" : "text-muted-foreground"}`} />
              <div className="flex-1 text-left">
                <p className={`text-[13px] font-medium ${isPrivate ? "text-amber-700 dark:text-amber-400" : ""}`}>
                  {isPrivate ? "Private — only you can see this" : "Shared with trip"}
                </p>
              </div>
              <div className={`h-5 w-9 rounded-full transition-colors flex items-center ${
                isPrivate ? "bg-amber-500 justify-end" : "bg-muted-foreground/20 justify-start"
              }`}>
                <div className="h-4 w-4 rounded-full bg-white shadow-sm mx-0.5" />
              </div>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs max-w-[200px]">
            Private documents are only visible to you — other trip members won't see them
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
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

  /* ── Upload bar ── */
  const uploadBar = (
    <>
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      <input ref={galleryInputRef} type="file" accept={ACCEPT_ALL} className="hidden" onChange={handleFile} />

      {uploadFile.isPending ? (
        <div className="flex items-center justify-center gap-2.5 py-4 rounded-xl border-2 border-[#0D9488]/20 bg-[#0D9488]/[0.04] text-[13px] font-medium text-[#0D9488]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Junto AI is processing…
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="flex-1 flex items-center gap-3 rounded-xl border-2 border-[#0D9488]/20 bg-[#0D9488]/[0.04] px-4 py-3.5 text-left transition-colors hover:bg-[#0D9488]/[0.08] active:scale-[0.98]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0D9488]/15">
                <Sparkles className="h-5 w-5 text-[#0D9488]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-foreground">Upload confirmation</p>
                <p className="text-[12px] text-[#0D9488] font-medium">✦ Junto AI extracts details automatically</p>
              </div>
              <Upload className="h-4 w-4 text-[#0D9488] shrink-0" />
            </button>
          </div>

          <div className="flex items-center justify-between px-1">
            <button
              type="button"
              onClick={openManualForm}
              className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add manually
            </button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setIsPrivate((p) => !p)}
                    className={`flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-full transition-all ${
                      isPrivate
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 ring-1 ring-amber-300/50"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <Lock className="h-3 w-3" />
                    {isPrivate ? "Private" : "Shared"}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs max-w-[200px]">
                  {isPrivate
                    ? "Next upload will be private — only you can see it"
                    : "Tap to make next upload private (only visible to you)"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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

      {/* Filter & search icons */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 justify-end">
            <button
              type="button"
              onClick={() => {
                setFiltersOpen((o) => !o);
                if (filtersOpen) setFilter("all");
              }}
              className={cn(
                "shrink-0 flex items-center justify-center h-7 w-7 rounded-full transition-colors",
                filtersOpen || filter !== "all"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchOpen((o) => !o);
                if (!searchOpen) setTimeout(() => searchInputRef.current?.focus(), 100);
                if (searchOpen) setSearch("");
              }}
              className={cn(
                "shrink-0 flex items-center justify-center h-7 w-7 rounded-full transition-colors",
                searchOpen || isSearching
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          </div>
          {filtersOpen && (
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
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
          )}
          {searchOpen && (
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="Search by name, airline, city…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          )}
        </div>
      )}

      {/* Grouped view — Airbnb-style subtle dividers */}
      {isGroupedView && (
        <div className="space-y-1">
          {groupedSections.map((section, idx) => {
            const isCollapsed = collapsedSections.has(section.type);
            return (
              <div key={section.type}>
                {idx > 0 && <div className="h-px bg-border my-3" />}
                <button
                  type="button"
                  onClick={() => setCollapsedSections((prev) => {
                    const next = new Set(prev);
                    if (next.has(section.type)) next.delete(section.type);
                    else next.add(section.type);
                    return next;
                  })}
                  className="flex items-center gap-2 py-1.5 px-0.5 w-full text-left"
                >
                  <section.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">{section.label}</span>
                  <span className="text-[11px] text-muted-foreground/60">{section.items.length}</span>
                  <div className="flex-1" />
                  <ChevronDown className={cn(
                    "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
                    isCollapsed && "-rotate-90"
                  )} />
                </button>
                <div className={cn(
                  "grid transition-all duration-200 ease-in-out",
                  isCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
                )}>
                  <div className="overflow-hidden">
                    <div className="space-y-2 mt-1">
                      {section.items.map(renderCard)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
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
