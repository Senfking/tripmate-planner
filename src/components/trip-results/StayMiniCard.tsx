import { MapPin } from "lucide-react";
import { useGooglePlaceDetails } from "@/hooks/useGooglePlaceDetails";

interface Props {
  name: string;
  hotelName?: string;
  fallbackHero?: string | null;
  dayLabel: string;
  nightCount: number;
  onClick: () => void;
}

/** Mini destination card for the "Where you'll stay" carousel.
 *  Resolves a hero image with this priority:
 *    1. fallbackHero (already-resolved photo from accommodation/alts/activities)
 *    2. Google Places lookup of the hotel name + city
 *    3. Google Places lookup of just the city/destination (last resort) */
export function StayMiniCard({ name, hotelName, fallbackHero, dayLabel, nightCount, onClick }: Props) {
  const hotelDetails = useGooglePlaceDetails(hotelName || "", name);
  const cityDetails = useGooglePlaceDetails(name, "");

  const hero =
    fallbackHero ||
    hotelDetails.photos[0] ||
    cityDetails.photos[0] ||
    null;

  return (
    <button
      onClick={onClick}
      className="snap-start shrink-0 w-[220px] h-[150px] relative overflow-hidden rounded-2xl border border-border bg-muted text-left group shadow-sm hover:shadow-md transition-shadow"
    >
      {hero ? (
        <img
          src={hero}
          alt={name}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-3 text-white">
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="text-[14px] font-semibold truncate">{name}</span>
        </div>
        <p className="text-[11px] text-white/85 mt-0.5">
          {dayLabel} · {nightCount} {nightCount === 1 ? "night" : "nights"}
        </p>
      </div>
    </button>
  );
}
