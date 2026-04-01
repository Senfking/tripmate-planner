import { useState, useMemo } from "react";
import { useAttachments, type AttachmentRow } from "@/hooks/useAttachments";
import { useAuth } from "@/contexts/AuthContext";
import { AttachmentCard } from "./AttachmentCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { useRef } from "react";
import { Camera, Loader2, Search, Plane, Hotel, Activity, File, ChevronDown, Sparkles, Upload, Plus } from "lucide-react";

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
  const { query, uploadFile, addManual, deleteAttachment, updateNotes, getSignedUrl, extractingIds, fetchingIds } = useAttachments(tripId);
  const isMobile = useIsMobile();
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualType, setManualType] = useState("other");
  const [manualNotes, setManualNotes] = useState("");
  const [filter, setFilter] = useState("all");
  const [peopleFilter, setPeopleFilter] = useState<"all" | "mine" | "others">("all");
  const [search, setSearch] = useState("");
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const ACCEPT_ALL = ".pdf,.jpg,.jpeg,.png,.webp";

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile.mutate(file);
    e.target.value = "";
  };

  const handleManualSubmit = () => {
    if (!manualTitle.trim()) return;
    addManual.mutate(
      { title: manualTitle.trim(), type: manualType, notes: manualNotes.trim() || undefined },
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
  const attachments = query.data ?? [];

  const isSearching = search.trim().length > 0;
  const isGroupedView = filter === "all" && !isSearching;

  const peopleFiltered = useMemo(() => {
    if (peopleFilter === "mine") return attachments.filter((a) => a.created_by === user?.id);
    if (peopleFilter === "others") return attachments.filter((a) => a.created_by !== user?.id);
    return attachments;
  }, [attachments, peopleFilter, user?.id]);

  const filtered = useMemo(() => {
    let list = peopleFiltered;
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
  }, [peopleFiltered, filter, search, isSearching, user?.id]);

  const groupedSections = useMemo(() => {
    if (!isGroupedView) return [];
    return SECTIONS.map((s) => {
      const items = peopleFiltered.filter((a) => a.type === s.type);
      return { ...s, items: sortByOwnership(items, user?.id) };
    }).filter((s) => s.items.length > 0);
  }, [peopleFiltered, isGroupedView, user?.id]);

  const handleOpen = async (a: AttachmentRow) => {
    if (a.url) {
      window.open(a.url, "_blank");
    } else if (a.file_path) {
      try {
        const url = await getSignedUrl(a.file_path);
        window.open(url, "_blank");
      } catch {
        /* toast already shown */
      }
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
      getSignedUrl={getSignedUrl}
    />
  );

  const renderOwnedSection = (items: AttachmentRow[]) => {
    const mine = items.filter((a) => a.created_by === user?.id);
    const others = items.filter((a) => a.created_by !== user?.id);
    const showLabels = mine.length > 0 && others.length > 0;

    return (
      <>
        {showLabels && mine.length > 0 && (
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider pt-1 pb-0.5 px-1">Yours</p>
        )}
        {mine.map(renderCard)}
        {showLabels && others.length > 0 && (
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider pt-2 pb-0.5 px-1">From others</p>
        )}
        {others.map(renderCard)}
      </>
    );
  };

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

  /* ── AI scan section (reusable) ── */
  const aiSection = (
    <>
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      <input ref={galleryInputRef} type="file" accept={ACCEPT_ALL} className="hidden" onChange={handleFile} />

      <div className="rounded-xl border border-[hsl(var(--primary))]/20 bg-[hsl(var(--primary))]/[0.03] p-4 space-y-3">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-[#0D9488]" />
          <span className="text-[12px] font-medium text-[#0D9488]">AI-powered</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Upload a confirmation — we'll extract the details automatically
        </p>
        {uploadFile.isPending ? (
          <div className="flex items-center justify-center gap-2 py-3 text-[13px] font-medium text-[#0D9488]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Processing…
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex items-center justify-center gap-2 rounded-lg bg-background border border-border py-2.5 text-[13px] font-medium text-foreground hover:border-[#0D9488]/40 transition-colors active:scale-[0.97]">
              <Camera className="h-4 w-4 text-[#0D9488]" />
              Take photo
            </button>
            <button type="button" onClick={() => galleryInputRef.current?.click()} className="flex items-center justify-center gap-2 rounded-lg bg-background border border-border py-2.5 text-[13px] font-medium text-foreground hover:border-[#0D9488]/40 transition-colors active:scale-[0.97]">
              <Upload className="h-4 w-4 text-[#0D9488]" />
              Upload file
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-[11px] text-muted-foreground">or add manually</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <Button variant="outline" size="sm" className="w-full" onClick={openManualForm}>
        <Plus className="h-4 w-4 mr-1.5" />
        Add details manually
      </Button>
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
          <p className="text-sm text-muted-foreground mt-1">
            Upload a confirmation to get started
          </p>
        </div>
        <div className="w-full max-w-xs space-y-3">
          {aiSection}
        </div>
        {manualFormModal}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {aiSection}
      {manualFormModal}

      {/* Filters + search */}
      {attachments.length > 0 && (
        <>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {FILTERS.map((f) => (
              <Button
                key={f.value}
                size="sm"
                variant={filter === f.value ? "default" : "outline"}
                onClick={() => setFilter(f.value)}
                className="shrink-0 text-xs h-7 px-2.5"
              >
                {f.label}
              </Button>
            ))}
           </div>
          <div className="flex gap-1.5 pb-1">
            {([
              { value: "all", label: "All people" },
              { value: "mine", label: "Mine" },
              { value: "others", label: "Others" },
            ] as const).map((f) => (
              <Button
                key={f.value}
                size="sm"
                variant={peopleFilter === f.value ? "default" : "outline"}
                onClick={() => setPeopleFilter(f.value)}
                className="shrink-0 text-xs h-7 px-2.5"
              >
                {f.label}
              </Button>
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
        </>
      )}

      {/* Grouped view */}
      {isGroupedView && (
        <div className="space-y-3">
          {groupedSections.map((section) => (
            <SectionGroup
              key={section.type}
              label={section.label}
              icon={section.icon}
              count={section.items.length}
            >
              {renderOwnedSection(section.items)}
            </SectionGroup>
          ))}
        </div>
      )}

      {/* Flat list view (filtered or search) */}
      {!isGroupedView && (
        <div className="space-y-2">
          {filtered.map(renderCard)}
          {filtered.length === 0 && attachments.length > 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">
              {peopleFilter === "others"
                ? "No bookings from other members yet"
                : peopleFilter === "mine"
                ? "You haven't added any bookings yet — upload a confirmation or share a link"
                : "No results matching your filter"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Collapsible section ---------- */

function SectionGroup({
  label,
  icon: Icon,
  count,
  children,
}: {
  label: string;
  icon: React.ElementType;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent/50"
        >
          <Icon className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium flex-1">{label}</span>
          <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-normal">
            {count}
          </Badge>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
              open ? "rotate-0" : "-rotate-90"
            }`}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
        <div className="space-y-2 pt-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
