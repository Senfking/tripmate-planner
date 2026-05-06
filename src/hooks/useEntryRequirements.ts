import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ensureFreshSession, forceRefreshSession } from "@/lib/sessionRefresh";
import { toast } from "sonner";

export interface EntryRequirementDoc {
  name: string;
  description?: string;
  mandatory: boolean;
}

export interface EntryRequirementsResult {
  summary?: string;
  // Server returns a string enum, not a boolean. The old `boolean` typing was
  // wrong — left the field optional so older cached responses don't crash.
  visa_required?: "yes" | "no" | "depends" | "unknown";
  documents_needed?: EntryRequirementDoc[];
  passport_validity?: string;
  entry_form_required?: { type: string; url: string } | null;
  embassy_url?: string;
  additional_notes?: string[];
  confidence?: "high" | "medium" | "low" | "unknown";
  generated_at?: string;
  disclaimer?: string;
  source_trip_id?: string;
  recommended_passport?: string;
}

export interface EntryReqAck {
  id: string;
  trip_id: string;
  user_id: string;
  requirement_name: string;
  acknowledged_at: string;
}

interface UseArgs {
  tripId: string;
  enabled: boolean;
}

export function useEntryRequirements({ tripId, enabled }: UseArgs) {
  return useQuery({
    queryKey: ["entry-requirements", tripId],
    queryFn: async (): Promise<EntryRequirementsResult> => {
      const { data, error } = await supabase.functions.invoke("get-entry-requirements", {
        body: { trip_id: tripId },
      });
      if (error) throw error;
      return (data ?? {}) as EntryRequirementsResult;
    },
    enabled: !!tripId && enabled,
    staleTime: 1000 * 60 * 60, // 1h
    retry: 1,
  });
}

export function useEntryReqAcks(tripId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["entry-req-acks", tripId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_entry_requirement_acknowledgments" as any)
        .select("*")
        .eq("trip_id", tripId)
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []) as unknown as EntryReqAck[];
    },
    enabled: !!tripId && !!user,
  });
}

export function useAcknowledgeEntryReq(tripId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (requirementName: string) => {
      const { error } = await supabase
        .from("trip_entry_requirement_acknowledgments" as any)
        .insert({
          trip_id: tripId,
          user_id: user!.id,
          requirement_name: requirementName,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entry-req-acks", tripId, user?.id] });
    },
    onError: (err: any) => {
      toast.error("Couldn't confirm", { description: err?.message ?? "Please try again." });
    },
  });
}

export function useUnacknowledgeEntryReq(tripId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (requirementName: string) => {
      const { error } = await supabase
        .from("trip_entry_requirement_acknowledgments" as any)
        .delete()
        .eq("trip_id", tripId)
        .eq("user_id", user!.id)
        .eq("requirement_name", requirementName);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entry-req-acks", tripId, user?.id] });
    },
  });
}
