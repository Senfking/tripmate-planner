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

const UNSPLASH_THUMB = "https://source.unsplash.com/120x120/?";

function createImagePin(num: number, title: string, color: string, photoQuery?: string | null) {
  const imgSrc = photoQuery
    ? `${UNSPLASH_THUMB}${encodeURIComponent(photoQuery)}`
    : `${UNSPLASH_THUMB}${encodeURIComponent(title)}`;
  const shortTitle = title.length > 18 ? title.slice(0, 17) + "…" : title;

  return L.divIcon({
    className: "",
    iconSize: [56, 68],
    iconAnchor: [28, 68],
    popupAnchor: [0, -62],
    html: `<div style="position:relative;width:56px;height:68px;filter:drop-shadow(0 4px 12px rgba(0,0,0,0.25));cursor:pointer;">
      <!-- Card body -->
      <div style="width:56px;height:56px;border-radius:14px;overflow:hidden;border:2.5px solid white;background:${color};position:relative;">
        <img src="${imgSrc}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'" />
        <!-- Number badge -->
        <div style="position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;border:1.5px solid white;">
          <span style="font-size:9px;font-weight:800;color:white;font-family:Inter,system-ui,sans-serif;">${num}</span>
        </div>
      </div>
      <!-- Pointer -->
      <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:10px solid white;"></div>
      <!-- Title label -->
      <div style="position:absolute;top:58px;left:50%;transform:translateX(-50%);white-space:nowrap;background:rgba(0,0,0,0.7);color:white;font-size:8px;font-weight:600;padding:1px 5px;border-radius:4px;font-family:Inter,system-ui,sans-serif;pointer-events:none;max-width:90px;overflow:hidden;text-overflow:ellipsis;">${shortTitle}</div>
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

function ActivityPopup({ act }: { act: AIActivity & { _dayDate: string; _idx: number } }) {
  const imgSrc = act.photo_query
    ? `${UNSPLASH_THUMB}${encodeURIComponent(act.photo_query)}`
    : `${UNSPLASH_THUMB}${encodeURIComponent(act.title)}`;
  const color = getCategoryColor(act.category);

  return (
    <div style={{ width: 220, fontFamily: "Inter, system-ui, sans-serif" }}>
      <img
        src={imgSrc}
        alt={act.title}
        style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: "8px 8px 0 0" }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
      <div style={{ padding: "8px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <span style={{ background: color, color: "white", fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, textTransform: "uppercase" }}>
            {act.category}
          </span>
          <span style={{ fontSize: 9, color: "#9ca3af" }}>{act.start_time}</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1f2937", lineHeight: 1.3 }}>{act.title}</div>
        {act.location_name && (
          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{act.location_name}</div>
        )}
        {act.description && (
          <div style={{ fontSize: 10, color: "#4b5563", marginTop: 4, lineHeight: 1.4 }}>
            {act.description.length > 100 ? act.description.slice(0, 100) + "…" : act.description}
          </div>
        )}
        {act.estimated_cost_per_person != null && (
          <div style={{ fontSize: 10, color: "#059669", fontWeight: 600, marginTop: 4 }}>
            ~{act.currency}{Math.round(act.estimated_cost_per_person)}/person
          </div>
        )}
        {act.google_maps_url && (
          <a
            href={act.google_maps_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 10, color: "#3b82f6", textDecoration: "none", display: "block", marginTop: 4, fontWeight: 500 }}
          >
            Open in Google Maps →
          </a>
        )}
      </div>
    </div>
  );
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
          icon={createImagePin(act._idx + 1, act.title, getCategoryColor(act.category), act.photo_query)}
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
