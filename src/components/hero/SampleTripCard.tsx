import { useNavigate } from "react-router-dom";
import type { SampleTrip } from "./sampleTrips";

// Single sample-trip card. Photo on top (16:9, no text overlay per spec),
// title + tag pills below. Click navigates to /trips/sample/:id — the
// route handler itself is out of scope for this PR.
export function SampleTripCard({ trip }: { trip: SampleTrip }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate(`/trips/sample/${trip.id}`)}
      className="group flex flex-col text-left bg-card rounded-2xl shadow-sm border border-border overflow-hidden hover:shadow-md transition-shadow w-full"
    >
      <div className="aspect-video w-full overflow-hidden bg-muted">
        <img
          src={trip.image}
          alt={trip.title}
          loading="lazy"
          className="h-full w-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
        />
      </div>
      <div className="px-4 pt-3 pb-4">
        <h3 className="text-[15px] font-semibold text-foreground leading-snug">
          {trip.title}
        </h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {trip.tags.map((tag) => (
            <span
              key={tag}
              className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-muted text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}
