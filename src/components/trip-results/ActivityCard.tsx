import { useState, useEffect, useRef, useCallback } from "react";
import { Star, ExternalLink, Trash2, ArrowLeftRight, Sparkles, MessageSquare, PenLine, Lightbulb, Leaf, Loader2, Clock } from "lucide-react";
import { getCategoryColor, getCategoryIcon } from "./categoryColors";
import { useGooglePlaceDetails } from "@/hooks/useGooglePlaceDetails";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityReactions } from "./ActivityReactions";
import { ActivityComments } from "./ActivityComments";
import type { AIActivity, AIDay } from "./useResultsState";
import type { ActivityCostFormatter } from "./formatActivityCost";
import { isGetYourGuideEligible, buildGetYourGuideUrl } from "@/lib/affiliateLinks";

interface Props {
  activity: AIActivity;
  day: AIDay;
  index: number;
  planId?: string | null;
  isDraft?: boolean;
  dayIndex?: number;
  activityIndex?: number;
  destinationName?: string | null;
  onRequestChange: () => void;
  onRequestDescribedChange: (description: string) => void;
  onCustomPlaceSwap: (placeName: string) => Promise<any>;
  onRemove: () => void;
  onCoordsRefined?: (lat: number, lng: number) => void;
  animDelay?: number;
  costFormatter?: ActivityCostFormatter;
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
  isDraft = false,
  dayIndex,
  activityIndex,
  destinationName,
  onRequestChange,
  onRequestDescribedChange,
  onCustomPlaceSwap,
  onRemove,
  onCoordsRefined,
  animDelay = 0,
  costFormatter,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  
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
  
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((activity.title || '') + ' ' + (activity.location_name || ''))}`;
  const displayRating = rating ?? (typeof (activity as any).rating === "number" ? (activity as any).rating : null);
  const categoryLabel = activity.category ? activity.category.charAt(0).toUpperCase() + activity.category.slice(1).toLowerCase() : "";

  return (
    <div
      data-activity-id={`${day.date}-${index}`}
      className="group mx-4 mb-3 rounded-2xl bg-card border border-border transition-all duration-300 animate-fade-in shadow-sm hover:-translate-y-0.5 hover:shadow-lg relative overflow-hidden"
      style={{ animationDelay: `${animDelay}ms` }}
    >
      <div className="flex flex-col sm:flex-row">
        {/* Hero image — left column on desktop */}
        <div
          className="relative shrink-0 w-full sm:w-[40%] sm:max-w-[220px] h-[140px] sm:h-auto sm:min-h-[170px] overflow-hidden bg-muted cursor-pointer"
          onClick={() => setExpanded((e) => !e)}
        >
          {isLoading ? (
            <Skeleton className="w-full h-full rounded-none" />
          ) : heroSrc ? (
            <img
              src={heroSrc}
              alt={activity.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${color}30, ${color}10)` }}
            >
              <IconComponent className="h-10 w-10 opacity-50" style={{ color }} />
            </div>
          )}
          {/* Subtle scrim — keeps overlay chips legible without darkening the image */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />

          {/* Pin number — top-left glass pill */}
          <div className="absolute top-2 left-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold text-white bg-black/45 backdrop-blur-md ring-1 ring-white/20">
            #{index + 1}
          </div>

          {/* Junto pick — bottom-left teal chip */}
          {activity.is_junto_pick && (
            <div className="absolute bottom-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white bg-[#0D9488]/90 backdrop-blur-md ring-1 ring-white/20 shadow-md">
              <Sparkles className="h-2.5 w-2.5" />
              Junto Pick
            </div>
          )}
        </div>

        {/* Content column */}
        <div className="flex-1 min-w-0 p-3.5 sm:p-4 flex flex-col">
          {/* Header row — category chip + actions */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ring-1"
              style={{
                backgroundColor: `${color}15`,
                color,
                // ringColor isn't a CSS prop — use boxShadow for the inset ring
                boxShadow: `inset 0 0 0 1px ${color}30`,
              }}
            >
              <IconComponent className="h-2.5 w-2.5" />
              {categoryLabel}
            </span>

            {/* Floating action cluster */}
            <div className="flex items-center gap-1 relative" ref={swapRef}>
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                aria-label="Remove activity"
                className="p-1.5 rounded-lg bg-muted/60 text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-border transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSwapMode(swapMode === "menu" ? null : "menu");
                  setSwapText("");
                }}
                className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-[#0D9488]/10 text-[#0D9488] border border-[#0D9488]/30 hover:bg-[#0D9488]/15 transition-colors flex items-center gap-1"
              >
                <ArrowLeftRight className="h-3 w-3" /> Swap
              </button>

              {swapMode === "menu" && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-card border border-border rounded-xl shadow-xl p-1.5 z-50 animate-fade-in" onClick={(e) => e.stopPropagation()}>
                  <button onClick={(e) => { e.stopPropagation(); onRequestChange(); setSwapMode(null); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs hover:bg-accent transition-colors">
                    <Sparkles className="h-3.5 w-3.5 text-[#0D9488]" />
                    <div>
                      <span className="font-medium text-foreground">Get Junto AI suggestions</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Auto-suggest similar experiences</p>
                    </div>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setSwapMode("describe"); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs hover:bg-accent transition-colors">
                    <MessageSquare className="h-3.5 w-3.5 text-[#0D9488]" />
                    <div>
                      <span className="font-medium text-foreground">Describe what you want</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">"Something more casual…"</p>
                    </div>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setSwapMode("custom"); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs hover:bg-accent transition-colors">
                    <PenLine className="h-3.5 w-3.5 text-[#0D9488]" />
                    <div>
                      <span className="font-medium text-foreground">Choose your own</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Type a specific place name</p>
                    </div>
                  </button>
                </div>
              )}

              {swapMode === "describe" && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-card border border-border rounded-xl shadow-xl p-3 z-50 animate-fade-in" onClick={(e) => e.stopPropagation()}>
                  <p className="text-[11px] font-medium text-foreground mb-2">What are you looking for instead?</p>
                  <input
                    type="text"
                    autoFocus
                    value={swapText}
                    onChange={(e) => setSwapText(e.target.value)}
                    placeholder="e.g. a rooftop bar instead"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && swapText.trim()) handleDescribeSwap();
                      if (e.key === "Escape") { setSwapMode(null); setSwapText(""); }
                    }}
                  />
                  <div className="flex justify-end mt-2 gap-2">
                    <button onClick={(e) => { e.stopPropagation(); setSwapMode(null); setSwapText(""); }} className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1">Cancel</button>
                    <button onClick={(e) => { e.stopPropagation(); handleDescribeSwap(); }} disabled={!swapText.trim()} className="text-[10px] font-medium text-white bg-[#0D9488] hover:bg-[#0D9488]/90 px-3 py-1 rounded-md">Find</button>
                  </div>
                </div>
              )}

              {swapMode === "custom" && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-card border border-border rounded-xl shadow-xl p-3 z-50 animate-fade-in" onClick={(e) => e.stopPropagation()}>
                  <p className="text-[11px] font-medium text-foreground mb-2">{swapLoading ? "Looking up place..." : "Enter the place name"}</p>
                  <input
                    type="text"
                    autoFocus
                    value={swapText}
                    onChange={(e) => setSwapText(e.target.value)}
                    placeholder="e.g. Potato Head Beach Club"
                    disabled={swapLoading}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && swapText.trim()) handleCustomSwap();
                      if (e.key === "Escape") { setSwapMode(null); setSwapText(""); }
                    }}
                  />
                  <div className="flex justify-end mt-2 gap-2">
                    <button onClick={(e) => { e.stopPropagation(); if (!swapLoading) { setSwapMode(null); setSwapText(""); } }} className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1">Cancel</button>
                    <button onClick={(e) => { e.stopPropagation(); handleCustomSwap(); }} disabled={!swapText.trim() || swapLoading} className="text-[10px] font-medium text-white bg-[#0D9488] hover:bg-[#0D9488]/90 px-3 py-1 rounded-md disabled:opacity-50 inline-flex items-center gap-1">
                      {swapLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                      {swapLoading ? "Searching..." : "Replace"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Title — description hidden in collapsed view (shown when expanded) */}
          <div className="cursor-pointer" onClick={() => setExpanded((e) => !e)}>
            <h4 className="text-[15px] font-semibold text-foreground leading-snug tracking-tight">
              {activity.title}
            </h4>
          </div>

          {/* Meta row — time / duration only (rating moves to expanded view) */}
          <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground font-mono tabular-nums">
            {activity.start_time && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-muted-foreground/60" />
                {activity.start_time}
              </span>
            )}
            {activity.duration_minutes != null && (
              <span>{activity.duration_minutes}min</span>
            )}
          </div>

          {/* Footer row — pricing anchor + booking CTA */}
          <div className="mt-3 pt-3 border-t border-border flex items-end justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium">Per person</span>
              {(() => {
                const amount = activity.estimated_cost_per_person;
                if (!amount) {
                  return <span className="text-[14px] font-semibold text-[#0D9488] tabular-nums">Free</span>;
                }
                const code = activity.currency || "USD";
                if (costFormatter) {
                  const primary = costFormatter.primary(amount);
                  const secondary = costFormatter.secondary(amount);
                  return (
                    <div className="flex flex-col">
                      <span className="text-[14px] font-semibold text-foreground font-mono tabular-nums leading-tight">{primary}</span>
                      {secondary && <span className="text-[10px] font-mono text-muted-foreground/70 mt-0.5 tabular-nums">{secondary}</span>}
                    </div>
                  );
                }
                return <span className="text-[14px] font-semibold text-foreground font-mono tabular-nums">{`~${code}${amount}`}</span>;
              })()}
            </div>

            {(() => {
              const gygEligible = isGetYourGuideEligible(activity);
              const partner = (activity as any).booking_partner as string | null | undefined;
              const showRealBooking = !!activity.booking_url && partner && partner !== "google_maps" && !gygEligible;
              if (gygEligible) {
                return (
                  <a
                    href={buildGetYourGuideUrl(activity.title, destinationName)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#0D9488] text-white hover:bg-[#0D9488]/90 transition-colors shadow-[0_4px_14px_-4px_rgba(13,148,136,0.5)] whitespace-nowrap"
                  >
                    Book on GetYourGuide <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                );
              }
              if (showRealBooking) {
                return (
                  <a
                    href={activity.booking_url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#0D9488] text-white hover:bg-[#0D9488]/90 transition-colors shadow-[0_4px_14px_-4px_rgba(13,148,136,0.5)] whitespace-nowrap"
                  >
                    Book <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                );
              }
              return null;
            })()}
          </div>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border bg-muted/30 animate-fade-in">
          {/* Rating row — surfaced only when expanded */}
          {displayRating != null && (
            <div className="px-4 pt-3 flex items-center gap-2 text-[11px] text-muted-foreground font-mono tabular-nums">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              <span className="text-foreground/80 font-semibold">{displayRating.toFixed(1)}</span>
              {totalRatings != null && <span className="text-muted-foreground/60">({totalRatings} reviews)</span>}
            </div>
          )}

          {activity.description && (
            <div className="px-4 pt-3 pb-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                {activity.description}
              </p>
            </div>
          )}

          {activity.tips && (
            <div className="mx-4 mb-3 border-l-2 border-primary/50 pl-3 py-2 bg-primary/5 rounded-r-lg">
              <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                <Lightbulb className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                <span><span className="font-semibold text-primary mr-1">Tip:</span><span className="text-foreground/80">{activity.tips}</span></span>
              </p>
            </div>
          )}

          {activity.dietary_notes && (
            <div className="px-4 pb-3">
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#0D9488]/10 text-[#0D9488] inline-flex items-center gap-1">
                <Leaf className="h-2.5 w-2.5" /> {activity.dietary_notes}
              </span>
            </div>
          )}

          {isLoading ? (
            <div className="px-4 pb-3 space-y-1.5">
              <Skeleton className="h-14 w-full rounded-lg" />
            </div>
          ) : reviews.length > 0 ? (
            <div className="px-4 pb-3 space-y-2">
              {reviews.map((review, i) => (
                <div key={i} className="flex gap-2 p-2.5 rounded-lg bg-background border border-border">
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
                      {review.time && <span className="text-[10px] text-muted-foreground">{review.time}</span>}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">{review.text}</p>
                  </div>
                </div>
              ))}
              <p className="text-[9px] text-muted-foreground/60">Photos & reviews from Google</p>
            </div>
          ) : null}

          {mapsLink && (
            <div className="px-4 pb-3 flex flex-wrap items-center gap-3 text-[11px]">
              <a
                href={mapsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 flex items-center gap-0.5 transition-colors"
              >
                View on Maps <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>
          )}

          {planId && actKey && (
            <div className="border-t border-border">
              {!isDraft && <ActivityReactions planId={planId} activityKey={actKey} />}
              <ActivityComments planId={planId} activityKey={actKey} isDraft={isDraft} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
