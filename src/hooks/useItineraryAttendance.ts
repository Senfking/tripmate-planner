import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";

export interface AttendanceRecord {
  id: string;
  trip_id: string;
  itinerary_item_id: string;
  user_id: string;
  status: "maybe" | "out";
}

export interface TripMember {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  joinedAt: string;
  attendanceStatus: string;
}

export function useItineraryAttendance(tripId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const attendanceKey = ["itinerary_attendance", tripId];
  const membersKey = ["members", tripId];
  const inflightRef = useRef(new Set<string>());

  const { data: attendance = [] } = useQuery({
    queryKey: attendanceKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("itinerary_attendance")
        .select("*")
        .eq("trip_id", tripId);
      if (error) throw error;
      return data as AttendanceRecord[];
    },
    enabled: !!tripId && !!user,
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: members = [] } = useQuery({
    queryKey: membersKey,
    queryFn: async () => {
      const { data: memberRows, error } = await supabase
        .from("trip_members")
        .select("user_id, role, joined_at, attendance_status")
        .eq("trip_id", tripId)
        .order("joined_at");
      if (error) throw error;

      const userIds = memberRows.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .rpc("get_public_profiles", { _user_ids: userIds });

      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
      return memberRows.map((m) => ({
        userId: m.user_id,
        displayName: profileMap.get(m.user_id)?.display_name || "Member",
        avatarUrl: profileMap.get(m.user_id)?.avatar_url || null,
        role: m.role,
        joinedAt: m.joined_at,
        attendanceStatus: (m as any).attendance_status ?? "pending",
      })) as TripMember[];
    },
    enabled: !!tripId && !!user,
  });

  const cycleStatus = useMutation({
    mutationFn: async (itemId: string) => {
      if (!user) throw new Error("Not authenticated");

      // Guard against concurrent mutations on the same item
      if (inflightRef.current.has(itemId)) return;
      inflightRef.current.add(itemId);

      try {
        // Read current state from the query cache (not the stale closure)
        const cached = qc.getQueryData<AttendanceRecord[]>(attendanceKey) ?? [];
        const existing = cached.find(
          (a) =>
            a.itinerary_item_id === itemId &&
            a.user_id === user.id &&
            !a.id.startsWith("optimistic-")
        );

        if (!existing) {
          const { error } = await supabase.from("itinerary_attendance").insert({
            trip_id: tripId,
            itinerary_item_id: itemId,
            user_id: user.id,
            status: "maybe",
          });
          if (error) throw error;
        } else if (existing.status === "maybe") {
          const { error } = await supabase
            .from("itinerary_attendance")
            .update({ status: "out" })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("itinerary_attendance")
            .delete()
            .eq("id", existing.id);
          if (error) throw error;
        }
      } finally {
        inflightRef.current.delete(itemId);
      }
    },
    onMutate: async (itemId: string) => {
      // Skip optimistic update if a mutation is already in-flight for this item
      if (inflightRef.current.has(itemId)) return {};

      await qc.cancelQueries({ queryKey: attendanceKey });
      const prev = qc.getQueryData<AttendanceRecord[]>(attendanceKey);
      if (!user) return { prev };

      qc.setQueryData<AttendanceRecord[]>(attendanceKey, (old = []) => {
        const existing = old.find(
          (a) => a.itinerary_item_id === itemId && a.user_id === user.id
        );
        if (!existing) {
          return [...old, { id: `optimistic-${crypto.randomUUID()}`, trip_id: tripId, itinerary_item_id: itemId, user_id: user.id, status: "maybe" as const }];
        } else if (existing.status === "maybe") {
          return old.map((a) => a.id === existing.id ? { ...a, status: "out" as const } : a);
        } else {
          return old.filter((a) => a.id !== existing.id);
        }
      });
      return { prev };
    },
    onError: (e: any, _itemId, context) => {
      if (context?.prev) qc.setQueryData(attendanceKey, context.prev);
      toast.error("Couldn't update your attendance. Please try again.");
    },
    onSettled: (_data, _err, itemId) => {
      if (!_err) trackEvent("attendance_status_changed", { trip_id: tripId, item_id: itemId }, user?.id);
      qc.invalidateQueries({ queryKey: attendanceKey });
    },
  });

  return { attendance, members, cycleStatus };
}
