import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

async function adminQuery(type: string, params: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("admin-query", {
    body: { type, ...params },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export function useAdminData(type: string, params: Record<string, unknown> = {}, opts?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: ["admin", type, params],
    queryFn: () => adminQuery(type, params),
    staleTime: 1000 * 60 * 2,
    refetchInterval: opts?.refetchInterval,
  });
}

export function useAdminMutation(type: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: Record<string, unknown>) => adminQuery(type, params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
  });
}

/**
 * Subscribe to realtime changes on admin_notifications and feedback tables.
 * Invalidates relevant React Query keys instantly when rows are inserted/updated.
 */
export function useAdminNotificationsRealtime() {
  const qc = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel("admin-notifications-realtime")
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "admin_notifications" },
        () => {
          qc.invalidateQueries({ queryKey: ["admin", "notifications_list"] });
          qc.invalidateQueries({ queryKey: ["admin", "notifications_unread_count"] });
        }
      )
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "feedback" },
        () => {
          qc.invalidateQueries({ queryKey: ["admin", "feedback_list"] });
          qc.invalidateQueries({ queryKey: ["admin", "notifications_list"] });
          qc.invalidateQueries({ queryKey: ["admin", "notifications_unread_count"] });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [qc]);
}
