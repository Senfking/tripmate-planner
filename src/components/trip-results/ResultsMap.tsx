import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getCategoryColor } from "./categoryColors";
import type { AITripResult, AIDay, AIActivity } from "./useResultsState";

interface Props {
  result: AITripResult;
  activeDayIndex: number;
  allDays: AIDay[];
  mode: "overview" | "day";
  refinedCoords?: Map<string, { lat: number; lng: number }>;
  onPinClick?: (dayDate: string, activityIndex: number) => void;
}

function createPinIcon(num: number, title: string, color: string) {
  const shortTitle = title.length > 14 ? title.slice(0, 13) + "…" : title;

  return L.divIcon({
    className: "",
    iconSize: [32, 44],
    iconAnchor: [16, 44],
    popupAnchor: [0, -40],
    html: `<div style="position:relative;width:32px;height:44px;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.3));cursor:pointer;">
      <svg width="32" height="44" viewBox="0 0 32 44" fill="none">
        <path d="M16 43C16 43 2 26 2 15C2 7.3 8.3 1 16 1C23.7 1 30 7.3 30 15C30 26 16 43 16 43Z" fill="${color}" stroke="white" stroke-width="2"/>
      </svg>
      <span style="position:absolute;top:7px;left:0;right:0;text-align:center;font-size:12px;font-weight:800;color:white;font-family:Inter,system-ui,sans-serif;text-shadow:0 1px 2px rgba(0,0,0,0.2);">${num}</span>
      <div style="position:absolute;top:38px;left:50%;transform:translateX(-50%);white-space:nowrap;background:rgba(15,23,42,0.85);color:white;font-size:9px;font-weight:600;padding:2px 6px;border-radius:4px;font-family:Inter,system-ui,sans-serif;pointer-events:none;">${shortTitle}</div>
    </div>`,
  });
}

function ActivityPopup({ act }: { act: AIActivity & { _dayDate: string; _idx: number } }) {
  const color = getCategoryColor(act.category);

  return (
    <div style={{ width: 220, fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ padding: "10px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span style={{ background: color, color: "white", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            {act.category}
          </span>
          <span style={{ fontSize: 10, color: "#9ca3af" }}>{act.start_time}</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1f2937", lineHeight: 1.3 }}>{act.title}</div>
        {act.location_name && (
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>📍 {act.location_name}</div>
        )}
        {act.description && (
          <div style={{ fontSize: 11, color: "#4b5563", marginTop: 6, lineHeight: 1.5 }}>
            {act.description.length > 120 ? act.description.slice(0, 120) + "…" : act.description}
          </div>
        )}
        {act.estimated_cost_per_person != null && (
          <div style={{ fontSize: 11, color: "#059669", fontWeight: 600, marginTop: 6 }}>
            ~{act.currency}{Math.round(act.estimated_cost_per_person)}/person
          </div>
        )}
        {act.google_maps_url && (
          <a
            href={act.google_maps_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: "#3b82f6", textDecoration: "none", display: "inline-block", marginTop: 6, fontWeight: 600 }}
          >
            Open in Maps →
          </a>
        )}
      </div>
    </div>
  );
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

      {activitiesForMap.map((act) => (
        <Marker
          key={`${act._dayDate}-${act._idx}`}
          position={[act.latitude!, act.longitude!]}
          icon={createPinIcon(act._idx + 1, act.title, getCategoryColor(act.category))}
          eventHandlers={{
            click: () => onPinClick?.(act._dayDate, act._idx),
          }}
        >
          <Popup closeButton={false} className="premium-map-popup" maxWidth={240} minWidth={220}>
            <ActivityPopup act={act} />
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
