import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

// Tables that have trip_id column directly
const TRIP_FILTERED_TABLES = [
  "itinerary_items",
  "itinerary_attendance",
  "vibe_responses",
  "comments",
  "attachments",
  "expenses",
  "trip_route_stops",
  "trip_members",
] as const;

// Tables without direct trip_id — subscribe unfiltered
const UNFILTERED_TABLES = [
  "votes",
  "date_option_votes",
  "proposal_reactions",
  "expense_splits",
] as const;

// Query key mapping per table
const TABLE_QUERY_KEYS: Record<string, (tripId: string) => string[][]> = {
  itinerary_items: (t) => [["itinerary", t], ["itinerary-items-summary", t], ["itinerary-items-for-expenses", t]],
  itinerary_attendance: (t) => [["itinerary_attendance", t]],
  votes: (t) => [["poll-vote-counts"], ["my-poll-votes", t], ["trip-polls", t], ["trip-poll-options", t]],
  date_option_votes: (t) => [["trip-date-options", t], ["my-date-votes", t]],
  proposal_reactions: (t) => [["my-reactions", t], ["trip-proposals", t]],
  vibe_responses: (t) => [["my-vibe-responses-count", t], ["vibe-responses", t], ["vibe-aggregates", t]],
  comments: () => [["item-comments"]],
  attachments: (t) => [["attachments", t], ["attachments-summary", t]],
  expenses: (t) => [["expenses", t], ["expenses-summary", t]],
  expense_splits: (t) => [["expense-splits", t], ["expenses-summary", t]],
  trip_route_stops: (t) => [["route-stops", t], ["trip-route-stops", t]],
  trip_members: (t) => [["trip-members-count", t], ["trip-members-profiles", t]],
};

// Dashboard keys to also invalidate
const DASHBOARD_KEYS = (t: string) => [
  ["itinerary-items-summary", t],
  ["expenses-summary", t],
  ["attachments-summary", t],
  ["trip-members-count", t],
];

// Toast messages per table
const TOAST_MESSAGES: Record<string, string> = {
  itinerary_items: "added an activity",
  attachments: "added a booking",
  expenses: "added an expense",
  trip_route_stops: "confirmed a stop",
  votes: "cast a vote",
};

const DELETE_TOAST_MESSAGES: Record<string, string> = {
  itinerary_items: "removed an activity",
  attachments: "removed a booking",
  expenses: "removed an expense",
  trip_route_stops: "removed a stop",
};

const TOAST_TABLES = new Set(Object.keys(TOAST_MESSAGES));

export function useTripRealtime(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [newItemIds, setNewItemIds] = useState<Set<string>>(new Set());

  const debounceTimers = useRef(new Map<string, NodeJS.Timeout>());
  const lastToastAt = useRef(0);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const addNewId = useCallback((id: string) => {
    setNewItemIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setTimeout(() => {
      setNewItemIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 2000);
  }, []);

  const showActivityToast = useCallback(async (table: string, userId: string) => {
    const now = Date.now();
    if (now - lastToastAt.current < 5000) return;
    lastToastAt.current = now;

    let displayName = "Someone";
    try {
      // Try cache first
      const cached = queryClient.getQueryData<any[]>(["trip-members-profiles", tripId]);
      const member = cached?.find((m: any) => m.userId === userId || m.user_id === userId);
      if (member) {
        displayName = member.displayName || member.display_name || "Someone";
      } else {
        const { data } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", userId)
          .single();
        if (data?.display_name) displayName = data.display_name;
      }
    } catch {}

    toast({
      description: `${displayName} ${TOAST_MESSAGES[table]}`,
      duration: 3000,
    });
  }, [queryClient, tripId]);

  const handleChange = useCallback(
    (table: string, payload: RealtimePostgresChangesPayload<any>) => {
      const newRecord = payload.new && typeof payload.new === "object" ? payload.new as any : null;
      const oldRecord = payload.old && typeof payload.old === "object" ? payload.old as any : null;

      const userId = newRecord
        ? (newRecord.user_id || newRecord.created_by || newRecord.payer_id || newRecord.confirmed_by)
        : oldRecord
        ? (oldRecord.user_id || oldRecord.created_by || oldRecord.payer_id || oldRecord.confirmed_by)
        : null;
      const isOtherUser = userId && userId !== user?.id;
      const recordId = newRecord?.id;

      // Track new inserts from other users for highlight
      if (payload.eventType === "INSERT" && isOtherUser && recordId) {
        addNewId(recordId);
      }

      // Activity toast for INSERTs
      if (payload.eventType === "INSERT" && isOtherUser && TOAST_TABLES.has(table) && userId) {
        showActivityToast(table, userId, "insert");
      }

      // Activity toast for DELETEs
      if (payload.eventType === "DELETE" && isOtherUser && DELETE_TOAST_MESSAGES[table] && userId) {
        showActivityToast(table, userId, "delete");
      }

      // Debounced query invalidation
      const existing = debounceTimers.current.get(table);
      if (existing) clearTimeout(existing);

      debounceTimers.current.set(
        table,
        setTimeout(() => {
          debounceTimers.current.delete(table);
          if (!tripId) return;

          const keys = TABLE_QUERY_KEYS[table]?.(tripId) || [];
          const dashKeys = DASHBOARD_KEYS(tripId);
          const allKeys = [...keys, ...dashKeys];

          for (const key of allKeys) {
            queryClient.invalidateQueries({ queryKey: key });
          }
        }, 300)
      );
    },
    [tripId, user?.id, queryClient, addNewId, showActivityToast]
  );

  useEffect(() => {
    if (!tripId || !user) return;

    const channel = supabase.channel(`trip-realtime-${tripId}`);
    channelRef.current = channel;

    // Add filtered table listeners
    for (const table of TRIP_FILTERED_TABLES) {
      channel.on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table,
          filter: `trip_id=eq.${tripId}`,
        },
        (payload: RealtimePostgresChangesPayload<any>) => handleChange(table, payload)
      );
    }

    // Add unfiltered table listeners
    for (const table of UNFILTERED_TABLES) {
      channel.on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table,
        },
        (payload: RealtimePostgresChangesPayload<any>) => handleChange(table, payload)
      );
    }

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setConnectionStatus("connected");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setConnectionStatus("reconnecting");
      } else if (status === "CLOSED") {
        setConnectionStatus("disconnected");
      }
    });

    return () => {
      // Clear all debounce timers
      debounceTimers.current.forEach((timer) => clearTimeout(timer));
      debounceTimers.current.clear();
      supabase.removeChannel(channel);
      channelRef.current = null;
      setConnectionStatus("disconnected");
    };
  }, [tripId, user, handleChange]);

  return { connectionStatus, newItemIds };
}
