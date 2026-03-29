import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  onSubmit: (data: { url: string; title: string; type: string; notes?: string }) => void;
  isPending: boolean;
  onCancel: () => void;
}

const TYPES = [
  { value: "flight", label: "Flight" },
  { value: "hotel", label: "Hotel" },
  { value: "activity", label: "Activity" },
  { value: "link", label: "Link" },
  { value: "other", label: "Other" },
];

export function LinkForm({ onSubmit, isPending, onCancel }: Props) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState("link");
  const [notes, setNotes] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !title.trim()) return;
    onSubmit({ url: url.trim(), title: title.trim(), type, notes: notes.trim() || undefined });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Input placeholder="URL *" value={url} onChange={(e) => setUrl(e.target.value)} required type="url" />
      <Input placeholder="Title *" value={title} onChange={(e) => setTitle(e.target.value)} required />
      <Select value={type} onValueChange={setType}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TYPES.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending || !url.trim() || !title.trim()} className="flex-1">
          Save link
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
