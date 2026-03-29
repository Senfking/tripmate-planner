import { useState, useMemo } from "react";
import { useAttachments } from "@/hooks/useAttachments";
import { useAuth } from "@/contexts/AuthContext";
import { FileUploadZone } from "./FileUploadZone";
import { LinkForm } from "./LinkForm";
import { AttachmentCard } from "./AttachmentCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Link2, Loader2, Search } from "lucide-react";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "flight", label: "Flights" },
  { value: "hotel", label: "Hotels" },
  { value: "activity", label: "Activities" },
  { value: "link", label: "Links" },
  { value: "other", label: "Other" },
];

interface Props {
  tripId: string;
  myRole: string | undefined;
}

export function BookingsTab({ tripId, myRole }: Props) {
  const { user } = useAuth();
  const { query, uploadFile, addLink, deleteAttachment, getSignedUrl } = useAttachments(tripId);
  const [mode, setMode] = useState<"none" | "upload" | "link">("none");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const isAdmin = myRole === "owner" || myRole === "admin";
  const attachments = query.data ?? [];

  const filtered = useMemo(() => {
    let list = attachments;
    if (filter !== "all") list = list.filter((a) => a.type === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.notes && a.notes.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [attachments, filter, search]);

  const handleOpen = async (a: (typeof attachments)[0]) => {
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
            Upload file
          </Button>
          <Button onClick={() => setMode("link")} variant="outline" size="sm">
            <Link2 className="h-4 w-4 mr-1" />
            Save a link
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
          Upload file
        </Button>
        <Button
          size="sm"
          variant={mode === "link" ? "default" : "outline"}
          onClick={() => setMode(mode === "link" ? "none" : "link")}
        >
          <Link2 className="h-4 w-4 mr-1" />
          Save a link
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

      {/* List */}
      <div className="space-y-2">
        {filtered.map((a) => (
          <AttachmentCard
            key={a.id}
            attachment={a}
            canDelete={isAdmin || a.created_by === user?.id}
            onOpen={() => handleOpen(a)}
            onDelete={() => deleteAttachment.mutate(a)}
          />
        ))}
        {filtered.length === 0 && attachments.length > 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            No results matching your filter
          </p>
        )}
      </div>
    </div>
  );
}
