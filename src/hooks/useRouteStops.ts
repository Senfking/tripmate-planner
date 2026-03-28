import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { differenceInDays, eachDayOfInterval, format, parseISO } from "date-fns";

export type RouteStop = {
  id: string;
  trip_id: string;
  proposal_id: string | null;
  destination: string;
  start_date: string;
  end_date: string;
  position: number;
  notes: string | null;
  confirmed_by: string;
  confirmed_at: string;
};

export function useRouteStops(tripId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["route-stops", tripId] });
    qc.invalidateQueries({ queryKey: ["trip", tripId] });
  };

  const stopsQuery = useQuery({
    queryKey: ["route-stops", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_route_stops" as any)
        .select("*")
        .eq("trip_id", tripId!)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as RouteStop[];
    },
    enabled: !!tripId && !!user,
  });

  const stops = stopsQuery.data || [];

  const updateTripDates = async (allStops: RouteStop[]) => {
    if (allStops.length === 0) {
      await supabase
        .from("trips")
        .update({ tentative_start_date: null, tentative_end_date: null } as any)
        .eq("id", tripId!);
      return;
    }
    const starts = allStops.map((s) => s.start_date).sort();
    const ends = allStops.map((s) => s.end_date).sort();
    await supabase
      .from("trips")
      .update({
        tentative_start_date: starts[0],
        tentative_end_date: ends[ends.length - 1],
      } as any)
      .eq("id", tripId!);
  };

  const createItineraryDays = async (stop: {
    destination: string;
    start_date: string;
    end_date: string;
  }) => {
    const days = eachDayOfInterval({
      start: parseISO(stop.start_date),
      end: parseISO(stop.end_date),
    });
    const dateStrs = days.map((d) => format(d, "yyyy-MM-dd"));

    const { data: existing } = await supabase
      .from("itinerary_items")
      .select("id, day_date")
      .eq("trip_id", tripId!)
      .in("day_date", dateStrs);

    const existingDates = new Set((existing || []).map((e: any) => e.day_date));

    const toInsert = dateStrs
      .filter((d) => !existingDates.has(d))
      .map((d) => ({
        trip_id: tripId!,
        day_date: d,
        title: stop.destination,
        location_text: stop.destination,
        sort_order: 0,
        status: "idea",
      }));

    if (toInsert.length > 0) {
      await supabase.from("itinerary_items").insert(toInsert as any);
    }

    // Update location for existing days
    for (const d of dateStrs.filter((d) => existingDates.has(d))) {
      await supabase
        .from("itinerary_items")
        .update({ location_text: stop.destination } as any)
        .eq("trip_id", tripId!)
        .eq("day_date", d);
    }
  };

  const addStop = useMutation({
    mutationFn: async (input: {
      destination: string;
      start_date: string;
      end_date: string;
      position: number;
      notes?: string;
      proposal_id?: string;
    }) => {
      const { data, error } = await supabase
        .from("trip_route_stops" as any)
        .insert({
          trip_id: tripId!,
          destination: input.destination,
          start_date: input.start_date,
          end_date: input.end_date,
          position: input.position,
          notes: input.notes || null,
          proposal_id: input.proposal_id || null,
          confirmed_by: user!.id,
        })
        .select()
        .single();
      if (error) throw error;

      const { data: allStops } = await supabase
        .from("trip_route_stops" as any)
        .select("*")
        .eq("trip_id", tripId!)
        .order("position");

      await updateTripDates((allStops || []) as unknown as RouteStop[]);
      await createItineraryDays(input);
      return data;
    },
    onSuccess: invalidate,
  });

  const updateStop = useMutation({
    mutationFn: async (input: {
      id: string;
      destination?: string;
      start_date?: string;
      end_date?: string;
      notes?: string;
    }) => {
      const updates: any = {};
      if (input.destination !== undefined) updates.destination = input.destination;
      if (input.start_date !== undefined) updates.start_date = input.start_date;
      if (input.end_date !== undefined) updates.end_date = input.end_date;
      if (input.notes !== undefined) updates.notes = input.notes;

      const { error } = await supabase
        .from("trip_route_stops" as any)
        .update(updates)
        .eq("id", input.id);
      if (error) throw error;

      const { data: allStops } = await supabase
        .from("trip_route_stops" as any)
        .select("*")
        .eq("trip_id", tripId!);

      await updateTripDates((allStops || []) as unknown as RouteStop[]);
    },
    onSuccess: invalidate,
  });

  const removeStop = useMutation({
    mutationFn: async ({
      id,
      cleanupDates,
    }: {
      id: string;
      cleanupDates?: string[];
    }) => {
      const { error } = await supabase
        .from("trip_route_stops" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;

      // Clean up empty itinerary items (those without notes)
      if (cleanupDates && cleanupDates.length > 0) {
        await supabase
          .from("itinerary_items")
          .delete()
          .eq("trip_id", tripId!)
          .in("day_date", cleanupDates)
          .is("notes", null);
      }

      const { data: allStops } = await supabase
        .from("trip_route_stops" as any)
        .select("*")
        .eq("trip_id", tripId!);

      await updateTripDates((allStops || []) as unknown as RouteStop[]);
    },
    onSuccess: invalidate,
  });

  const reorderStop = useMutation({
    mutationFn: async ({
      id,
      newPosition,
    }: {
      id: string;
      newPosition: number;
    }) => {
      const current = stops.find((s) => s.id === id);
      if (!current) return;
      const target = stops.find((s) => s.position === newPosition);
      if (target) {
        await supabase
          .from("trip_route_stops" as any)
          .update({ position: current.position } as any)
          .eq("id", target.id);
      }
      await supabase
        .from("trip_route_stops" as any)
        .update({ position: newPosition } as any)
        .eq("id", id);
    },
    onSuccess: invalidate,
  });

  const lockRoute = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("trips")
        .update({ route_locked: true } as any)
        .eq("id", tripId!);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const unlockRoute = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("trips")
        .update({ route_locked: false } as any)
        .eq("id", tripId!);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const isProposalInRoute = (proposalId: string) =>
    stops.some((s) => s.proposal_id === proposalId);

  // Calculate totals
  const sortedByStart = [...stops].sort((a, b) =>
    a.start_date.localeCompare(b.start_date)
  );
  const sortedByEnd = [...stops].sort((a, b) =>
    b.end_date.localeCompare(a.end_date)
  );
  const tripStart = sortedByStart[0]?.start_date || null;
  const tripEnd = sortedByEnd[0]?.end_date || null;
  const totalDays =
    tripStart && tripEnd
      ? differenceInDays(parseISO(tripEnd), parseISO(tripStart))
      : 0;

  return {
    stops,
    isLoading: stopsQuery.isLoading,
    totalDays,
    tripStart,
    tripEnd,
    addStop,
    updateStop,
    removeStop,
    reorderStop,
    lockRoute,
    unlockRoute,
    isProposalInRoute,
  };
}
