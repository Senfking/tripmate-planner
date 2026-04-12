import { X, Loader2, Star } from "lucide-react";
import { getCategoryColor, getCategoryIcon } from "./categoryColors";
import { useGooglePlaceDetails } from "@/hooks/useGooglePlaceDetails";
import { Skeleton } from "@/components/ui/skeleton";
import type { AIActivity } from "./useResultsState";

function AlternativeCard({ alt, destinationName, onSelect }: { alt: AIActivity; destinationName: string; onSelect: () => void }) {
  const { photos, rating, totalRatings, isLoading } = useGooglePlaceDetails(alt.title || "", destinationName || alt.location_name || "");
  const IconComponent = getCategoryIcon(alt.category);
  const color = getCategoryColor(alt.category);
  const heroSrc = photos.length > 0 ? photos[0] : null;

  return (
    <button
      onClick={onSelect}
      className="w-full text-left rounded-xl border border-border bg-card hover:bg-accent/40 transition-colors flex gap-3 overflow-hidden"
    >
      {/* Thumbnail */}
      <div className="w-[72px] h-[72px] flex-shrink-0 bg-muted overflow-hidden">
        {isLoading ? (
          <Skeleton className="w-full h-full rounded-none" />
        ) : heroSrc ? (
          <img src={heroSrc} alt={alt.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${color}20, ${color}08)` }}>
            <IconComponent className="h-5 w-5 opacity-40" style={{ color }} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 py-2 pr-3">
        <h4 className="text-sm font-semibold text-foreground truncate">{alt.title}</h4>
        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{alt.description}</p>
        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground font-mono flex-wrap">
          {(rating ?? null) !== null && (
            <span className="flex items-center gap-0.5">
              <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
              <span className="font-medium text-foreground/80">{rating!.toFixed(1)}</span>
              {totalRatings != null && <span>({totalRatings})</span>}
            </span>
          )}
          <span>{alt.duration_minutes} min</span>
          {alt.estimated_cost_per_person != null && (
            <>
              <span>·</span>
              <span>~{alt.currency || "USD"}{alt.estimated_cost_per_person}/pp</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

interface Props {
  activity: AIActivity;
  alternatives: AIActivity[];
  loading: boolean;
  onSelect: (alt: AIActivity) => void;
  onClose: () => void;
  destinationName?: string;
}

export function AlternativesSheet({ activity, alternatives, loading, onSelect, onClose, destinationName = "" }: Props) {
  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center">
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
            <span className="ml-2 text-sm text-muted-foreground">Junto AI is working...</span>
          </div>
        ) : alternatives.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No alternatives found. Try regenerating the day instead.
          </p>
        ) : (
          <div className="space-y-2">
            {alternatives.map((alt, i) => (
              <AlternativeCard key={i} alt={alt} destinationName={destinationName} onSelect={() => onSelect(alt)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
