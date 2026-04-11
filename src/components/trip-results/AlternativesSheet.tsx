import { X, Loader2 } from "lucide-react";
import { getCategoryColor, getCategoryIcon } from "./categoryColors";
import type { AIActivity } from "./useResultsState";

interface Props {
  activity: AIActivity;
  alternatives: AIActivity[];
  loading: boolean;
  onSelect: (alt: AIActivity) => void;
  onClose: () => void;
}

export function AlternativesSheet({ activity, alternatives, loading, onSelect, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card rounded-t-2xl border-t border-border p-4 pb-8 max-h-[70vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-muted-foreground">Alternatives for</p>
            <h3 className="text-sm font-semibold text-foreground">{activity.title}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-accent transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Finding alternatives...</span>
          </div>
        ) : alternatives.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No alternatives found. Try regenerating the day instead.
          </p>
        ) : (
          <div className="space-y-2">
            {alternatives.map((alt, i) => {
              const color = getCategoryColor(alt.category);
              const IconComponent = getCategoryIcon(alt.category);
              return (
                <button
                  key={i}
                  onClick={() => onSelect(alt)}
                  className="w-full text-left p-3 rounded-xl bg-accent hover:bg-accent/80 border border-border transition-colors flex gap-3"
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: `linear-gradient(135deg, ${color}20, ${color}08)` }}
                  >
                    <IconComponent className="h-5 w-5" style={{ color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-foreground">{alt.title}</h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                      {alt.description}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground font-mono">
                      <span>{alt.duration_minutes} min</span>
                      {alt.estimated_cost_per_person != null && (
                        <>
                          <span>·</span>
                          <span>~{alt.currency || "€"}{alt.estimated_cost_per_person}/pp</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
