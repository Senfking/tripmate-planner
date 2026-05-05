import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { stripEmoji } from "@/lib/stripEmoji";
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
  destination_country_iso: string | null;
  from_cache: boolean;
  anon_trip_id?: string | null;
}

export interface StreamingState {
  stage: StreamStage;
  meta: StreamMeta | null;
  imageUrl: string | null;
  days: AIDay[];
  trip: TripCompleteEvent | null;
  result: AITripResult | null;
  error: string | null;
  /** Set when the server returned 429 (anon rate limit hit). */
  errorCode: string | null;
  /** Anonymous-mode only: the row id in `anonymous_trips` once the
   *  trip_complete event lands. Used to navigate to /trips/anon/[id]. */
  anonTripId: string | null;
  isCacheHit: boolean;
}

/**
 * Build a best-effort AITripResult from whatever events have arrived so far.
 *
 * Used so TripResultsView can be rendered mid-stream — populated days fill in
 * incrementally; days that haven't arrived yet are emitted as empty AIDay rows
 * (date + day_number + theme from the skeleton, no activities) so the UI can
 * render a skeleton card with the correct identity in the correct slot.
 *
 * Returns null until `meta` arrives (we don't yet know the date range / num
 * days / destination name).
 */
export function buildPartialResult(state: StreamingState): AITripResult | null {
  // Once trip_complete fires we have the fully-assembled result. Use that
  // verbatim — no point reconstructing it.
  if (state.result) return state.result;

  const meta = state.meta;
  if (!meta) return null;

  const arrived = new Map(state.days.map((d) => [d.day_number, d]));
  const skeletonByNum = new Map(meta.skeleton.map((s) => [s.day_number, s]));

  // Merge skeleton + arrived days, preserving the skeleton's ordering. A
  // skeleton entry with no matching streamed day yields an empty-activities
  // AIDay so DaySection can render a placeholder in the correct slot.
  const allDays: AIDay[] = meta.skeleton.map((s) => {
    const got = arrived.get(s.day_number);
    if (got) return got;
    return {
      day_number: s.day_number,
      date: s.date,
      theme: s.theme,
      activities: [],
    };
  });

  // Some streams may emit a day with a number that isn't in the skeleton
  // (defensive — shouldn't happen but don't drop data). Append at the end.
  for (const d of state.days) {
    if (!skeletonByNum.has(d.day_number)) allDays.push(d);
  }
  allDays.sort((a, b) => a.day_number - b.day_number);

  const startDate = allDays[0]?.date ?? "";
  const endDate = allDays[allDays.length - 1]?.date ?? startDate;

  const totalActivities = allDays.reduce((n, d) => n + d.activities.length, 0);

  return {
    trip_title: meta.destination || "Your Trip",
    trip_summary: "",
    destinations: [
      {
        name: meta.destination,
        start_date: startDate,
        end_date: endDate,
        intro: "",
        days: allDays,
      },
    ],
    map_center: { lat: 0, lng: 0 },
    map_zoom: 6,
    daily_budget_estimate: 0,
    currency: meta.currency || "USD",
    packing_suggestions: [],
    total_activities: totalActivities,
    destination_image_url: state.imageUrl ?? null,
    destination_country_iso:
      typeof meta.country_code === "string" && meta.country_code.length === 2
        ? meta.country_code.toUpperCase()
        : null,
  };
}

/**
 * Set of day_numbers that are still skeleton placeholders (not yet streamed).
 * TripResultsView consumes this to know which day cards to render in skeleton
 * mode vs populated mode.
 */
export function getSkeletonDayNumbers(state: StreamingState): Set<number> {
  if (!state.meta || state.result) return new Set();
  const arrived = new Set(state.days.map((d) => d.day_number));
  const skel = new Set<number>();
  for (const s of state.meta.skeleton) {
    if (!arrived.has(s.day_number)) skel.add(s.day_number);
  }
  return skel;
}

const INITIAL: StreamingState = {
  stage: "idle",
  meta: null,
  imageUrl: null,
  days: [],
  trip: null,
  result: null,
  error: null,
  errorCode: null,
  anonTripId: null,
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
    trip_title: stripEmoji(trip.trip_title),
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
    destination_country_iso: trip.destination_country_iso ?? null,
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
    async (payload: Record<string, unknown>, opts?: { anon?: boolean }) => {
      // Always start fresh.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      liveRef.current = { ...INITIAL, stage: "starting" };
      setState(liveRef.current);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const isAnon = !!opts?.anon;
      if (!token && !isAnon) {
        update({ stage: "error", error: "Not signed in. Please sign in and try again." });
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const url = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/generate-trip-itinerary`;

      const headers: Record<string, string> = {
        "content-type": "application/json",
        "accept": "text/event-stream",
        "apikey": apikey,
      };
      if (token) {
        headers["authorization"] = `Bearer ${token}`;
      } else {
        // Edge function still needs an apikey-bearing Authorization for the
        // Supabase functions gateway when no user JWT is present.
        headers["authorization"] = `Bearer ${apikey}`;
      }

      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers,
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
        let code: string | null = res.status === 429 ? "rate_limited" : null;
        try {
          const json = await res.json();
          if (json?.message) msg = json.message;
          else if (json?.error) msg = json.error;
          if (typeof json?.code === "string") code = json.code;
        } catch {}
        update({ stage: "error", error: msg, errorCode: code });
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
    theme: typeof raw.theme === "string" ? stripEmoji(raw.theme) : "",
    activities,
  };
}

function normalizeActivityFromServer(a: any): AIActivity | null {
  if (!a || typeof a !== "object") return null;
  return {
    title: stripEmoji(a.title ?? ""),
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
