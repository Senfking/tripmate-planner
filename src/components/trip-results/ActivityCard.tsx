import { useState, useEffect, useRef, useCallback } from "react";
import { Star, ExternalLink, Trash2, ArrowLeftRight, MapPin, Sparkles, MessageSquare, PenLine, Lightbulb, Leaf, Loader2 } from "lucide-react";
import { getCategoryColor, getCategoryIcon } from "./categoryColors";
import { useGooglePlaceDetails } from "@/hooks/useGooglePlaceDetails";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityReactions } from "./ActivityReactions";
import { ActivityComments } from "./ActivityComments";
import type { AIActivity, AIDay } from "./useResultsState";

interface Props {
  activity: AIActivity;
  day: AIDay;
  index: number;
  planId?: string | null;
  dayIndex?: number;
  activityIndex?: number;
  onRequestChange: () => void;
  onRequestDescribedChange: (description: string) => void;
  onCustomPlaceSwap: (placeName: string) => Promise<any>;
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

type SwapMode = null | "menu" | "describe" | "custom";

export function ActivityCard({
  activity,
  day,
  index,
  planId,
  dayIndex,
  activityIndex,
  onRequestChange,
  onRequestDescribedChange,
  onCustomPlaceSwap,
  onRemove,
  onCoordsRefined,
  animDelay = 0,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [swapMode, setSwapMode] = useState<SwapMode>(null);
  const [swapText, setSwapText] = useState("");
  const [swapLoading, setSwapLoading] = useState(false);
  const swapRef = useRef<HTMLDivElement>(null);
  const handleCustomSwap = useCallback(async () => {
    if (!swapText.trim() || swapLoading) return;
    setSwapLoading(true);
    try {
      await onCustomPlaceSwap(swapText.trim());
    } finally {
      setSwapLoading(false);
      setSwapMode(null);
      setSwapText("");
    }
  }, [swapText, swapLoading, onCustomPlaceSwap]);

  const handleDescribeSwap = useCallback(() => {
    if (!swapText.trim()) return;
    onRequestDescribedChange(swapText.trim());
    setSwapMode(null);
    setSwapText("");
  }, [swapText, onRequestDescribedChange]);

  const color = getCategoryColor(activity.category);
  const IconComponent = getCategoryIcon(activity.category);
  const actKey = dayIndex != null && activityIndex != null ? `day-${dayIndex}-activity-${activityIndex}` : null;

  const { photos, reviews, rating, totalRatings, googleMapsUrl, latitude: refinedLat, longitude: refinedLng, isLoading } =
    useGooglePlaceDetails(activity.title || "", activity.location_name || "");

  useEffect(() => {
    if (refinedLat != null && refinedLng != null && onCoordsRefined) {
      onCoordsRefined(refinedLat, refinedLng);
    }
  }, [refinedLat, refinedLng, onCoordsRefined]);

  // Close swap menu on outside click
  useEffect(() => {
    if (swapMode === null) return;
    const handler = (e: MouseEvent) => {
      if (swapRef.current && !swapRef.current.contains(e.target as Node)) {
        setSwapMode(null);
        setSwapText("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [swapMode]);

  const heroSrc = !imgError && photos.length > 0 ? photos[0] : null;
  const descIsLong = (activity.description?.length || 0) > 120;
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((activity.title || '') + ' ' + (activity.location_name || ''))}`;
  const displayRating = rating ?? (typeof (activity as any).rating === "number" ? (activity as any).rating : null);

  return (
    <div
      data-activity-id={`${day.date}-${index}`}
      className="mx-4 mb-3 rounded-2xl border border-border bg-card overflow-hidden transition-all duration-200 animate-fade-in shadow-sm"
      style={{ animationDelay: `${animDelay}ms` }}
    >
      {/* Hero image */}
      <div className="relative w-full h-[120px] overflow-hidden bg-muted cursor-pointer" onClick={() => setExpanded((e) => !e)}>
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
            <IconComponent className="h-8 w-8 opacity-40" style={{ color }} />
          </div>
        )}
        {/* Category badge */}
        <div className="absolute top-2 left-2">
          <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded-full text-[8px] uppercase tracking-wider font-bold bg-primary/90 text-primary-foreground backdrop-blur-sm">
            <IconComponent className="h-2.5 w-2.5" />
            {activity.category}
          </span>
        </div>
        {/* Pin number */}
        <div className="absolute bottom-2 left-2 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-primary-foreground shadow-md bg-primary">
          {index + 1}
        </div>
        {/* Swap button — top right, teal outline */}
        <div className="absolute top-2 right-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(true);
              setSwapMode(swapMode === "menu" ? null : "menu");
              setSwapText("");
            }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all shadow-lg bg-card/90 backdrop-blur-sm text-[#0D9488] border border-[#0D9488]/40 hover:bg-[#0D9488]/10 flex items-center gap-1"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" /> Swap
          </button>
        </div>
      </div>

      {/* Summary row */}
      <div className="flex items-start justify-between px-3 py-2 cursor-pointer" onClick={() => setExpanded((e) => !e)}>
        <div className="flex-1 min-w-0">
          <h4 className="text-[13px] font-semibold text-foreground leading-snug truncate">
            {activity.title}
          </h4>
          {activity.description && (
            <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-1">
              {activity.description}
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
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
        <span className="text-[11px] font-mono font-medium text-foreground whitespace-nowrap ml-3 mt-0.5">
          {activity.estimated_cost_per_person
            ? `~${activity.currency || "USD"}${activity.estimated_cost_per_person}`
            : "Free"}
        </span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border animate-fade-in">
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

          {activity.tips && (
            <div className="mx-3.5 mb-2 border-l-2 border-primary/50 pl-2.5 py-1 bg-primary/5 rounded-r-lg">
              <p className="text-[11px] text-muted-foreground flex items-start gap-1">
                <Lightbulb className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                <span><span className="font-semibold text-primary mr-1">Tip:</span><span className="text-foreground/80">{activity.tips}</span></span>
              </p>
            </div>
          )}

          {activity.dietary_notes && (
            <div className="px-3.5 pb-2">
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#0D9488]/10 text-[#0D9488] inline-flex items-center gap-1">
                <Leaf className="h-2.5 w-2.5" /> {activity.dietary_notes}
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
                <div key={i} className="flex gap-2 p-2 rounded-lg bg-accent/50 border border-border">
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

          {/* Reactions & Comments */}
          {planId && actKey && (
            <>
              <ActivityReactions planId={planId} activityKey={actKey} />
              <ActivityComments planId={planId} activityKey={actKey} />
            </>
          )}

          {/* Actions row */}
          <div className="flex items-center justify-between px-3.5 py-2 border-t border-border bg-accent/20 relative" ref={swapRef}>
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSwapMode(swapMode === "menu" ? null : "menu");
                setSwapText("");
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-[#0D9488]/30 text-[#0D9488] hover:bg-[#0D9488]/10 transition-colors"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" /> Swap
            </button>
            <span className="text-[11px] font-mono text-muted-foreground">
              {activity.estimated_cost_per_person
                ? `~${activity.currency || "USD"}${activity.estimated_cost_per_person}/person`
                : "Free"}
            </span>

            {/* Swap popover */}
            {swapMode === "menu" && (
              <div className="absolute left-2 bottom-full mb-1 w-56 bg-card border border-border rounded-xl shadow-lg p-1.5 z-20 animate-fade-in">
                <button
                  onClick={(e) => { e.stopPropagation(); onRequestChange(); setSwapMode(null); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs hover:bg-accent transition-colors"
                >
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <div>
                    <span className="font-medium text-foreground">Get Junto AI suggestions</span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Auto-suggest similar experiences</p>
                  </div>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setSwapMode("describe"); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs hover:bg-accent transition-colors"
                >
                  <MessageSquare className="h-3.5 w-3.5 text-primary" />
                  <div>
                    <span className="font-medium text-foreground">Describe what you want</span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">"Something more casual…"</p>
                  </div>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setSwapMode("custom"); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs hover:bg-accent transition-colors"
                >
                  <PenLine className="h-3.5 w-3.5 text-primary" />
                  <div>
                    <span className="font-medium text-foreground">Choose your own</span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Type a specific place name</p>
                  </div>
                </button>
              </div>
            )}

            {/* Describe input */}
            {swapMode === "describe" && (
              <div className="absolute left-2 bottom-full mb-1 w-64 bg-card border border-border rounded-xl shadow-lg p-3 z-20 animate-fade-in">
                <p className="text-[11px] font-medium text-foreground mb-2">What are you looking for instead?</p>
                <input
                  type="text"
                  autoFocus
                  value={swapText}
                  onChange={(e) => setSwapText(e.target.value)}
                  placeholder="e.g. a rooftop bar instead"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && swapText.trim()) {
                      handleDescribeSwap();
                    }
                    if (e.key === "Escape") {
                      setSwapMode(null);
                      setSwapText("");
                    }
                  }}
                />
                <div className="flex justify-end mt-2 gap-2">
                  <button
                    onClick={() => { setSwapMode(null); setSwapText(""); }}
                    className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { handleDescribeSwap(); }}
                    disabled={!swapText.trim()}
                    className="text-[10px] font-medium text-primary-foreground bg-primary hover:bg-primary/90 px-3 py-1 rounded-md"
                  >
                    Find
                  </button>
                </div>
              </div>
            )}

            {/* Custom place input */}
            {swapMode === "custom" && (
              <div className="absolute left-2 bottom-full mb-1 w-64 bg-card border border-border rounded-xl shadow-lg p-3 z-20 animate-fade-in">
                <p className="text-[11px] font-medium text-foreground mb-2">
                  {swapLoading ? "Looking up place..." : "Enter the place name"}
                </p>
                <input
                  type="text"
                  autoFocus
                  value={swapText}
                  onChange={(e) => setSwapText(e.target.value)}
                  placeholder="e.g. Potato Head Beach Club"
                  disabled={swapLoading}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && swapText.trim()) {
                      handleCustomSwap();
                    }
                    if (e.key === "Escape") {
                      setSwapMode(null);
                      setSwapText("");
                    }
                  }}
                />
                <div className="flex justify-end mt-2 gap-2">
                  <button
                    onClick={() => { if (!swapLoading) { setSwapMode(null); setSwapText(""); } }}
                    className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCustomSwap}
                    disabled={!swapText.trim() || swapLoading}
                    className="text-[10px] font-medium text-primary-foreground bg-primary hover:bg-primary/90 px-3 py-1 rounded-md disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    {swapLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                    {swapLoading ? "Searching..." : "Replace"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
