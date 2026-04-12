import { useCallback, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Polyline, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getCategoryColor, CATEGORY_ICONS } from "./categoryColors";
import type { AITripResult, AIDay, AIActivity } from "./useResultsState";
import { renderToStaticMarkup } from "react-dom/server";

interface Props {
  result: AITripResult;
  activeDayIndex: number;
  allDays: AIDay[];
  mode: "overview" | "day";
  refinedCoords?: Map<string, { lat: number; lng: number }>;
  onPinClick?: (dayDate: string, activityIndex: number) => void;
}

function createPremiumIcon(num: number, color: string, category: string, photo?: string) {
  const IconComponent = CATEGORY_ICONS[category?.toLowerCase()];
  const iconSvg = IconComponent
    ? renderToStaticMarkup(
        // @ts-ignore
        <IconComponent size={12} color="white" strokeWidth={2.5} />
      )
    : "";

  const photoClip = photo
    ? `<img src="${photo}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;position:absolute;inset:0;" onerror="this.style.display='none'" />`
    : "";

  return L.divIcon({
    className: "",
    iconSize: [40, 48],
    iconAnchor: [20, 48],
    popupAnchor: [0, -48],
    html: `<div style="position:relative;width:40px;height:48px;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.25));">
      <svg width="40" height="48" viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 47L5.36 30.5C-1.12 22.5-1.12 10.5 5.36 4.5C11.84-1.5 28.16-1.5 34.64 4.5C41.12 10.5 41.12 22.5 34.64 30.5L20 47Z" fill="${color}" />
        <circle cx="20" cy="18" r="14" fill="${color}" />
        <circle cx="20" cy="18" r="13" fill="white" fill-opacity="0.15" />
      </svg>
      <div style="position:absolute;top:4px;left:4px;width:32px;height:32px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.2);">
        ${photoClip}
        <div style="position:relative;z-index:1;display:flex;align-items:center;justify-content:center;width:100%;height:100%;">
          <span style="font-size:13px;font-weight:800;color:white;font-family:Inter,system-ui,sans-serif;text-shadow:0 1px 2px rgba(0,0,0,0.3);${photo ? 'display:none' : ''}">${num}</span>
        </div>
      </div>
    </div>`,
  });
}

function MapController({
  result,
  activeDayIndex,
  allDays,
  mode,
}: Omit<Props, "onPinClick">) {
  const map = useMap();

  useEffect(() => {
    if (mode === "overview" || activeDayIndex < 0) {
      // Show all markers across all days
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

export function ResultsMap({ result, activeDayIndex, allDays, mode, refinedCoords, onPinClick }: Props) {
  const hasValidCenter = result?.map_center && typeof result.map_center.lat === "number";

  // Helper to get best coordinates for an activity (refined > AI-generated)
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
            color: "#0D9488",
            weight: 2.5,
            opacity: 0.6,
            dashArray: "6 4",
          }}
        />
      )}

      {activitiesForMap.map((act, i) => (
        <Marker
          key={`${act._dayDate}-${act._idx}`}
          position={[act.latitude!, act.longitude!]}
          icon={createPremiumIcon(act._idx + 1, getCategoryColor(act.category), act.category, act.image_url)}
          eventHandlers={{
            click: () => onPinClick?.(act._dayDate, act._idx),
          }}
        />
      ))}
    </MapContainer>
  );
}
