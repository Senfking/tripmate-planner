import { useState } from "react";
import { Star, ExternalLink, Hotel, MapPin } from "lucide-react";
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

export function AccommodationCard({
  name,
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
}: Props) {
  // Only fetch from Google Places hook when we don't already have photo/rating
  // data from the backend (saves a round-trip on freshly built trips).
  const hasBackendMedia = (providedPhotos?.length ?? 0) > 0;
  const placeDetails = useGooglePlaceDetails(
    hasBackendMedia ? "" : name,
    locationHint || "",
  );
  const [imgError, setImgError] = useState(false);

  const photos = hasBackendMedia ? providedPhotos! : placeDetails.photos;
  const rating = providedRating ?? placeDetails.rating;
  const reviewCount = providedReviews ?? placeDetails.totalRatings;
  const isLoading = !hasBackendMedia && placeDetails.isLoading;
  const heroSrc = !imgError && photos.length > 0 ? photos[0] : null;

  // Resolve primary CTA: real booking partner > Google Maps fallback.
  const hasBooking = !!bookingUrl && !!bookingPartner && bookingPartner !== "google_maps";
  const partnerLabel = bookingPartner ? PARTNER_LABELS[bookingPartner] ?? bookingPartner : null;
  const ctaHref = hasBooking ? bookingUrl! : googleMapsUrl;
  const ctaLabel = hasBooking ? `Book on ${partnerLabel}` : "View on Google Maps";

  // Resolve price display — never render currency without an amount.
  const priceLabel = (() => {
    if (priceRange && priceRange.trim()) return priceRange.trim();
    if (priceLevel && PRICE_LABELS[priceLevel]) {
      const p = PRICE_LABELS[priceLevel];
      return p.dollars ? `${p.dollars} · ${p.label}` : p.label;
    }
    return null;
  })();

  return (
    <div className="mx-4 mb-4 rounded-xl border border-border overflow-hidden bg-card">
      {/* Photo */}
      <div className="w-full h-[140px] bg-muted relative">
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
      </div>

      {/* Details */}
      <div className="p-3.5">
        <h4 className="text-sm font-semibold text-foreground">{name}</h4>

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
            <span className="text-[11px] text-foreground font-mono font-medium">
              {priceLabel}
            </span>
          )}
        </div>

        {ctaHref && (
          <a
            href={ctaHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 mt-2.5 transition-colors font-medium"
          >
            {ctaLabel} <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>
    </div>
  );
}
