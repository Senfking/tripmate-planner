import { useState } from "react";
import { Star, ExternalLink, Hotel, MapPin, Lightbulb, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { useGooglePlaceDetails } from "@/hooks/useGooglePlaceDetails";
import { Skeleton } from "@/components/ui/skeleton";

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
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [imgError, setImgError] = useState(false);

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

  return (
    <div
      id={`section-stay-${(locationHint || name).replace(/\s+/g, "-")}`}
      className="mx-4 mb-4 rounded-2xl border border-border overflow-hidden bg-card shadow-sm"
    >
      {/* Photo */}
      <div
        className="w-full h-[160px] bg-muted relative cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        {isLoading ? (
          <Skeleton className="w-full h-full rounded-none" />
        ) : heroSrc ? (
          <img
            src={heroSrc}
            alt={name}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-primary/5">
            <Hotel className="h-10 w-10 text-primary/30" />
          </div>
        )}
        <div className="absolute top-2 left-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider font-bold text-white bg-black/50 backdrop-blur-sm">
            <Hotel className="h-2.5 w-2.5" /> Stay
          </span>
        </div>
        {/* Persistent Swap button — top right, always visible */}
        <div className="absolute top-2 right-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              toast("Hotel swap coming soon", {
                description: "We're working on letting you swap stays. For now, click 'Book' to explore alternatives on Booking.com.",
              });
            }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all shadow-lg bg-card/90 backdrop-blur-sm text-[#0D9488] border border-[#0D9488]/40 hover:bg-[#0D9488]/10 flex items-center gap-1"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" /> Swap
          </button>
        </div>
      </div>

      {/* Summary row */}
      <div className="px-3.5 py-3 cursor-pointer" onClick={() => setExpanded((e) => !e)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-foreground leading-snug">{name}</h4>
            {neighborhood && (
              <div className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span className="truncate">{neighborhood}</span>
              </div>
            )}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {rating != null && (
                <div className="flex items-center gap-1">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  <span className="text-[11px] text-foreground font-mono font-medium">
                    {rating.toFixed(1)}
                  </span>
                  {reviewCount ? (
                    <span className="text-[11px] text-muted-foreground font-mono">
                      ({reviewCount.toLocaleString()})
                    </span>
                  ) : null}
                </div>
              )}
              {priceLabel && rating != null && (
                <span className="text-muted-foreground/30">·</span>
              )}
              {priceLabel && (
                <span className="text-[11px] text-muted-foreground font-mono">
                  {priceLabel}
                </span>
              )}
            </div>
          </div>

          {/* Persistent Booking CTA — always visible regardless of expand
              state so it never jumps. */}
          {hasBooking && bookingUrlWithDates && (
            <a
              href={bookingUrlWithDates}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#0D9488] text-white hover:bg-[#0D9488]/90 transition-colors shadow-sm"
            >
              Book on {partnerLabel} <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border animate-fade-in">
          {description && (
            <div className="px-3.5 pt-2.5 pb-2">
              <p className={`text-xs text-muted-foreground leading-relaxed ${!descExpanded && descIsLong ? "line-clamp-3" : ""}`}>
                {description}
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

          {proTip && (
            <div className="mx-3.5 mb-2 border-l-2 border-primary/50 pl-2.5 py-1 bg-primary/5 rounded-r-lg">
              <p className="text-[11px] text-muted-foreground flex items-start gap-1">
                <Lightbulb className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                <span>
                  <span className="font-semibold text-primary mr-1">Tip:</span>
                  <span className="text-foreground/80">{proTip}</span>
                </span>
              </p>
            </div>
          )}

          {/* Google Reviews */}
          {isLoading ? (
            <div className="px-3.5 pb-2.5 space-y-1.5">
              <Skeleton className="h-14 w-full rounded-lg" />
            </div>
          ) : reviews.length > 0 ? (
            <div className="px-3.5 pb-1 space-y-1.5">
              {reviews.slice(0, 2).map((review, i) => (
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

          {/* Footer links */}
          <div className="px-3.5 pb-3 pt-1 flex flex-wrap items-center gap-3 text-[11px]">
            {googleMapsUrl && (
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-primary hover:text-primary/80 flex items-center gap-0.5 transition-colors"
              >
                View on Maps <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
            {hasBooking && bookingUrlWithDates && (
              <a
                href={bookingUrlWithDates}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#0D9488] text-white hover:bg-[#0D9488]/90 transition-colors shadow-sm ml-auto"
              >
                Book on {partnerLabel} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
