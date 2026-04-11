import { useState, useEffect } from "react";
import { Star, ExternalLink, Trash2, X, Check, MapPin } from "lucide-react";
import { getCategoryColor, getCategoryIcon } from "./categoryColors";
import { useGooglePlaceDetails } from "@/hooks/useGooglePlaceDetails";
import { Skeleton } from "@/components/ui/skeleton";
import type { AIActivity, AIDay } from "./useResultsState";

interface Props {
  activity: AIActivity;
  day: AIDay;
  index: number;
  isAdded: boolean;
  onToggleAdd: () => void;
  onRequestChange: () => void;
  onRemove: () => void;
  onCoordsRefined?: (lat: number, lng: number) => void;
  animDelay?: number;
}

function MiniStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-px">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-2.5 w-2.5 ${
            i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}

export function ActivityCard({
  activity,
  day,
  index,
  isAdded,
  onToggleAdd,
  onRequestChange,
  onRemove,
  onCoordsRefined,
  animDelay = 0,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const color = getCategoryColor(activity.category);
  const IconComponent = getCategoryIcon(activity.category);

  const { photos, reviews, rating, totalRatings, googleMapsUrl, latitude: refinedLat, longitude: refinedLng, isLoading } =
    useGooglePlaceDetails(activity.title || "", activity.location_name || "");

  // Report refined coordinates from Google Places back to parent for map accuracy
  useEffect(() => {
    if (refinedLat != null && refinedLng != null && onCoordsRefined) {
      onCoordsRefined(refinedLat, refinedLng);
    }
  }, [refinedLat, refinedLng, onCoordsRefined]);

  const heroSrc = !imgError && photos.length > 0 ? photos[0] : null;
  const descIsLong = (activity.description?.length || 0) > 120;
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((activity.title || '') + ' ' + (activity.location_name || ''))}`;
  const displayRating = rating ?? (typeof (activity as any).rating === "number" ? (activity as any).rating : null);
  const displayTotalRatings = totalRatings;

  return (
    <div
      data-activity-id={`${day.date}-${index}`}
      className="mx-4 mb-3 rounded-2xl border border-border bg-card overflow-hidden transition-all duration-200 animate-fade-in shadow-sm"
      style={{
        animationDelay: `${animDelay}ms`,
        borderLeftColor: isAdded ? "hsl(var(--primary))" : undefined,
        borderLeftWidth: isAdded ? 3 : undefined,
      }}
    >
      {/* Compact row: image + summary — always visible */}
      <div className="flex gap-0 cursor-pointer" onClick={() => setExpanded((e) => !e)}>
        {/* Thumbnail */}
        <div className="relative w-[100px] h-[80px] shrink-0 overflow-hidden bg-muted">
          {isLoading ? (
            <Skeleton className="w-full h-full rounded-none" />
          ) : heroSrc ? (
            <img
              src={heroSrc}
              alt={activity.title}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${color}30, ${color}10)` }}
            >
              <IconComponent className="h-6 w-6 opacity-40" style={{ color }} />
            </div>
          )}
          {/* Category badge */}
          <div className="absolute top-1.5 left-1.5">
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-px rounded-full text-[8px] uppercase tracking-wider font-bold text-white backdrop-blur-sm"
              style={{ backgroundColor: `${color}cc` }}
            >
              <IconComponent className="h-2.5 w-2.5" />
              {activity.category}
            </span>
          </div>
          {/* Pin number */}
          <div
            className="absolute bottom-1.5 left-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shadow-md"
            style={{ backgroundColor: color }}
          >
            {index + 1}
          </div>
        </div>

        {/* Summary */}
        <div className="flex-1 min-w-0 px-3 py-2 flex flex-col justify-center">
          <h4 className="text-[13px] font-semibold text-foreground leading-snug truncate">
            {activity.title}
          </h4>
          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground flex-wrap">
            {displayRating != null && (
              <span className="flex items-center gap-0.5">
                <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                <span className="font-medium text-foreground/80">{displayRating.toFixed(1)}</span>
              </span>
            )}
            <span className="font-mono">{activity.duration_minutes}min</span>
            {activity.start_time && <span className="font-mono">{activity.start_time}</span>}
          </div>
        </div>

        {/* Right side: cost + add */}
        <div className="flex items-center gap-2 pr-3 shrink-0">
          <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
            {activity.estimated_cost_per_person
              ? `~${activity.currency || "USD"}${activity.estimated_cost_per_person}`
              : "Free"}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleAdd(); }}
            className={`text-[10px] font-medium px-2.5 py-1 rounded-lg transition-all ${
              isAdded
                ? "bg-primary/15 text-primary"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {isAdded ? <Check className="h-3 w-3" /> : "Add"}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border animate-fade-in">
          {/* Description */}
          {activity.description && (
            <div className="px-3.5 pt-2.5 pb-2">
              <p className={`text-xs text-muted-foreground leading-relaxed ${!descExpanded && descIsLong ? "line-clamp-2" : ""}`}>
                {activity.description}
              </p>
              {descIsLong && !descExpanded && (
                <button
                  onClick={(e) => { e.stopPropagation(); setDescExpanded(true); }}
                  className="text-[11px] text-primary font-medium mt-0.5 hover:underline"
                >
                  Read more
                </button>
              )}
            </div>
          )}

          {/* Tips */}
          {activity.tips && (
            <div className="mx-3.5 mb-2 border-l-2 border-primary/50 pl-2.5 py-1 bg-primary/5 rounded-r-lg">
              <p className="text-[11px] text-muted-foreground">
                <span className="font-semibold text-primary mr-1">💡 Tip:</span>
                <span className="text-foreground/80">{activity.tips}</span>
              </p>
            </div>
          )}

          {/* Dietary */}
          {activity.dietary_notes && (
            <div className="px-3.5 pb-2">
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-green-500/10 text-green-700">
                🥗 {activity.dietary_notes}
              </span>
            </div>
          )}

          {/* Google Reviews */}
          {isLoading ? (
            <div className="px-3.5 pb-2.5 space-y-1.5">
              <Skeleton className="h-14 w-full rounded-lg" />
            </div>
          ) : reviews.length > 0 ? (
            <div className="px-3.5 pb-1 space-y-1.5">
              {reviews.map((review, i) => (
                <div key={i} className="flex gap-2 p-2 rounded-lg bg-accent/50 border border-border/50">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5"
                    style={{ backgroundColor: `hsl(${(review.author.charCodeAt(0) * 37) % 360}, 55%, 55%)` }}
                  >
                    {review.author.charAt(0) || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-foreground">{review.author}</span>
                      <MiniStars rating={review.rating} />
                      {review.time && (
                        <span className="text-[10px] text-muted-foreground">{review.time}</span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                      {review.text}
                    </p>
                  </div>
                </div>
              ))}
              <p className="text-[9px] text-muted-foreground/60 pb-1">Photos & reviews from Google</p>
            </div>
          ) : null}

          {/* Links */}
          {(activity.title || activity.booking_url) && (
            <div className="px-3.5 pb-2 flex flex-wrap gap-3 text-[11px]">
              {mapsLink && (
                <a
                  href={mapsLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 flex items-center gap-0.5 transition-colors"
                >
                  View on Maps <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
              {activity.booking_url && (
                <a
                  href={activity.booking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 flex items-center gap-0.5 transition-colors"
                >
                  Book <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </div>
          )}

          {/* Actions row */}
          <div className="flex items-center justify-between px-3.5 py-2 border-t border-border bg-accent/20">
            <div className="flex items-center gap-2.5">
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="p-1 text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onRequestChange(); }}
                className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
              >
                <X className="h-3 w-3" /> Change
              </button>
            </div>
            <span className="text-[11px] font-mono text-muted-foreground">
              {activity.estimated_cost_per_person
                ? `~${activity.currency || "USD"}${activity.estimated_cost_per_person}/person`
                : "Free"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
