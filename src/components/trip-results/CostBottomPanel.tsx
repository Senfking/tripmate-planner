import { useState } from "react";
import { Wallet, ChevronUp, ChevronDown } from "lucide-react";

interface Props {
  totalActivities: number;
  total: number;
  dailyAvg: number;
  currency: string;
  categories: [string, number][];
}

export function CostBottomPanel({ totalActivities, total, dailyAvg, currency, categories }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      {/* Slide-up category breakdown */}
      {expanded && (
        <div className="absolute bottom-full left-0 right-0 bg-card border-t border-x border-border rounded-t-xl shadow-lg animate-fade-in">
          <div className="max-w-[700px] mx-auto px-4 py-3 space-y-1.5">
            <p className="text-xs font-semibold text-foreground mb-2">Cost breakdown per person</p>
            {categories.map(([cat, amount]) => (
              <div key={cat} className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{cat}</span>
                <span className="text-xs font-mono text-foreground">~{currency}{Math.round(amount)}</span>
              </div>
            ))}
            <div className="border-t border-border pt-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Total per person</span>
              <span className="text-xs font-mono font-semibold text-[#0D9488]">~{currency}{total}</span>
            </div>
          </div>
        </div>
      )}

      {/* Cost summary line */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors min-w-0"
      >
        <Wallet className="h-3.5 w-3.5 text-[#0D9488] shrink-0" />
        <span className="truncate">
          <span className="font-medium text-foreground">{totalActivities} activities</span>
          {" · "}
          <span className="font-mono">~{currency}{total.toLocaleString()}</span>
          {" · "}
          <span className="font-mono">~{currency}{dailyAvg}/day</span>
        </span>
        {expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronUp className="h-3 w-3 shrink-0" />}
      </button>
    </>
  );
}
