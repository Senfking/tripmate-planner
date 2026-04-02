import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface AttendanceRecord {
  id: string;
  trip_id: string;
  itinerary_item_id: string;
  user_id: string;
  status: "maybe" | "out";
}

export interface TripMember {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export function useItineraryAttendance(tripId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const attendanceKey = ["itinerary_attendance", tripId];
  const membersKey = ["trip_members_profiles", tripId];

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
        .select("user_id")
        .eq("trip_id", tripId);
      if (error) throw error;

      const userIds = memberRows.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .rpc("get_public_profiles", { _user_ids: userIds });

      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
      return userIds.map((uid) => ({
        user_id: uid,
        display_name: profileMap.get(uid)?.display_name || null,
        avatar_url: profileMap.get(uid)?.avatar_url || null,
      })) as TripMember[];
    },
    enabled: !!tripId && !!user,
  });

  const cycleStatus = useMutation({
    mutationFn: async (itemId: string) => {
      if (!user) throw new Error("Not authenticated");
      const existing = attendance.find(
        (a) => a.itinerary_item_id === itemId && a.user_id === user.id
      );

      if (!existing) {
        // attending → maybe: INSERT
        const { error } = await supabase.from("itinerary_attendance").insert({
          trip_id: tripId,
          itinerary_item_id: itemId,
          user_id: user.id,
          status: "maybe",
        });
        if (error) throw error;
      } else if (existing.status === "maybe") {
        // maybe → out: UPDATE
        const { error } = await supabase
          .from("itinerary_attendance")
          .update({ status: "out" })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        // out → attending: DELETE
        const { error } = await supabase
          .from("itinerary_attendance")
          .delete()
          .eq("id", existing.id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: attendanceKey }),
    onError: (e: any) => toast.error(e.message),
  });

  return { attendance, members, cycleStatus };
}
