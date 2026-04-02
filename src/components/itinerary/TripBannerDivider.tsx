import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { resolvePhoto } from "@/lib/tripPhoto";
import { useTripCoverUrl } from "@/hooks/useTripCoverUrl";

interface TripBannerProps {
  tripId: string;
  tripName: string;
  tripEmoji: string | null;
  tripStartDate: string | null;
  tripEndDate: string | null;
  tripDestination: string | null;
  tripCoverImagePath: string | null;
  /** Destination names from route stops for photo resolution fallback */
  routeStopDests: string[];
}

export function TripStartBanner({
  tripId,
  tripName,
  tripStartDate,
  tripEndDate,
  tripDestination,
  tripCoverImagePath,
  routeStopDests,
}: TripBannerProps) {
  const { data: signedUrl } = useTripCoverUrl(tripId, tripCoverImagePath);
  const fallbackPhoto = resolvePhoto(tripName, routeStopDests);
  const photoUrl = signedUrl || fallbackPhoto;

  const dateLabel = (() => {
    if (tripStartDate && tripEndDate) {
      return `${format(parseISO(tripStartDate), "d MMM")} – ${format(parseISO(tripEndDate), "d MMM yyyy")}`;
    }
    if (tripStartDate) return format(parseISO(tripStartDate), "d MMM yyyy");
    return null;
  })();

  return (
    <Link
      to={`/app/trips/${tripId}`}
      className="block mx-0 my-3 rounded-xl overflow-hidden active:scale-[0.98] transition-transform"
      style={{ height: 80 }}
    >
      <div className="relative w-full h-full">
        <img
          src={photoUrl}
          alt={tripName}
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to right, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.2) 100%)",
          }}
        />
        <div className="relative h-full flex flex-col justify-center pl-4 pr-4">
          <span className="text-[10px] font-semibold tracking-widest text-white/70 uppercase">
            Starting
          </span>
          <span className="text-[15px] font-bold text-white truncate">
            {tripName}
          </span>
          {dateLabel && (
            <span className="text-[12px] text-white/70">{dateLabel}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function TripEndBanner({
  tripId,
  tripName,
  tripCoverImagePath,
  routeStopDests,
}: TripBannerProps) {
  const { data: signedUrl } = useTripCoverUrl(tripId, tripCoverImagePath);
  const fallbackPhoto = resolvePhoto(tripName, routeStopDests);
  const photoUrl = signedUrl || fallbackPhoto;

  return (
    <Link
      to={`/app/trips/${tripId}`}
      className="block mx-0 my-3 rounded-xl overflow-hidden active:scale-[0.98] transition-transform"
      style={{ height: 48 }}
    >
      <div className="relative w-full h-full">
        <img
          src={photoUrl}
          alt={tripName}
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        <div
          className="absolute inset-0"
          style={{
            background: "rgba(0,0,0,0.7)",
          }}
        />
        <div className="relative h-full flex items-center pl-4">
          <span className="text-[10px] font-semibold tracking-widest text-white/60 uppercase">
            Trip ends
          </span>
        </div>
      </div>
    </Link>
  );
}
