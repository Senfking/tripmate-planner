import { useState, useMemo } from "react";
import { useAttachments, type AttachmentRow } from "@/hooks/useAttachments";
import { useAuth } from "@/contexts/AuthContext";
import { FileUploadZone } from "./FileUploadZone";
import { LinkForm } from "./LinkForm";
import { AttachmentCard } from "./AttachmentCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { Upload, Link2, Loader2, Search, Plane, Hotel, Activity, File, ChevronDown } from "lucide-react";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "flight", label: "Flights" },
  { value: "hotel", label: "Hotels" },
  { value: "activity", label: "Activities" },
  { value: "link", label: "Links" },
  { value: "other", label: "Other" },
];

const SECTIONS: { type: string; label: string; icon: React.ElementType }[] = [
  { type: "flight", label: "Flights", icon: Plane },
  { type: "hotel", label: "Hotels", icon: Hotel },
  { type: "activity", label: "Activities", icon: Activity },
  { type: "link", label: "Links", icon: Link2 },
  { type: "other", label: "Other / Files", icon: File },
];

interface Props {
  tripId: string;
  myRole: string | undefined;
}

function sortByOwnership(items: AttachmentRow[], userId: string | undefined) {
  return [...items].sort((a, b) => {
    const aIsMine = a.created_by === userId ? 0 : 1;
    const bIsMine = b.created_by === userId ? 0 : 1;
    if (aIsMine !== bIsMine) return aIsMine - bIsMine;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export function BookingsTab({ tripId, myRole }: Props) {
  const { user } = useAuth();
  const { query, uploadFile, addLink, deleteAttachment, getSignedUrl, extractingIds, fetchingIds } = useAttachments(tripId);
  const [mode, setMode] = useState<"none" | "upload" | "link">("none");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const isAdmin = myRole === "owner" || myRole === "admin";
  const attachments = query.data ?? [];

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
      onOpen={() => handleOpen(a)}
      onDelete={() => deleteAttachment.mutate(a)}
      onUploadPrompt={() => setMode("upload")}
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

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Empty state
  if (attachments.length === 0 && mode === "none") {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <p className="text-4xl">📄</p>
        <div>
          <p className="text-lg font-semibold text-foreground">No docs saved yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Upload a file or save a link to get started
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => setMode("upload")} size="sm">
            <Upload className="h-4 w-4 mr-1" />
            Upload confirmation
          </Button>
          <Button onClick={() => setMode("link")} variant="outline" size="sm">
            <Link2 className="h-4 w-4 mr-1" />
            Share a link
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add buttons */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={mode === "upload" ? "default" : "outline"}
          onClick={() => setMode(mode === "upload" ? "none" : "upload")}
        >
          <Upload className="h-4 w-4 mr-1" />
           Upload confirmation
        </Button>
        <Button
          size="sm"
          variant={mode === "link" ? "default" : "outline"}
          onClick={() => setMode(mode === "link" ? "none" : "link")}
        >
          <Link2 className="h-4 w-4 mr-1" />
          Share a link
        </Button>
      </div>

      {/* Add mode panels */}
      {mode === "upload" && (
        <FileUploadZone
          onUpload={(file) => uploadFile.mutate(file)}
          isPending={uploadFile.isPending}
        />
      )}
      {mode === "link" && (
        <LinkForm
          onSubmit={(data) => addLink.mutate(data, { onSuccess: () => setMode("none") })}
          isPending={addLink.isPending}
          onCancel={() => setMode("none")}
        />
      )}

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
              No results matching your filter
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
