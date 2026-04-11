import { useState } from "react";
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
  animDelay = 0,
}: Props) {
  const [descExpanded, setDescExpanded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const color = getCategoryColor(activity.category);
  const IconComponent = getCategoryIcon(activity.category);

  const { photos, reviews, rating, totalRatings, googleMapsUrl, isLoading } =
    useGooglePlaceDetails(activity.title || "", activity.location_name || day.destination || "");

  const heroSrc = !imgError && photos.length > 0 ? photos[0] : null;
  const descIsLong = (activity.description?.length || 0) > 120;
  const mapsLink = googleMapsUrl || activity.google_maps_url;
  const displayRating = rating ?? (typeof (activity as any).rating === "number" ? (activity as any).rating : null);
  const displayTotalRatings = totalRatings;

  return (
    <div
      className="mx-4 mb-3 rounded-2xl border border-border bg-card overflow-hidden transition-all duration-200 animate-fade-in shadow-sm"
      style={{
        animationDelay: `${animDelay}ms`,
        borderLeftColor: isAdded ? "hsl(var(--primary))" : undefined,
        borderLeftWidth: isAdded ? 3 : undefined,
      }}
    >
      {/* Hero image */}
      <div className="relative w-full h-[140px] overflow-hidden bg-muted">
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
            <IconComponent className="h-10 w-10 opacity-40" style={{ color }} />
          </div>
        )}

        {/* Category badge overlay */}
        <div className="absolute top-2.5 left-2.5">
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold text-white backdrop-blur-sm"
            style={{ backgroundColor: `${color}cc` }}
          >
            <IconComponent className="h-3 w-3" />
            {activity.category}
          </span>
        </div>

        {/* Numbered pin overlay */}
        <div
          className="absolute bottom-2.5 left-2.5 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md"
          style={{ backgroundColor: color }}
        >
          {index + 1}
        </div>
      </div>

      {/* Title + meta */}
      <div className="px-3.5 pt-3 pb-1.5">
        <h4 className="text-[15px] font-semibold text-foreground leading-snug">
          {activity.title}
        </h4>

        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
          {displayRating != null && (
            <span className="flex items-center gap-0.5">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              <span className="font-medium text-foreground/80">{displayRating.toFixed(1)}</span>
              {displayTotalRatings != null && (
                <span className="text-muted-foreground">({displayTotalRatings.toLocaleString()})</span>
              )}
            </span>
          )}
          {displayRating != null && <span className="text-muted-foreground/30">·</span>}
          <span className="font-mono">{activity.duration_minutes} min</span>
          {activity.start_time && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span className="font-mono">{activity.start_time}</span>
            </>
          )}
          {activity.location_name && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span className="flex items-center gap-0.5 truncate max-w-[140px]">
                <MapPin className="h-2.5 w-2.5 shrink-0" />
                {activity.location_name}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Description */}
      {activity.description && (
        <div className="px-3.5 pt-1 pb-2">
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
      {(mapsLink || activity.booking_url) && (
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
      <div className="flex items-center justify-between px-3.5 py-2.5 border-t border-border bg-accent/20">
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
        <div className="flex items-center gap-3">
          {activity.estimated_cost_per_person != null && (
            <span className="text-[11px] font-mono text-muted-foreground">
              ~{activity.currency || "€"}{activity.estimated_cost_per_person}/person
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleAdd(); }}
            className={`text-[11px] font-medium px-3 py-1.5 rounded-lg transition-all ${
              isAdded
                ? "bg-primary/15 text-primary"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {isAdded ? (
              <span className="flex items-center gap-1">
                <Check className="h-3 w-3" /> Added
              </span>
            ) : (
              "Add"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
