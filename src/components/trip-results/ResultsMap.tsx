import { useCallback, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getCategoryColor, getCategoryIcon } from "./categoryColors";
import { useGooglePlaceDetails } from "@/hooks/useGooglePlaceDetails";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Clock, ExternalLink, Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { AITripResult, AIDay, AIActivity } from "./useResultsState";

interface Props {
  result: AITripResult;
  activeDayIndex: number;
  allDays: AIDay[];
  mode: "overview" | "day";
  refinedCoords?: Map<string, { lat: number; lng: number }>;
  onPinClick?: (dayDate: string, activityIndex: number) => void;
  interactive?: boolean;
}

function formatDayLabel(date: string, dayNumber?: number): string {
  try {
    const parsed = parseISO(date);
    const dayStr = dayNumber ? `Day ${dayNumber}` : "";
    const dateStr = format(parsed, "EEE, MMM d");
    return dayStr ? `${dayStr} · ${dateStr}` : dateStr;
  } catch {
    return dayNumber ? `Day ${dayNumber}` : date;
  }
}

/* ── Minimal premium pin with day.activity label ── */
function createPinIcon(label: string, color: string) {
  const width = label.length > 2 ? 34 : 28;
  return L.divIcon({
    className: "",
    iconSize: [width, 28],
    iconAnchor: [width / 2, 14],
    popupAnchor: [0, -16],
    html: `<div style="min-width:28px;height:28px;padding:0 ${label.length > 2 ? 6 : 0}px;border-radius:14px;background:${color};border:2.5px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.25);cursor:pointer;">
      <span style="font-size:${label.length > 2 ? 9 : 11}px;font-weight:700;color:white;font-family:Inter,system-ui,sans-serif;white-space:nowrap;">${label}</span>
    </div>`,
  });
}

/* ── React popup with real Google images ── */
function PopupContent({ activity, dayLabel }: { activity: AIActivity; dayLabel?: string }) {
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

        {/* Day label */}
        {dayLabel && (
          <p className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {dayLabel}
          </p>
        )}

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
        <div className="flex items-center justify-between pt-2 border-t border-border">
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
            className="block text-center text-[11px] font-semibold py-1.5 rounded-lg mt-1 bg-primary hover:bg-primary/90 transition-colors"
            style={{ color: "#ffffff" }}
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
          // Generous padding so all destinations are clearly visible with breathing room.
          // Top padding accounts for the floating info card overlay on mobile.
          paddingTopLeft: [60, 180],
          paddingBottomRight: [60, 140],
          maxZoom: 13,
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
        paddingTopLeft: [50, 180],
        paddingBottomRight: [50, 140],
        maxZoom: 14,
        animate: true,
      });
    }
  }, [mode, activeDayIndex, allDays, result, map]);

  return null;
}

/* ── Main component ── */
export function ResultsMap({ result, activeDayIndex, allDays, mode, refinedCoords, onPinClick, interactive = true }: Props) {
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
        const day = allDays[activeDayIndex];
        return day.activities
          .map((a, i) => {
            const coords = getCoords(day.date, i, a);
            if (!coords) return null;
            return { ...a, latitude: coords.lat, longitude: coords.lng, _dayDate: day.date, _idx: i, _dayNumber: day.day_number };
          })
          .filter(Boolean) as (AIActivity & { _dayDate: string; _idx: number; _dayNumber: number })[];
      }

      const all: (AIActivity & { _dayDate: string; _idx: number; _dayNumber: number })[] = [];
      for (const day of allDays) {
        day.activities.forEach((a, i) => {
          const coords = getCoords(day.date, i, a);
          if (coords) {
            all.push({ ...a, latitude: coords.lat, longitude: coords.lng, _dayDate: day.date, _idx: i, _dayNumber: day.day_number });
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
    return <div className="h-full w-full bg-muted" />;
  }

  return (
    <MapContainer
      center={[result.map_center.lat, result.map_center.lng]}
      zoom={result.map_zoom || 6}
      className={`trip-results-map-root h-full w-full ${interactive ? "" : "pointer-events-none"}`}
      zoomControl={false}
      attributionControl={false}
      dragging={interactive}
      touchZoom={interactive}
      scrollWheelZoom={interactive}
      doubleClickZoom={interactive}
      boxZoom={interactive}
      keyboard={interactive}
      style={{ background: "hsl(var(--muted))", zIndex: 0, isolation: "isolate" }}
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

      <ActivityMarkers
        activitiesForMap={activitiesForMap}
        mode={mode}
      />
    </MapContainer>
  );
}

/* ── Markers with click-to-center behavior ── */
function ActivityMarkers({
  activitiesForMap,
  mode,
}: {
  activitiesForMap: (AIActivity & { _dayDate: string; _idx: number; _dayNumber: number })[];
  mode: "overview" | "day";
}) {
  const map = useMap();

  return (
    <>
      {activitiesForMap.map((act) => {
        const pinLabel = mode === "day"
          ? String(act._idx + 1)
          : `D${act._dayNumber}.${act._idx + 1}`;
        const dayLabel = formatDayLabel(act._dayDate, act._dayNumber);

        return (
          <Marker
            key={`${act._dayDate}-${act._idx}`}
            position={[act.latitude!, act.longitude!]}
            icon={createPinIcon(pinLabel, getCategoryColor(act.category))}
            eventHandlers={{
              click: () => {
                // Popup opens ABOVE the pin and can be up to ~400px tall. We want the popup
                // to sit fully inside the viewport, below the floating header card (~180px).
                // Strategy: push the pin into the lower portion of the screen so the popup
                // fills the upper portion without being clipped by the header.
                const targetZoom = Math.max(map.getZoom(), 14);
                const size = map.getSize();
                // Place the pin ~75% down the viewport (leaves ~75% of height above for popup).
                const pinScreenY = size.y * 0.78;
                const centerScreenY = size.y / 2;
                // Vertical pixel offset between desired pin position and current center.
                const dy = pinScreenY - centerScreenY;
                const point = map.project([act.latitude!, act.longitude!], targetZoom);
                // To move the pin DOWN on screen, shift the map center UP (smaller y).
                const adjusted = map.unproject([point.x, point.y - dy], targetZoom);
                map.setView(adjusted, targetZoom, { animate: true });
              },
            }}
          >
            <Popup closeButton className="premium-map-popup" maxWidth={260} minWidth={240}>
              <PopupContent activity={act} dayLabel={dayLabel} />
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

