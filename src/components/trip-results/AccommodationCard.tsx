import { Star, ExternalLink, X } from "lucide-react";
import { getCategoryColor } from "./categoryColors";

interface Props {
  name: string;
  stars: number;
  pricePerNight: number;
  currency: string;
  bookingUrl?: string;
  onRemove?: () => void;
}

export function AccommodationCard({ name, stars, pricePerNight, currency, bookingUrl, onRemove }: Props) {
  const tealBg = getCategoryColor("accommodation");

  return (
    <div
      className="mx-4 mb-4 rounded-xl border border-border/40 p-4 relative overflow-hidden"
      style={{ background: `linear-gradient(135deg, rgba(13,148,136,0.08) 0%, #161920 60%)` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wider font-mono text-[#0D9488] mb-1">
            🏨 Accommodation
          </p>
          <h4 className="text-sm font-semibold text-foreground truncate">{name}</h4>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex">
              {Array.from({ length: stars }).map((_, i) => (
                <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
              ))}
            </div>
            <span className="text-xs text-muted-foreground font-mono">
              {currency}{pricePerNight}/night
            </span>
          </div>
          {bookingUrl && (
            <a
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground mt-2 transition-colors"
            >
              Book on Booking.com <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div
            className="w-16 h-16 rounded-lg flex-shrink-0"
            style={{ background: `linear-gradient(135deg, ${tealBg}40, ${tealBg}20)` }}
          />
          {onRemove && (
            <button
              onClick={onRemove}
              className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
            >
              <X className="h-3 w-3" /> Change
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
