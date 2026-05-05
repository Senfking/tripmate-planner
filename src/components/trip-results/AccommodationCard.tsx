import { useState, useEffect, useRef } from "react";
import { Star, ExternalLink, Hotel, MapPin, Lightbulb, ArrowLeftRight, X } from "lucide-react";
import { useGooglePlaceDetails } from "@/hooks/useGooglePlaceDetails";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent } from "@/components/ui/sheet";

type PriceLevel =
  | "PRICE_LEVEL_FREE"
  | "PRICE_LEVEL_INEXPENSIVE"
  | "PRICE_LEVEL_MODERATE"
  | "PRICE_LEVEL_EXPENSIVE"
  | "PRICE_LEVEL_VERY_EXPENSIVE";

interface Props {
  name: string;
  description?: string | null;
  proTip?: string | null;
  photos?: string[];
  rating?: number | null;
  userRatingCount?: number | null;
  priceLevel?: PriceLevel | null;
  priceRange?: string | null;
  neighborhood?: string | null;
  googleMapsUrl?: string | null;
  bookingUrl?: string | null;
  bookingPartner?: string | null;
  locationHint?: string;
  /** ISO yyyy-MM-dd. Pre-fills checkin/checkout on Booking.com so users
   *  don't have to re-enter the trip's dates after clicking "Book". */
  checkInDate?: string | null;
  checkOutDate?: string | null;
  /** Up to 5 alternative hotels for this leg (same shape as the chosen
   *  hotel). When non-empty, SWAP opens an in-app alternatives panel.
   *  When empty/undefined, the SWAP button is hidden. */
  alternatives?: any[];
  /** Called when the user picks an alternative. Parent persists the swap
   *  to ai_trip_plans.result. */
  onSwap?: (newHotel: any) => void;
}

const PRICE_LABELS: Record<PriceLevel, { dollars: string; label: string }> = {
  PRICE_LEVEL_FREE:           { dollars: "",     label: "Free" },
  PRICE_LEVEL_INEXPENSIVE:    { dollars: "$",    label: "Budget" },
  PRICE_LEVEL_MODERATE:       { dollars: "$$",   label: "Mid-range" },
  PRICE_LEVEL_EXPENSIVE:      { dollars: "$$$",  label: "Upscale" },
  PRICE_LEVEL_VERY_EXPENSIVE: { dollars: "$$$$", label: "Luxury" },
};

const PARTNER_LABELS: Record<string, string> = {
  booking: "Booking.com",
  viator: "Viator",
  getyourguide: "GetYourGuide",
  google_maps: "Google Maps",
  event_direct: "Official site",
};

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

export function AccommodationCard({
  name,
  description,
  proTip,
  photos: providedPhotos,
  rating: providedRating,
  userRatingCount: providedReviews,
  priceLevel,
  priceRange,
  neighborhood,
  googleMapsUrl,
  bookingUrl,
  bookingPartner,
  locationHint,
  checkInDate,
  checkOutDate,
  alternatives = [],
  onSwap,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const swapPopoverRef = useRef<HTMLDivElement>(null);
  const hasAlternatives = Array.isArray(alternatives) && alternatives.length > 0;

  // Close swap popover on outside click
  useEffect(() => {
    if (!swapOpen) return;
    const handler = (e: MouseEvent) => {
      if (swapPopoverRef.current && !swapPopoverRef.current.contains(e.target as Node)) {
        setSwapOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [swapOpen]);

  // Only fetch from Google Places hook when we don't already have photo/rating
  // data from the backend (saves a round-trip on freshly built trips).
  const hasBackendMedia = (providedPhotos?.length ?? 0) > 0;
  const placeDetails = useGooglePlaceDetails(name, locationHint || "");

  const photos = hasBackendMedia ? providedPhotos! : placeDetails.photos;
  const rating = providedRating ?? placeDetails.rating;
  const reviewCount = providedReviews ?? placeDetails.totalRatings;
  const reviews = placeDetails.reviews;
  const isLoading = !hasBackendMedia && placeDetails.isLoading;
  const heroSrc = !imgError && photos.length > 0 ? photos[0] : null;

  // Resolve primary CTA: real booking partner > Google Maps fallback.
  const hasBooking = !!bookingUrl && !!bookingPartner && bookingPartner !== "google_maps";
  const partnerLabel = bookingPartner ? PARTNER_LABELS[bookingPartner] ?? bookingPartner : null;

  // Append trip dates to the booking URL when available so the partner's
  // search is pre-filled. Currently only Booking.com is wired (and the only
  // partner whose URL accepts checkin/checkout query params); other partners
  // would need their own param mapping.
  //
  // Skip this rewrite when the URL is an Awin tracking link (awin1.com/cread.php):
  // the destination Booking.com URL is encoded inside the `ued` param, so
  // appending checkin/checkout to the outer URL would set them on awin1.com
  // (where they're meaningless) instead of on Booking.com itself, breaking
  // date pre-fill on click. The backend already bakes trip dates into the
  // inner destination URL before wrapping, so no rewrite is needed here.
  const bookingUrlWithDates = (() => {
    if (!hasBooking) return bookingUrl ?? null;
    if (!checkInDate || !checkOutDate) return bookingUrl ?? null;
    if (bookingPartner !== "booking") return bookingUrl ?? null;
    try {
      const url = new URL(bookingUrl!);
      if (url.hostname.endsWith("awin1.com")) return bookingUrl!;
      if (!url.searchParams.has("checkin")) url.searchParams.set("checkin", checkInDate);
      if (!url.searchParams.has("checkout")) url.searchParams.set("checkout", checkOutDate);
      return url.toString();
    } catch {
      return bookingUrl ?? null;
    }
  })();

  // Resolve price display — never render currency without an amount.
  const priceLabel = (() => {
    if (priceRange && priceRange.trim()) return priceRange.trim();
    if (priceLevel && PRICE_LABELS[priceLevel]) {
      const p = PRICE_LABELS[priceLevel];
      return p.dollars ? `${p.dollars} · ${p.label}` : p.label;
    }
    return null;
  })();

  const descIsLong = (description?.length || 0) > 120;

  // Booking.com search URL for the destination, pre-filled with trip dates,
  // so users can browse alternative stays in the same area.
  // Fallback Google Maps search URL when backend didn't provide one
  // (e.g. second-leg hotels that haven't fully resolved yet).
  const mapsUrl = googleMapsUrl
    ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      [name, locationHint || neighborhood].filter(Boolean).join(" ")
    )}`;

  const browseAlternativesUrl = (() => {
    const cityQuery = (locationHint || neighborhood || name).trim();
    const params = new URLSearchParams();
    params.set("ss", cityQuery);
    if (checkInDate) params.set("checkin", checkInDate);
    if (checkOutDate) params.set("checkout", checkOutDate);
    return `https://www.booking.com/searchresults.html?${params.toString()}`;
  })();


  return (
    <div
      id={`section-stay-${(locationHint || name).replace(/\s+/g, "-")}`}
      className="group mx-4 mb-4 rounded-2xl border border-border bg-card shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-[box-shadow,transform] duration-300 relative overflow-hidden isolate"
    >
      {/* Cinematic banner — image scales inside a clipped container so corners stay rounded mid-hover */}
      <div
        className="w-full h-[280px] sm:h-[340px] bg-muted relative cursor-pointer overflow-hidden rounded-t-2xl [contain:paint] [clip-path:inset(0_round_1rem_1rem_0_0)]"
        onClick={() => setExpanded((e) => !e)}
      >
        {isLoading ? (
          <Skeleton className="absolute inset-0 w-full h-full rounded-none" />
        ) : heroSrc ? (
          <img
            src={heroSrc}
            alt={name}
            className="absolute inset-0 block h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-primary/5">
            <Hotel className="h-12 w-12 text-primary/30" />
          </div>
        )}

        {/* Layered gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-[hsl(180_25%_8%)]/95 via-[hsl(180_25%_8%)]/30 to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(13,148,136,0.18),_transparent_55%)] pointer-events-none" />

        {/* Top-left: Stay chip */}
        <div className="absolute top-3 left-3">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold uppercase tracking-[0.15em] text-white bg-white/10 backdrop-blur-md ring-1 ring-white/20">
            <Hotel className="h-2.5 w-2.5" /> Your Stay
          </span>
        </div>

        {/* Top-right: Swap button — only when alternatives exist */}
        {hasAlternatives && (
          <div className="absolute top-3 right-3 z-20">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setSwapOpen((o) => !o);
              }}
              className="text-[10px] font-mono font-semibold uppercase tracking-[0.15em] px-2.5 py-1 rounded-full transition-all bg-white/15 backdrop-blur-md text-white border border-white/25 hover:bg-white/25 flex items-center gap-1"
            >
              <ArrowLeftRight className="h-3 w-3" /> {swapOpen ? "Close" : "Swap"}
            </button>
          </div>
        )}

        {/* Bottom: name + meta over the image */}
        <div className="absolute inset-x-0 bottom-0 px-4 pb-4 pt-12 pointer-events-none">
          <h4 className="text-[22px] sm:text-[26px] font-semibold text-white leading-tight tracking-tight drop-shadow-md">
            {name}
          </h4>
          {neighborhood && (
            <div className="flex items-center gap-1 mt-1.5 text-[11px] text-white/80">
              <MapPin className="h-3 w-3" />
              <span className="truncate font-mono uppercase tracking-wider">{neighborhood}</span>
            </div>
          )}
          <div className="flex items-center gap-2.5 mt-2 flex-wrap">
            {rating != null && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 backdrop-blur-md ring-1 ring-white/15">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <span className="text-[11px] text-white font-mono font-semibold tabular-nums">
                  {rating.toFixed(1)}
                </span>
                {reviewCount ? (
                  <span className="text-[10px] text-white/60 font-mono tabular-nums">
                    ({reviewCount.toLocaleString()})
                  </span>
                ) : null}
              </div>
            )}
            {priceLabel && (
              <span className="text-[11px] text-[#5EEAD4] font-mono font-medium uppercase tracking-wider">
                {priceLabel}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Inline alternatives panel — full card width, between hero and actions */}
      {swapOpen && hasAlternatives && (
        <div
          ref={swapPopoverRef}
          className="border-t border-border bg-card px-3.5 py-3 animate-fade-in relative"
        >
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.15em] text-foreground">
              Swap this stay · {alternatives.length} options
            </p>
            <button
              onClick={() => setSwapOpen(false)}
              aria-label="Close swap panel"
              className="h-9 w-9 -mr-1 inline-flex items-center justify-center rounded-full bg-[#0D9488] text-white shadow-md hover:bg-[#0D9488]/90 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
            {alternatives.map((alt: any, i: number) => {
              const altName = alt.title || alt.name || "Hotel";
              const altPhoto = Array.isArray(alt.photos) && alt.photos.length > 0 ? alt.photos[0] : null;
              const altRating = alt.rating ?? null;
              const altPriceLevel = alt.price_level as PriceLevel | null | undefined;
              const altPriceDollars = altPriceLevel ? PRICE_LABELS[altPriceLevel]?.dollars : null;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    onSwap?.(alt);
                    setSwapOpen(false);
                  }}
                  className="snap-start shrink-0 w-[180px] text-left rounded-xl border border-border bg-background hover:border-[#0D9488]/60 hover:shadow-md transition-all overflow-hidden group/alt"
                >
                  <div className="relative h-[100px] w-full bg-muted overflow-hidden rounded-t-xl [clip-path:inset(0_round_0.75rem_0.75rem_0_0)]">
                    {altPhoto ? (
                      <img src={altPhoto} alt={altName} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover/alt:scale-[1.05]" loading="lazy" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-primary/5">
                        <Hotel className="h-6 w-6 text-primary/30" />
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-[12px] font-semibold text-foreground line-clamp-1">{altName}</p>
                    {alt.neighborhood && (
                      <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider line-clamp-1 mt-0.5">{alt.neighborhood}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1 text-[10px] font-mono tabular-nums">
                      {altRating != null && (
                        <span className="flex items-center gap-0.5 text-foreground/80">
                          <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                          {altRating.toFixed(1)}
                        </span>
                      )}
                      {altPriceDollars && (
                        <span className="text-[#0D9488] font-semibold">{altPriceDollars}</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-2 pt-2 border-t border-border/60 flex items-center justify-end">
            <a
              href={browseAlternativesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-muted-foreground hover:text-foreground font-mono uppercase tracking-wider inline-flex items-center gap-1"
            >
              Browse on Booking.com <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>
        </div>
      )}

      {/* Action row beneath hero */}
      {((hasBooking && bookingUrlWithDates) || googleMapsUrl) && (
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 font-mono uppercase tracking-wider transition-colors"
            >
              <MapPin className="h-3 w-3" /> View on Maps
            </a>
          ) : <span />}
          {hasBooking && bookingUrlWithDates && (
            <a
              href={bookingUrlWithDates}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 px-3.5 py-2 rounded-lg text-[11px] font-semibold bg-[#0D9488] text-white hover:bg-[#0D9488]/90 transition-colors shadow-[0_4px_14px_-4px_rgba(13,148,136,0.5)] whitespace-nowrap"
            >
              Book on {partnerLabel} <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      {/* Details Sheet — slides in from right (or bottom on mobile) */}
      <Sheet open={expanded} onOpenChange={setExpanded}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[480px] p-0 overflow-y-auto bg-background"
        >
          {/* Hero */}
          <div className="relative h-[260px] w-full bg-muted overflow-hidden">
            {heroSrc ? (
              <img src={heroSrc} alt={name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-primary/5">
                <Hotel className="h-12 w-12 text-primary/30" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[hsl(180_25%_8%)] via-[hsl(180_25%_8%)]/50 to-transparent" />
            <div className="absolute top-4 left-4">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold uppercase tracking-[0.15em] text-white bg-white/10 backdrop-blur-md ring-1 ring-white/20">
                <Hotel className="h-2.5 w-2.5" /> Your Stay
              </span>
            </div>
            <div className="absolute inset-x-0 bottom-0 px-4 pb-4">
              <h4 className="text-[22px] font-semibold text-white leading-tight tracking-tight drop-shadow-md">
                {name}
              </h4>
              {neighborhood && (
                <div className="flex items-center gap-1 mt-1.5 text-[11px] text-white/80">
                  <MapPin className="h-3 w-3" />
                  <span className="truncate font-mono uppercase tracking-wider">{neighborhood}</span>
                </div>
              )}
              <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                {rating != null && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 backdrop-blur-md ring-1 ring-white/15">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <span className="text-[11px] text-white font-mono font-semibold tabular-nums">{rating.toFixed(1)}</span>
                    {reviewCount ? (
                      <span className="text-[10px] text-white/60 font-mono tabular-nums">({reviewCount.toLocaleString()})</span>
                    ) : null}
                  </div>
                )}
                {priceLabel && (
                  <span className="text-[11px] text-[#5EEAD4] font-mono font-medium uppercase tracking-wider">{priceLabel}</span>
                )}
              </div>
            </div>
          </div>

          {/* Action row */}
          {((hasBooking && bookingUrlWithDates) || googleMapsUrl) && (
            <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-border">
              {mapsUrl ? (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 font-mono uppercase tracking-wider transition-colors"
                >
                  <MapPin className="h-3 w-3" /> View on Maps
                </a>
              ) : <span />}
              {hasBooking && bookingUrlWithDates && (
                <a
                  href={bookingUrlWithDates}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3.5 py-2 rounded-lg text-[11px] font-semibold bg-[#0D9488] text-white hover:bg-[#0D9488]/90 transition-colors shadow-[0_4px_14px_-4px_rgba(13,148,136,0.5)] whitespace-nowrap"
                >
                  Book on {partnerLabel} <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}

          {description && (
            <div className="px-4 pt-4 pb-2">
              <p className="text-sm text-foreground/80 leading-relaxed">{description}</p>
            </div>
          )}

          {proTip && (
            <div className="mx-4 mb-3 mt-2 border-l-2 border-primary/50 pl-3 py-2 bg-primary/5 rounded-r-lg">
              <p className="text-[12px] text-muted-foreground flex items-start gap-1.5">
                <Lightbulb className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                <span>
                  <span className="font-semibold text-primary mr-1">Tip:</span>
                  <span className="text-foreground/80">{proTip}</span>
                </span>
              </p>
            </div>
          )}

          {isLoading ? (
            <div className="px-4 pb-4 space-y-2">
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          ) : reviews.length > 0 ? (
            <div className="px-4 pb-4 space-y-2">
              <p className="text-[10px] font-mono font-semibold uppercase tracking-[0.15em] text-muted-foreground mt-2">What visitors say</p>
              {reviews.slice(0, 4).map((review, i) => (
                <div key={i} className="flex gap-2 p-2.5 rounded-lg bg-accent/40 border border-border">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 mt-0.5"
                    style={{ backgroundColor: `hsl(${(review.author.charCodeAt(0) * 37) % 360}, 55%, 55%)` }}
                  >
                    {review.author.charAt(0) || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-medium text-foreground">{review.author}</span>
                      <MiniStars rating={review.rating} />
                      {review.time && (
                        <span className="text-[10px] text-muted-foreground">{review.time}</span>
                      )}
                    </div>
                    <p className="text-[12px] text-muted-foreground leading-snug mt-0.5">
                      {review.text}
                    </p>
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground/60">Photos & reviews from Google</p>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
