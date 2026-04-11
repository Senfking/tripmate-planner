import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Polyline, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getCategoryColor } from "./categoryColors";
import type { AITripResult, AIDay, AIActivity } from "./useResultsState";

interface Props {
  result: AITripResult;
  activeDayIndex: number;
  allDays: AIDay[];
  mode: "overview" | "day";
  onPinClick?: (dayDate: string, activityIndex: number) => void;
}

function createNumberedIcon(num: number, color: string) {
  return L.divIcon({
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div style="
      width:28px;height:28px;border-radius:50%;
      background:${color};
      display:flex;align-items:center;justify-content:center;
      color:#fff;font-size:12px;font-weight:700;
      border:2px solid rgba(255,255,255,0.3);
      box-shadow:0 2px 8px rgba(0,0,0,0.4);
      font-family:'IBM Plex Mono',monospace;
    ">${num}</div>`,
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
      map.setView(
        [result.map_center.lat, result.map_center.lng],
        result.map_zoom || 6,
        { animate: true }
      );
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

export function ResultsMap({ result, activeDayIndex, allDays, mode, onPinClick }: Props) {
  const hasValidCenter = result?.map_center && typeof result.map_center.lat === "number";

  const activitiesForMap = useMemo(() => {
    if (!hasValidCenter) return [];
    try {
      if (mode === "day" && activeDayIndex >= 0 && allDays[activeDayIndex]) {
        return allDays[activeDayIndex].activities
          .map((a, i) => ({ ...a, _dayDate: allDays[activeDayIndex].date, _idx: i }))
          .filter((a) => a.latitude != null && a.longitude != null);
      }

      const all: (AIActivity & { _dayDate: string; _idx: number })[] = [];
      for (const day of allDays) {
        day.activities.forEach((a, i) => {
          if (a.latitude != null && a.longitude != null) {
            all.push({ ...a, _dayDate: day.date, _idx: i });
          }
        });
      }
      return all;
    } catch {
      return [];
    }
  }, [mode, activeDayIndex, allDays, hasValidCenter]);

  const polylinePositions = useMemo(
    () =>
      activitiesForMap
        .filter((a) => a.latitude && a.longitude)
        .map((a) => [a.latitude!, a.longitude!] as [number, number]),
    [activitiesForMap]
  );

  if (!hasValidCenter) {
    return <div className="h-full w-full bg-muted/40" />;
  }


  return (
    <MapContainer
      center={[result.map_center.lat, result.map_center.lng]}
      zoom={result.map_zoom || 6}
      className="h-full w-full"
      zoomControl={false}
      attributionControl={false}
      style={{ background: "#0f1115" }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
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
            weight: 2,
            opacity: 0.5,
            dashArray: "6 4",
          }}
        />
      )}

      {activitiesForMap.map((act, i) => (
        <Marker
          key={`${act._dayDate}-${act._idx}`}
          position={[act.latitude!, act.longitude!]}
          icon={createNumberedIcon(act._idx + 1, getCategoryColor(act.category))}
          eventHandlers={{
            click: () => onPinClick?.(act._dayDate, act._idx),
          }}
        />
      ))}
    </MapContainer>
  );
}
