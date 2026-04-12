import { useCallback, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getCategoryColor, getCategoryIcon } from "./categoryColors";
import { useGooglePlaceDetails } from "@/hooks/useGooglePlaceDetails";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Clock, ExternalLink } from "lucide-react";
import type { AITripResult, AIDay, AIActivity } from "./useResultsState";

interface Props {
  result: AITripResult;
  activeDayIndex: number;
  allDays: AIDay[];
  mode: "overview" | "day";
  refinedCoords?: Map<string, { lat: number; lng: number }>;
  onPinClick?: (dayDate: string, activityIndex: number) => void;
}

/* ── Minimal premium pin ── */
function createPinIcon(num: number, color: string) {
  return L.divIcon({
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
    html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:2.5px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.25);cursor:pointer;">
      <span style="font-size:11px;font-weight:700;color:white;font-family:Inter,system-ui,sans-serif;">${num}</span>
    </div>`,
  });
}

/* ── React popup with real Google images ── */
function PopupContent({ activity }: { activity: AIActivity }) {
  const { photos, rating, isLoading } = useGooglePlaceDetails(
    activity.title || "",
    activity.location_name || ""
  );
  const color = getCategoryColor(activity.category);
  const IconComponent = getCategoryIcon(activity.category);
  const heroSrc = photos.length > 0 ? photos[0] : null;
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((activity.title || '') + ' ' + (activity.location_name || ''))}`;

  const durationHrs = activity.duration_minutes ? Math.floor(activity.duration_minutes / 60) : 0;
  const durationMins = activity.duration_minutes ? activity.duration_minutes % 60 : 0;
  const durationLabel = activity.duration_minutes
    ? (durationHrs > 0 ? `${durationHrs}h` : "") + (durationMins > 0 ? ` ${durationMins}m` : "")
    : null;

  return (
    <div className="w-[260px] max-h-[380px] overflow-y-auto font-sans">
      {/* Hero image */}
      {isLoading ? (
        <Skeleton className="w-full h-[120px] rounded-none" />
      ) : heroSrc ? (
        <img
          src={heroSrc}
          alt={activity.title}
          className="w-full h-[120px] object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        <div className="w-full h-[50px] flex items-center justify-center" style={{ background: `${color}15` }}>
          <IconComponent className="h-5 w-5" style={{ color }} />
        </div>
      )}

      <div className="p-3 space-y-2.5">
        {/* Category badge + rating */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-white shrink-0"
            style={{ background: color }}
          >
            {activity.category}
          </span>
          {rating != null && (
            <span className="text-[10px] text-amber-600 font-semibold ml-auto">★ {rating.toFixed(1)}</span>
          )}
        </div>

        {/* Title */}
        <h4 className="text-sm font-bold text-foreground leading-snug">{activity.title}</h4>

        {/* Location */}
        {activity.location_name && (
          <p className="text-[11px] text-muted-foreground flex items-start gap-1">
            <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
            <span>{activity.location_name}</span>
          </p>
        )}

        {/* Time & duration row */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          {activity.start_time && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {activity.start_time}
            </span>
          )}
          {durationLabel && (
            <span className="flex items-center gap-1">
              ⏱ {durationLabel.trim()}
            </span>
          )}
        </div>

        {/* Description — full text, no clamp */}
        {activity.description && (
          <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
            {activity.description}
          </p>
        )}

        {/* Tips */}
        {activity.tips && (
          <p className="text-[10px] text-primary/70 leading-relaxed italic">
            💡 {activity.tips}
          </p>
        )}

        {/* Dietary notes */}
        {activity.dietary_notes && (
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            🍽 {activity.dietary_notes}
          </p>
        )}

        {/* Cost + Maps link */}
        <div className="flex items-center justify-between pt-2 border-t border-border/40">
          {activity.estimated_cost_per_person != null ? (
            <span className="text-[11px] font-semibold text-emerald-600">
              ~{activity.currency}{Math.round(activity.estimated_cost_per_person).toLocaleString()}/person
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground/50">No cost estimate</span>
          )}
          <a
            href={mapsLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-0.5"
          >
            Maps <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Booking link */}
        {activity.booking_url && (
          <a
            href={activity.booking_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-[11px] font-semibold text-white py-1.5 rounded-lg mt-1"
            style={{ background: color }}
          >
            Book this →
          </a>
        )}
      </div>
    </div>
  );
}

/* ── Map controller ── */
function MapController({
  result,
  activeDayIndex,
  allDays,
  mode,
}: Omit<Props, "onPinClick">) {
  const map = useMap();

  useEffect(() => {
    if (mode === "overview" || activeDayIndex < 0) {
      const points = allDays
        .flatMap((d) => d.activities)
        .filter((a) => a.latitude != null && a.longitude != null)
        .map((a) => [a.latitude!, a.longitude!] as [number, number]);

      if (points.length > 1) {
        map.fitBounds(L.latLngBounds(points.map((p) => L.latLng(p[0], p[1]))), {
          padding: [50, 50],
          animate: true,
        });
      } else if (points.length === 1) {
        map.setView(points[0], 12, { animate: true });
      } else {
        map.setView(
          [result.map_center.lat, result.map_center.lng],
          result.map_zoom || 6,
          { animate: true }
        );
      }
      return;
    }

    const day = allDays[activeDayIndex];
    if (!day) return;

    const points = day.activities
      .filter((a) => a.latitude != null && a.longitude != null)
      .map((a) => [a.latitude!, a.longitude!] as [number, number]);

    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 14, { animate: true });
    } else {
      map.fitBounds(L.latLngBounds(points.map((p) => L.latLng(p[0], p[1]))), {
        padding: [40, 40],
        animate: true,
      });
    }
  }, [mode, activeDayIndex, allDays, result, map]);

  return null;
}

/* ── Main component ── */
export function ResultsMap({ result, activeDayIndex, allDays, mode, refinedCoords, onPinClick }: Props) {
  const hasValidCenter = result?.map_center && typeof result.map_center.lat === "number";

  const getCoords = useCallback((dayDate: string, idx: number, a: AIActivity) => {
    const key = `${dayDate}-${idx}`;
    const refined = refinedCoords?.get(key);
    if (refined) return { lat: refined.lat, lng: refined.lng };
    if (a.latitude != null && a.longitude != null) return { lat: a.latitude, lng: a.longitude };
    return null;
  }, [refinedCoords]);

  const activitiesForMap = useMemo(() => {
    if (!hasValidCenter) return [];
    try {
      if (mode === "day" && activeDayIndex >= 0 && allDays[activeDayIndex]) {
        return allDays[activeDayIndex].activities
          .map((a, i) => {
            const coords = getCoords(allDays[activeDayIndex].date, i, a);
            if (!coords) return null;
            return { ...a, latitude: coords.lat, longitude: coords.lng, _dayDate: allDays[activeDayIndex].date, _idx: i };
          })
          .filter(Boolean) as (AIActivity & { _dayDate: string; _idx: number })[];
      }

      const all: (AIActivity & { _dayDate: string; _idx: number })[] = [];
      for (const day of allDays) {
        day.activities.forEach((a, i) => {
          const coords = getCoords(day.date, i, a);
          if (coords) {
            all.push({ ...a, latitude: coords.lat, longitude: coords.lng, _dayDate: day.date, _idx: i });
          }
        });
      }
      return all;
    } catch {
      return [];
    }
  }, [mode, activeDayIndex, allDays, hasValidCenter, getCoords]);

  const polylinePositions = useMemo(
    () =>
      activitiesForMap
        .filter((a) => a.latitude && a.longitude)
        .map((a) => [a.latitude!, a.longitude!] as [number, number]),
    [activitiesForMap]
  );

  if (!hasValidCenter) {
    return <div className="h-full w-full bg-accent" />;
  }

  return (
    <MapContainer
      center={[result.map_center.lat, result.map_center.lng]}
      zoom={result.map_zoom || 6}
      className="h-full w-full"
      zoomControl={false}
      attributionControl={false}
      style={{ background: "hsl(var(--accent))" }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
      />
      <MapController
        result={result}
        activeDayIndex={activeDayIndex}
        allDays={allDays}
        mode={mode}
      />

      {polylinePositions.length > 1 && (
        <Polyline
          positions={polylinePositions}
          pathOptions={{
            color: "hsl(var(--primary))",
            weight: 2.5,
            opacity: 0.5,
            dashArray: "6 4",
          }}
        />
      )}

      {activitiesForMap.map((act) => (
        <Marker
          key={`${act._dayDate}-${act._idx}`}
          position={[act.latitude!, act.longitude!]}
          icon={createPinIcon(act._idx + 1, getCategoryColor(act.category))}
        >
          <Popup closeButton className="premium-map-popup" maxWidth={260} minWidth={240}>
            <PopupContent activity={act} />
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
