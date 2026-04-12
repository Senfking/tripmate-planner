import { useState } from "react";
import { X, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AITripResult } from "./useResultsState";

interface Props {
  result: AITripResult;
  onRegenerate: (prompt: string) => void;
  onClose: () => void;
  loading?: boolean;
}

function buildPromptSummary(result: AITripResult): string {
  const days = result.destinations.reduce((s, d) => s + d.days.length, 0);
  const destNames = result.destinations.map(d => d.name).join(", ");
  const budget = result.daily_budget_estimate ? `${result.currency || "USD"}${result.daily_budget_estimate}/day budget` : "";
  return `${days} days in ${destNames}${budget ? `, ${budget}` : ""}`;
}

export function EditTripSheet({ result, onRegenerate, onClose, loading }: Props) {
  const [prompt, setPrompt] = useState(buildPromptSummary(result));

  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card rounded-t-2xl border-t border-border p-5 pb-8 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Edit trip plan</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-accent transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          Modify the description below and regenerate your plan with new parameters.
        </p>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#0D9488]/40 resize-none"
          placeholder="e.g. 10 days in Bali, 2 people, nightlife + workation, premium budget"
        />

        <div className="flex justify-end mt-4">
          <Button
            onClick={() => onRegenerate(prompt)}
            disabled={!prompt.trim() || loading}
            className="bg-[#0D9488] hover:bg-[#0D9488]/90 text-white rounded-xl gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Regenerate plan
          </Button>
        </div>
      </div>
    </div>
  );
}
