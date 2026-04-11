import { useState } from "react";
import { Star, ExternalLink, Hotel } from "lucide-react";
import { useGooglePlaceDetails } from "@/hooks/useGooglePlaceDetails";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  name: string;
  stars: number;
  pricePerNight: number;
  currency: string;
  bookingUrl?: string;
  locationHint?: string;
}

export function AccommodationCard({ name, stars, pricePerNight, currency, bookingUrl, locationHint }: Props) {
  const { photos, rating, totalRatings, isLoading } = useGooglePlaceDetails(name, locationHint || "");
  const [imgError, setImgError] = useState(false);
  const heroSrc = !imgError && photos.length > 0 ? photos[0] : null;

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
        <div className="flex items-center gap-2 mt-1.5">
          <div className="flex">
            {Array.from({ length: stars }).map((_, i) => (
              <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
            ))}
          </div>
          {rating != null && (
            <span className="text-[11px] text-muted-foreground font-mono">
              {rating.toFixed(1)} {totalRatings ? `(${totalRatings})` : ""}
            </span>
          )}
          <span className="text-muted-foreground/30">·</span>
          <span className="text-xs text-foreground font-mono font-medium">
            {currency}{pricePerNight}/night
          </span>
        </div>
        {bookingUrl && (
          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 mt-2.5 transition-colors font-medium"
          >
            Book on Booking.com <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>
    </div>
  );
}
