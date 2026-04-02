import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ResponsiveModal } from "@/components/ui/ResponsiveModal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Camera,
  Upload,
  Loader2,
  Trash2,
  MapPin,
  Clock,
  AlertCircle,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ACCEPT_ALL = ".pdf,.jpg,.jpeg,.png,.webp,image/*";

interface ParsedItem {
  title: string;
  day_date: string;
  start_time: string | null;
  end_time: string | null;
  location_text: string | null;
  status: string;
  notes: string | null;
}

interface ItemData {
  day_date: string;
  title: string;
  start_time?: string | null;
  end_time?: string | null;
  location_text?: string | null;
  notes?: string | null;
  status?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  tripStartDate: string | null;
  onAddItem: (data: ItemData) => void;
  onBatchAddItems?: (items: ItemData[]) => Promise<void>;
}

export function ImportItineraryModal({
  open,
  onOpenChange,
  tripId,
  tripStartDate,
  onAddItem,
  onBatchAddItems,
}: Props) {
  const { user } = useAuth();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"input" | "preview">("input");
  const [parsing, setParsing] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const reset = () => {
    setStep("input");
    setParsing(false);
    setPasteText("");
    setParsedItems([]);
    setSaving(false);
    setSaveProgress(0);
    setErrorMsg(null);
  };

  const handleClose = (val: boolean) => {
    if (!val) reset();
    onOpenChange(val);
  };

  const callParseFunction = async (
    body: Record<string, unknown>
  ): Promise<ParsedItem[]> => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error("Not authenticated");

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/parse-itinerary`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          ...body,
          trip_start_date: tripStartDate || null,
        }),
      }
    );

    const json = await res.json();
    if (!json.success || !Array.isArray(json.items) || json.items.length === 0) {
      throw new Error("no_items");
    }
    return json.items as ParsedItem[];
  };

  const handleParseResult = (items: ParsedItem[]) => {
    setParsedItems(items);
    setStep("preview");
    setErrorMsg(null);
  };

  const handleError = () => {
    setErrorMsg(
      "We couldn't read this itinerary. Try a clearer photo or paste the text instead."
    );
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    setErrorMsg(null);
    try {
      // Upload to storage
      const ext = file.name.split(".").pop() || "jpg";
      const path = `imports/${tripId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("trip-attachments")
        .upload(path, file);
      if (uploadErr) throw uploadErr;

      const items = await callParseFunction({
        type: "file",
        file_path: path,
        file_type: file.type,
      });
      handleParseResult(items);
    } catch {
      handleError();
    } finally {
      setParsing(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const handleParseText = async () => {
    if (!pasteText.trim()) return;
    setParsing(true);
    setErrorMsg(null);
    try {
      const items = await callParseFunction({
        type: "text",
        content: pasteText.trim(),
      });
      handleParseResult(items);
    } catch {
      handleError();
    } finally {
      setParsing(false);
    }
  };

  const removeItem = (idx: number) => {
    setParsedItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleConfirm = async () => {
    if (parsedItems.length === 0) return;
    setSaving(true);
    setSaveProgress(0);

    const itemsToAdd = parsedItems.map((item) => ({
      day_date: item.day_date,
      title: item.title,
      start_time: item.start_time,
      end_time: item.end_time,
      location_text: item.location_text,
      notes: item.notes,
      status: item.status || "idea",
    }));

    try {
      if (onBatchAddItems) {
        await onBatchAddItems(itemsToAdd);
      } else {
        // Fallback to one-by-one if batch not available
        for (const item of itemsToAdd) {
          onAddItem(item);
        }
      }
      setSaveProgress(100);
      toast.success(`${parsedItems.length} activities imported`);
    } catch {
      toast.error("Failed to import activities");
    } finally {
      setSaving(false);
      handleClose(false);
    }
  };

  const formatTime = (t: string | null) => {
    if (!t) return null;
    const [h, m] = t.split(":");
    return `${h}:${m}`;
  };

  const formatDate = (d: string) => {
    try {
      return format(parseISO(d), "EEE, d MMM");
    } catch {
      return d;
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleClose}
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#0D9488]" />
          Import with AI
        </span>
      }
      className="max-w-lg"
    >
      {step === "input" && (
        <div className="space-y-4">
          {/* Hidden file inputs */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileInput}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_ALL}
            className="hidden"
            onChange={handleFileInput}
          />

          {/* AI section */}
          <div className="rounded-xl border border-[hsl(var(--primary))]/20 bg-[hsl(var(--primary))]/[0.03] p-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[#0D9488]" />
              <span className="text-[12px] font-medium text-[#0D9488]">
                AI-powered
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Upload an itinerary — we'll extract all the activities
              automatically
            </p>
            {parsing ? (
              <div className="flex items-center justify-center gap-2 py-3 text-[13px] font-medium text-[#0D9488]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Reading your itinerary…
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 rounded-lg bg-background border border-border py-2.5 text-[13px] font-medium text-foreground hover:border-[#0D9488]/40 transition-colors active:scale-[0.97]"
                >
                  <Camera className="h-4 w-4 text-[#0D9488]" />
                  Take photo
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 rounded-lg bg-background border border-border py-2.5 text-[13px] font-medium text-foreground hover:border-[#0D9488]/40 transition-colors active:scale-[0.97]"
                >
                  <Upload className="h-4 w-4 text-[#0D9488]" />
                  Upload file
                </button>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[11px] text-muted-foreground">
              or paste your itinerary
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Text paste */}
          <Textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste your itinerary text here…"
            rows={5}
            className="text-sm resize-none"
            disabled={parsing}
          />
          <Button
            onClick={handleParseText}
            disabled={parsing || !pasteText.trim()}
            className="w-full"
            size="sm"
          >
            {parsing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Reading…
              </>
            ) : (
              "Extract activities"
            )}
          </Button>

          {/* Error message */}
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-[13px] text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-4">
          {parsedItems.length === 0 ? (
            <div className="text-center py-6 space-y-2">
              <p className="text-sm text-muted-foreground">
                All items removed.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep("input")}
              >
                Try again
              </Button>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                We found {parsedItems.length} activit{parsedItems.length === 1 ? "y" : "ies"} — review and remove any you don't need
              </p>

              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                {parsedItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-border bg-card p-3 space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {item.title}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                          <span>{formatDate(item.day_date)}</span>
                          {item.start_time && (
                            <span className="flex items-center gap-0.5">
                              <Clock className="h-3 w-3" />
                              {formatTime(item.start_time)}
                              {item.end_time && `–${formatTime(item.end_time)}`}
                            </span>
                          )}
                        </div>
                        {item.location_text && (
                          <p className="text-xs text-muted-foreground flex items-center gap-0.5 mt-0.5">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{item.location_text}</span>
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge
                          variant={
                            item.status === "confirmed"
                              ? "default"
                              : "secondary"
                          }
                          className="text-[10px] px-1.5 py-0"
                        >
                          {item.status === "confirmed" ? "Confirmed" : item.status === "idea" ? "Idea" : item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                        </Badge>
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    {item.notes && (
                      <p className="text-xs text-muted-foreground/80 line-clamp-2">
                        {item.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleClose(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={handleConfirm}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      {saveProgress}%
                    </>
                  ) : (
                    `Add ${parsedItems.length} item${parsedItems.length === 1 ? "" : "s"} to itinerary`
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </ResponsiveModal>
  );
}
