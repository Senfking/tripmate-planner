import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AIActivity, AIDay, AITripResult } from "@/components/trip-results/useResultsState";

// ---------------------------------------------------------------------------
// Streaming SSE consumer for the generate-trip-itinerary edge function.
//
// The supabase.functions.invoke client buffers responses, so we use a raw
// fetch to ${SUPABASE_URL}/functions/v1/generate-trip-itinerary with an
// Authorization: Bearer <session.access_token> header and Accept:
// text/event-stream. Server emits these events:
//   progress      { stage }
//   meta          { destination, country_code, num_days, skeleton, currency, from_cache }
//   image         { url }
//   day           { day_number, date, theme, activities }
//   trip_complete { trip_title, trip_summary, accommodation, packing_suggestions,
//                   junto_pick_place_ids, daily_budget_estimate, total_activities,
//                   map_center, map_zoom, currency, budget_tier, destination_image_url, from_cache }
//   error         { error, step, message }
//   ping          {}
// ---------------------------------------------------------------------------

export type StreamStage =
  | "idle"
  | "starting"
  | "parsing_intent"
  | "picking_destination"
  | "destination_picked"
  | "geocoding"
  | "searching_venues"
  | "hydrating_finalists"
  | "ranking"
  | "complete"
  | "error";

export interface StreamMeta {
  destination: string;
  country_code: string | null;
  num_days: number;
  skeleton: { day_number: number; date: string; theme: string }[];
  currency: string;
  from_cache: boolean;
}

interface TripCompleteEvent {
  trip_title: string;
  trip_summary: string;
  accommodation: AIDay["activities"][number] | null;
  packing_suggestions: string[];
  junto_pick_place_ids: string[];
  daily_budget_estimate: number;
  total_activities: number;
  map_center: { lat: number; lng: number };
  map_zoom: number;
  currency: string;
  budget_tier?: AITripResult["budget_tier"];
  destination_image_url: string | null;
  from_cache: boolean;
}

export interface StreamingState {
  stage: StreamStage;
  meta: StreamMeta | null;
  imageUrl: string | null;
  days: AIDay[];
  trip: TripCompleteEvent | null;
  result: AITripResult | null;
  error: string | null;
  isCacheHit: boolean;
}

const INITIAL: StreamingState = {
  stage: "idle",
  meta: null,
  imageUrl: null,
  days: [],
  trip: null,
  result: null,
  error: null,
  isCacheHit: false,
};

function assembleResult(
  meta: StreamMeta,
  days: AIDay[],
  imageUrl: string | null,
  trip: TripCompleteEvent,
): AITripResult {
  // Apply junto picks based on place_ids from trip_complete.
  const juntoSet = new Set(trip.junto_pick_place_ids ?? []);
  const annotatedDays: AIDay[] = days
    .slice()
    .sort((a, b) => a.day_number - b.day_number)
    .map((day) => ({
      ...day,
      activities: day.activities.map((a) =>
        a && a.location_name && juntoSet.has((a as any).place_id) ? { ...a, is_junto_pick: true } : a,
      ),
    }));

  return {
    trip_title: trip.trip_title,
    trip_summary: trip.trip_summary,
    destinations: [
      {
        name: meta.destination,
        start_date: annotatedDays[0]?.date ?? "",
        end_date: annotatedDays[annotatedDays.length - 1]?.date ?? "",
        intro: trip.trip_summary,
        days: annotatedDays,
        accommodation: trip.accommodation as any,
      },
    ],
    map_center: trip.map_center ?? { lat: 0, lng: 0 },
    map_zoom: trip.map_zoom ?? 12,
    daily_budget_estimate: trip.daily_budget_estimate ?? 0,
    currency: trip.currency ?? meta.currency ?? "USD",
    packing_suggestions: trip.packing_suggestions ?? [],
    total_activities: trip.total_activities ?? annotatedDays.reduce((n, d) => n + d.activities.length, 0),
    budget_tier: trip.budget_tier,
    destination_image_url: trip.destination_image_url ?? imageUrl ?? null,
  };
}

interface UseStreamingTripGenerationReturn {
  state: StreamingState;
  start: (payload: Record<string, unknown>) => Promise<void>;
  reset: () => void;
}

export function useStreamingTripGeneration(): UseStreamingTripGenerationReturn {
  const [state, setState] = useState<StreamingState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);
  // Mirror of state used inside the streaming loop where setState's stale
  // closure would otherwise drop events. Updated synchronously alongside
  // setState calls.
  const liveRef = useRef<StreamingState>(INITIAL);
  const update = useCallback((patch: Partial<StreamingState>) => {
    liveRef.current = { ...liveRef.current, ...patch };
    setState(liveRef.current);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    liveRef.current = INITIAL;
    setState(INITIAL);
  }, []);

  const start = useCallback(
    async (payload: Record<string, unknown>) => {
      // Always start fresh.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      liveRef.current = { ...INITIAL, stage: "starting" };
      setState(liveRef.current);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        update({ stage: "error", error: "Not signed in. Please sign in and try again." });
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const url = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/generate-trip-itinerary`;

      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${token}`,
            "accept": "text/event-stream",
            // Supabase functions gateway expects the apikey header for routing.
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } catch (e) {
        if (controller.signal.aborted) return;
        update({ stage: "error", error: (e as Error).message ?? "Network error" });
        return;
      }

      if (!res.ok) {
        let msg = `Server returned ${res.status}`;
        try {
          const json = await res.json();
          if (json?.message) msg = json.message;
          else if (json?.error) msg = json.error;
        } catch {}
        update({ stage: "error", error: msg });
        return;
      }

      if (!res.body) {
        update({ stage: "error", error: "No response body" });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n\n")) >= 0) {
            const frame = buf.slice(0, nl);
            buf = buf.slice(nl + 2);
            handleFrame(frame, update, () => liveRef.current);
          }
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        update({ stage: "error", error: (e as Error).message ?? "Stream interrupted" });
      }
    },
    [update],
  );

  return { state, start, reset };
}

function handleFrame(
  frame: string,
  update: (patch: Partial<StreamingState>) => void,
  getState: () => StreamingState,
) {
  let eventName: string | null = null;
  let dataLine: string | null = null;
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLine = line.slice(5).trim();
  }
  if (!eventName || !dataLine) return;

  let data: any;
  try {
    data = JSON.parse(dataLine);
  } catch {
    return;
  }

  switch (eventName) {
    case "progress": {
      const s = data?.stage as StreamStage | undefined;
      if (s) update({ stage: s });
      break;
    }
    case "meta": {
      update({ meta: data as StreamMeta, isCacheHit: !!data?.from_cache });
      break;
    }
    case "image": {
      update({ imageUrl: data?.url ?? null });
      break;
    }
    case "day": {
      const day = normalizeDayFromServer(data);
      if (!day) break;
      const cur = getState();
      // Replace if same day_number already present (e.g. from cache replay), else append.
      const existing = cur.days.findIndex((d) => d.day_number === day.day_number);
      const next = cur.days.slice();
      if (existing >= 0) next[existing] = day;
      else next.push(day);
      next.sort((a, b) => a.day_number - b.day_number);
      update({ days: next });
      break;
    }
    case "trip_complete": {
      const cur = getState();
      const trip = data as TripCompleteEvent;
      const meta = cur.meta;
      if (!meta) {
        update({ stage: "error", error: "Stream protocol violation: trip_complete before meta" });
        break;
      }
      const result = assembleResult(meta, cur.days, cur.imageUrl, trip);
      update({ stage: "complete", trip, result });
      break;
    }
    case "error": {
      update({
        stage: "error",
        error: data?.message ?? data?.error ?? "Trip generation failed",
      });
      break;
    }
    case "ping":
    default:
      break;
  }
}

// Server emits days in the EnrichedActivity shape; the frontend AIActivity
// type is mostly compatible. This normalizer copies the few fields we need
// to ensure are present (location_name from title, etc.).
function normalizeDayFromServer(raw: any): AIDay | null {
  if (typeof raw?.day_number !== "number") return null;
  const activities: AIActivity[] = Array.isArray(raw.activities)
    ? raw.activities.map((a: any) => normalizeActivityFromServer(a)).filter((a: any) => !!a)
    : [];
  return {
    date: typeof raw.date === "string" ? raw.date : "",
    day_number: raw.day_number,
    theme: typeof raw.theme === "string" ? raw.theme : "",
    activities,
  };
}

function normalizeActivityFromServer(a: any): AIActivity | null {
  if (!a || typeof a !== "object") return null;
  return {
    title: a.title ?? "",
    description: a.description ?? "",
    category: a.category ?? "experience",
    start_time: a.start_time ?? "",
    duration_minutes: typeof a.duration_minutes === "number" ? a.duration_minutes : 0,
    estimated_cost_per_person: typeof a.estimated_cost_per_person === "number" ? a.estimated_cost_per_person : null,
    currency: a.currency ?? "USD",
    location_name: a.location_name ?? a.title ?? "",
    latitude: typeof a.latitude === "number" ? a.latitude : null,
    longitude: typeof a.longitude === "number" ? a.longitude : null,
    google_maps_url: a.google_maps_url ?? null,
    booking_url: a.booking_url ?? null,
    photo_query: a.photo_query ?? null,
    tips: a.pro_tip ?? a.tips ?? null,
    dietary_notes: a.dietary_notes ?? null,
    travel_time_from_previous: a.travel_time_from_previous ?? null,
    travel_mode_from_previous: a.travel_mode_from_previous ?? null,
    is_junto_pick: !!a.is_junto_pick,
    price_level: a.price_level ?? null,
    priceRange: a.priceRange ?? null,
    // Carry through extras the server emits — TripResultsView/cards consume these.
    ...a,
  } as AIActivity;
}
