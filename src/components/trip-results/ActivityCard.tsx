import { useState, useEffect, useRef, useCallback } from "react";
import { Star, ExternalLink, Trash2, ArrowLeftRight, MapPin, Sparkles, MessageSquare, PenLine, Lightbulb, Leaf, Loader2 } from "lucide-react";
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
  /** Trip's primary destination — used to scope GetYourGuide search results. */
  destinationName?: string | null;
  onRequestChange: () => void;
  onRequestDescribedChange: (description: string) => void;
  onCustomPlaceSwap: (placeName: string) => Promise<any>;
  onRemove: () => void;
  onCoordsRefined?: (lat: number, lng: number) => void;
  animDelay?: number;
  /** Formats per-person costs in user's profile currency (primary) plus
   *  destination currency (smaller subtitle). Optional — falls back to the
   *  legacy "~CCY{amount}" rendering when not provided. */
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

  // Subtle category tinting (teal-adjacent system) for chips & accents
  const cat = (activity.category || "").toLowerCase();
  const catTone: { bg: string; text: string; ring: string } = (() => {
    if (["food", "restaurant", "cafe"].includes(cat))
      return { bg: "bg-amber-50", text: "text-amber-800", ring: "ring-amber-200/60" };
    if (["culture", "museum", "history", "attraction"].includes(cat))
      return { bg: "bg-indigo-50", text: "text-indigo-800", ring: "ring-indigo-200/60" };
    if (["nature", "park", "activity"].includes(cat))
      return { bg: "bg-emerald-50", text: "text-emerald-800", ring: "ring-emerald-200/60" };
    if (["nightlife", "bar"].includes(cat))
      return { bg: "bg-fuchsia-50", text: "text-fuchsia-800", ring: "ring-fuchsia-200/60" };
    if (["adventure", "sport"].includes(cat))
      return { bg: "bg-rose-50", text: "text-rose-800", ring: "ring-rose-200/60" };
    if (["relaxation", "wellness", "spa"].includes(cat))
      return { bg: "bg-sky-50", text: "text-sky-800", ring: "ring-sky-200/60" };
    if (["shopping"].includes(cat))
      return { bg: "bg-orange-50", text: "text-orange-800", ring: "ring-orange-200/60" };
    return { bg: "bg-teal-50", text: "text-teal-800", ring: "ring-teal-200/60" };
  })();

  const catLabel = activity.category
    ? activity.category.charAt(0).toUpperCase() + activity.category.slice(1).toLowerCase()
    : null;

  const renderPrice = () => {
    const amount = activity.estimated_cost_per_person;
    if (!amount) {
      return (
        <div className="flex flex-col items-end">
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 font-medium">Cost</span>
          <span className="text-base font-mono font-semibold text-[#0D9488] tabular-nums leading-tight">Free</span>
        </div>
      );
    }
    const code = activity.currency || "USD";
    if (costFormatter) {
      const primary = costFormatter.primary(amount);
      const secondary = costFormatter.secondary(amount);
      return (
        <div className="flex flex-col items-end">
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 font-medium">Per person</span>
          <span className="text-base font-mono font-semibold text-foreground tabular-nums leading-tight">{primary}</span>
          {secondary && (
            <span className="text-[10px] font-mono text-muted-foreground/70 mt-0.5 tabular-nums">{secondary}</span>
          )}
        </div>
      );
    }
    return (
      <div className="flex flex-col items-end">
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 font-medium">Per person</span>
        <span className="text-base font-mono font-semibold text-foreground tabular-nums leading-tight">{`~${code}${amount}`}</span>
      </div>
    );
  };

  const renderBookButton = () => {
    const gygEligible = isGetYourGuideEligible(activity);
    const partner = (activity as any).booking_partner as string | null | undefined;
    const showRealBooking =
      !!activity.booking_url && partner && partner !== "google_maps" && !gygEligible;
    if (gygEligible) {
      return (
        <a
          href={buildGetYourGuideUrl(activity.title, destinationName)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-[#0D9488]/30 bg-[#0D9488]/5 text-[#0D9488] hover:bg-[#0D9488] hover:text-white transition-colors whitespace-nowrap"
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
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-[#0D9488]/30 bg-[#0D9488]/5 text-[#0D9488] hover:bg-[#0D9488] hover:text-white transition-colors whitespace-nowrap"
        >
          Book <ExternalLink className="h-2.5 w-2.5" />
        </a>
      );
    }
    return null;
  };

  return (
    <div
      data-activity-id={`${day.date}-${index}`}
      className="group mx-4 mb-3 rounded-2xl border border-border/60 bg-card overflow-hidden transition-all duration-300 animate-fade-in shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.15)] hover:-translate-y-0.5 relative"
      style={{ animationDelay: `${animDelay}ms` }}
    >
      <div className="flex flex-col sm:flex-row">
        {/* Hero image — larger, with subtle zoom on hover */}
        <div
          className="relative w-full sm:w-[40%] sm:max-w-[260px] sm:shrink-0 h-[180px] sm:h-auto sm:min-h-[180px] overflow-hidden bg-muted cursor-pointer"
          onClick={() => setExpanded((e) => !e)}
        >
          {isLoading ? (
            <Skeleton className="absolute inset-0 rounded-none" />
          ) : heroSrc ? (
            <img
              src={heroSrc}
              alt={activity.title}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${color}30, ${color}10)` }}
            >
              <IconComponent className="h-10 w-10 opacity-40" style={{ color }} />
            </div>
          )}
          {/* Gradient scrim for legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10 pointer-events-none" />
          {/* Pin number — refined glass pill */}
          <div className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-md text-white text-[10px] font-semibold tabular-nums">
            <span className="opacity-60">#</span>{index + 1}
          </div>
          {/* Junto Pick — bottom-left over image */}
          {activity.is_junto_pick && (
            <div className="absolute bottom-2.5 left-2.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white bg-[#0D9488] shadow-md">
                <Sparkles className="h-2.5 w-2.5" />
                Junto Pick
              </span>
            </div>
          )}
        </div>

        {/* Content side */}
        <div className="flex-1 min-w-0 p-4 sm:p-5 flex flex-col cursor-pointer" onClick={() => setExpanded((e) => !e)}>
          {/* Chips row */}
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            {catLabel && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ring-1 ${catTone.bg} ${catTone.text} ${catTone.ring}`}
              >
                <IconComponent className="h-2.5 w-2.5" />
                {catLabel}
              </span>
            )}
            {activity.start_time && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-muted text-foreground/70 tabular-nums">
                {activity.start_time}
              </span>
            )}
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-muted text-foreground/70 tabular-nums">
              {activity.duration_minutes}min
            </span>
            {displayRating != null && (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-800 ring-1 ring-amber-200/60">
                <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
                <span className="tabular-nums">{displayRating.toFixed(1)}</span>
              </span>
            )}
          </div>

          {/* Title — confident */}
          <h4 className="text-[15px] sm:text-base font-semibold text-foreground leading-snug tracking-tight">
            {activity.title}
          </h4>

          {/* Description */}
          {activity.description && (
            <p className="text-[12px] text-muted-foreground leading-relaxed mt-1.5 line-clamp-2">
              {activity.description}
            </p>
          )}

          {/* Spacer pushes price/CTA to bottom */}
          <div className="flex-1" />

          {/* Bottom row: price anchor + Book CTA */}
          <div className="mt-3 pt-3 border-t border-border/60 flex items-end justify-between gap-3">
            {renderPrice()}
            {renderBookButton()}
          </div>
        </div>
      </div>

      {/* Persistent action cluster — Delete + Swap, anchored to card top-right */}
      <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-20" ref={swapRef}>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label="Remove activity"
          className="p-1.5 rounded-lg shadow-md bg-card/90 backdrop-blur-md text-muted-foreground hover:text-destructive border border-border/80 hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSwapMode(swapMode === "menu" ? null : "menu");
            setSwapText("");
          }}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all shadow-md bg-card/90 backdrop-blur-md text-[#0D9488] border border-[#0D9488]/40 hover:bg-[#0D9488]/10 flex items-center gap-1"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" /> Swap
        </button>

        {/* Swap popovers — anchored to the action cluster, opening downward */}
        {swapMode === "menu" && (
          <div className="absolute right-0 top-full mt-1 w-56 bg-card border border-border rounded-xl shadow-xl p-1.5 z-50 animate-fade-in" onClick={(e) => e.stopPropagation()}>
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
              <button
                onClick={(e) => { e.stopPropagation(); setSwapMode(null); setSwapText(""); }}
                className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1"
              >
                Cancel
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDescribeSwap(); }}
                disabled={!swapText.trim()}
                className="text-[10px] font-medium text-primary-foreground bg-primary hover:bg-primary/90 px-3 py-1 rounded-md"
              >
                Find
              </button>
            </div>
          </div>
        )}

        {swapMode === "custom" && (
          <div className="absolute right-0 top-full mt-1 w-64 bg-card border border-border rounded-xl shadow-xl p-3 z-50 animate-fade-in" onClick={(e) => e.stopPropagation()}>
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
                if (e.key === "Enter" && swapText.trim()) handleCustomSwap();
                if (e.key === "Escape") { setSwapMode(null); setSwapText(""); }
              }}
            />
            <div className="flex justify-end mt-2 gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); if (!swapLoading) { setSwapMode(null); setSwapText(""); } }}
                className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1"
              >
                Cancel
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleCustomSwap(); }}
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

          {/* Secondary link — View on Maps. Booking CTA is persistent in the
              summary row's right column, so we don't repeat it here. */}
          {mapsLink && (
            <div className="px-3.5 pb-2 flex flex-wrap items-center gap-3 text-[11px]">
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

          {/* Reactions & Comments */}
          {planId && actKey && (
            <>
              {!isDraft && <ActivityReactions planId={planId} activityKey={actKey} />}
              <ActivityComments planId={planId} activityKey={actKey} isDraft={isDraft} />
            </>
          )}

          {/* Actions row removed — Delete + Swap are persistent on the hero,
              and Book is persistent in the summary's right column. Keeping
              CTAs in fixed locations prevents them from jumping when the
              user expands/collapses the card. */}
        </div>
      )}
    </div>
  );
}
