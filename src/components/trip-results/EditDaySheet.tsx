import { useState } from "react";
import { X, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AIDay } from "./useResultsState";

interface Props {
  day: AIDay;
  onApply: (instruction: string) => void;
  onClose: () => void;
  loading?: boolean;
}

export function EditDaySheet({ day, onApply, onClose, loading }: Props) {
  const [text, setText] = useState("");

  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card rounded-t-2xl border-t border-border p-5 pb-8 animate-slide-up">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Edit</p>
            <h3 className="text-sm font-semibold text-foreground">Day {day.day_number} — {day.theme || day.date}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-accent transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <Textarea
          inputSize="sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          autoFocus
          className="rounded-xl border-border focus-visible:ring-[#0D9488]/40 focus-visible:ring-offset-0 resize-none"
          placeholder="e.g. make it more relaxed, add a morning surf session..."
        />

        <div className="flex justify-end mt-3">
          <Button
            onClick={() => onApply(text)}
            disabled={!text.trim() || loading}
            className="bg-[#0D9488] hover:bg-[#0D9488]/90 text-white rounded-xl gap-2 text-xs"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Apply changes
          </Button>
        </div>
      </div>
    </div>
  );
}
