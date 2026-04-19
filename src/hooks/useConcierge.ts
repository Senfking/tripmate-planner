import { useState, useEffect, useCallback } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Dedupe window for identical concierge-suggest invocations. The same request
// body within this window returns the cached response instead of re-hitting
// the Edge Function (and the 3 Places queries it fires).
const CONCIERGE_SUGGEST_STALE_MS = 5 * 60 * 1000;
const CONCIERGE_SUGGEST_GC_MS = 10 * 60 * 1000;

export interface ConciergeSuggestion {
  name: string;
  category: string;
  why: string;
  best_time: string;
  estimated_cost_per_person: number | null;
  currency: string | null;
  is_event: boolean;
  event_details: string | null;
  photo_url: string | null;
  rating: number | null;
  totalRatings: number | null;
  googleMapsUrl: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  priceLevel: string | null;
  distance_km: number | null;
  not_verified?: boolean;
}

export interface StructuredFilters {
  category: string;
  when?: string[];
  vibe?: string[];
  budget?: string[];
  feeling_lucky?: boolean;
}

export interface ConciergeMessage {
  id: string;
  trip_id: string;
  user_id: string | null;
  role: "user" | "assistant";
  content: string | null;
  suggestions: ConciergeSuggestion[] | null;
  created_at: string;
}

export interface ConciergeReaction {
  id: string;
  message_id: string;
  suggestion_index: number;
  user_id: string;
}

interface ConciergeContext {
  destination: string;
  location?: string;
  user_location?: { lat: number; lng: number };
  date?: string;
  time_of_day?: string;
  group_size?: number;
  budget_level?: string;
  preferences?: string[];
  hotel_location?: { name: string; lat: number; lng: number };
}

export function useConcierge(tripId: string, context: ConciergeContext) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [sending, setSending] = useState(false);
  const [activeResult, setActiveResult] = useState<ConciergeMessage | null>(null);

  const { data: messages = [], isLoading: loadingMessages } = useQuery({
    queryKey: ["concierge-messages", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("concierge_messages")
        .select("*")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as ConciergeMessage[];
    },
    enabled: !!tripId,
    staleTime: 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const { data: reactions = [] } = useQuery({
    queryKey: ["concierge-reactions", tripId],
    queryFn: async () => {
      const messageIds = messages.filter((m) => m.role === "assistant").map((m) => m.id);
      if (messageIds.length === 0) return [];
      const { data, error } = await supabase
        .from("concierge_reactions")
        .select("*")
        .in("message_id", messageIds);
      if (error) throw error;
      return (data || []) as ConciergeReaction[];
    },
    enabled: messages.length > 0,
    staleTime: 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!tripId) return;
    const msgChannel = supabase
      .channel(`concierge-msgs-${tripId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "concierge_messages",
          filter: `trip_id=eq.${tripId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["concierge-messages", tripId] });
        }
      )
      .subscribe();

    const rxnChannel = supabase
      .channel(`concierge-rxns-${tripId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "concierge_reactions",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["concierge-reactions", tripId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(rxnChannel);
    };
  }, [tripId, queryClient]);

  const buildTransientResult = useCallback(
    (summary: string | null | undefined, suggestions: ConciergeSuggestion[] | null | undefined): ConciergeMessage | null => {
      if (!suggestions?.length) return null;
      return {
        id: `transient-${Date.now()}`,
        trip_id: tripId,
        user_id: null,
        role: "assistant",
        content: summary ?? null,
        suggestions,
        created_at: new Date().toISOString(),
      };
    },
    [tripId]
  );

  const sendMessage = useCallback(
    async (query: string) => {
      if (!query.trim() || sending) return;
      setSending(true);
      setActiveResult(null);

      try {
        const now = new Date();
        let date = context.date;
        let time_of_day = context.time_of_day;

        const q = query.toLowerCase();
        if (q.includes("tonight") || q.includes("this evening")) {
          date = now.toISOString().split("T")[0];
          time_of_day = "evening";
        } else if (q.includes("tomorrow")) {
          const tom = new Date(now);
          tom.setDate(tom.getDate() + 1);
          date = tom.toISOString().split("T")[0];
        } else if (q.includes("breakfast") || q.includes("morning")) {
          time_of_day = "morning";
        } else if (q.includes("lunch") || q.includes("afternoon")) {
          time_of_day = "afternoon";
        } else if (q.includes("dinner") || q.includes("evening")) {
          time_of_day = "evening";
        } else if (q.includes("night") || q.includes("party") || q.includes("club")) {
          time_of_day = "night";
        }

        if (!date) date = now.toISOString().split("T")[0];
        if (!time_of_day) {
          const hour = now.getHours();
          if (hour < 11) time_of_day = "morning";
          else if (hour < 14) time_of_day = "afternoon";
          else if (hour < 18) time_of_day = "evening";
          else time_of_day = "night";
        }

        const body = {
          trip_id: tripId,
          query,
          context: {
            ...context,
            date,
            time_of_day,
          },
        };

        const data = await queryClient.fetchQuery<{ summary?: string; suggestions: ConciergeSuggestion[]; error?: string }>({
          queryKey: ["concierge-suggest", tripId, "freetext", body],
          staleTime: CONCIERGE_SUGGEST_STALE_MS,
          gcTime: CONCIERGE_SUGGEST_GC_MS,
          retry: false,
          queryFn: async () => {
            const { data, error } = await supabase.functions.invoke("concierge-suggest", { body });
            if (error) throw error;
            if (!data || typeof data !== "object" || !Array.isArray(data.suggestions)) {
              console.error("Concierge: unexpected response shape:", data);
              throw new Error(data?.error || "Unexpected response from concierge");
            }
            return data;
          },
        });

        setActiveResult(buildTransientResult(data.summary, data.suggestions));
        queryClient.invalidateQueries({ queryKey: ["concierge-messages", tripId] });
      } catch (err) {
        console.error("Concierge error:", err);
        throw err;
      } finally {
        setSending(false);
      }
    },
    [tripId, context, sending, queryClient, buildTransientResult]
  );

  const sendStructuredRequest = useCallback(
    async (filters: StructuredFilters) => {
      if (sending) return;
      setSending(true);
      setActiveResult(null);

      try {
        const body = {
          trip_id: tripId,
          category: filters.category,
          when: filters.when,
          vibe: filters.vibe,
          budget: filters.budget,
          feeling_lucky: filters.feeling_lucky || false,
          context: {
            ...context,
            date: context.date || new Date().toISOString().split("T")[0],
          },
        };

        const data = await queryClient.fetchQuery<{ summary?: string; suggestions: ConciergeSuggestion[]; error?: string }>({
          queryKey: ["concierge-suggest", tripId, "structured", body],
          staleTime: CONCIERGE_SUGGEST_STALE_MS,
          gcTime: CONCIERGE_SUGGEST_GC_MS,
          retry: false,
          queryFn: async () => {
            const { data, error } = await supabase.functions.invoke("concierge-suggest", { body });
            if (error) throw error;
            if (!data || typeof data !== "object" || !Array.isArray(data.suggestions)) {
              console.error("Concierge: unexpected response shape:", data);
              throw new Error(data?.error || "Unexpected response from concierge");
            }
            return data;
          },
        });

        setActiveResult(buildTransientResult(data.summary, data.suggestions));
        queryClient.invalidateQueries({ queryKey: ["concierge-messages", tripId] });
      } catch (err) {
        console.error("Concierge error:", err);
        throw err;
      } finally {
        setSending(false);
      }
    },
    [tripId, context, sending, queryClient, buildTransientResult]
  );

  const toggleReaction = useCallback(
    async (messageId: string, suggestionIndex: number) => {
      if (!user) return;
      const existing = reactions.find(
        (r) => r.message_id === messageId && r.suggestion_index === suggestionIndex && r.user_id === user.id
      );
      if (existing) {
        await supabase.from("concierge_reactions").delete().eq("id", existing.id);
      } else {
        await supabase.from("concierge_reactions").insert({
          message_id: messageId,
          suggestion_index: suggestionIndex,
          user_id: user.id,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["concierge-reactions", tripId] });
    },
    [user, reactions, tripId, queryClient]
  );

  const getReactionInfo = useCallback(
    (messageId: string, suggestionIndex: number) => {
      const msgReactions = reactions.filter(
        (r) => r.message_id === messageId && r.suggestion_index === suggestionIndex
      );
      return {
        count: msgReactions.length,
        hasReacted: !!user && msgReactions.some((r) => r.user_id === user.id),
        isGroupPick: msgReactions.length >= 2,
      };
    },
    [reactions, user]
  );

  return {
    messages,
    activeResult,
    loadingMessages,
    sending,
    sendMessage,
    sendStructuredRequest,
    toggleReaction,
    getReactionInfo,
  };
}
