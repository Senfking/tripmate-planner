import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface TravellerPassport {
  id: string;
  trip_id: string;
  user_id: string | null;
  traveller_name: string | null;
  nationality_iso: string;
  is_primary: boolean;
  created_at: string;
}

export function useTripTravellerPassports(tripId: string | undefined) {
  return useQuery({
    queryKey: ["trip-traveller-passports", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_traveller_passports")
        .select("*")
        .eq("trip_id", tripId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TravellerPassport[];
    },
    enabled: !!tripId,
  });
}

interface SavePassportArgs {
  tripId: string;
  userId: string;
  nationalityCodes: string[]; // full desired set (uppercase ISO alpha-2)
  primaryCode: string | null;
  existing: TravellerPassport[]; // current rows for this user/trip
}

export function useUpdatePassport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tripId, userId, nationalityCodes, primaryCode, existing }: SavePassportArgs) => {
      const desired = new Set(nationalityCodes.map((c) => c.toUpperCase()));
      const existingByCode = new Map(existing.map((r) => [r.nationality_iso.toUpperCase(), r]));

      // Delete rows not in desired set
      const toDelete = existing.filter((r) => !desired.has(r.nationality_iso.toUpperCase())).map((r) => r.id);
      if (toDelete.length > 0) {
        const { error } = await supabase.from("trip_traveller_passports").delete().in("id", toDelete);
        if (error) throw error;
      }

      // Insert new rows
      const toInsert = [...desired]
        .filter((code) => !existingByCode.has(code))
        .map((code) => ({
          trip_id: tripId,
          user_id: userId,
          nationality_iso: code,
          is_primary: code === primaryCode,
        }));
      if (toInsert.length > 0) {
        const { error } = await supabase.from("trip_traveller_passports").insert(toInsert);
        if (error) throw error;
      }

      // Update primary flags on existing rows that remain
      const toUpdate = existing.filter((r) => desired.has(r.nationality_iso.toUpperCase()));
      for (const row of toUpdate) {
        const shouldBePrimary = row.nationality_iso.toUpperCase() === primaryCode;
        if (row.is_primary !== shouldBePrimary) {
          const { error } = await supabase
            .from("trip_traveller_passports")
            .update({ is_primary: shouldBePrimary })
            .eq("id", row.id);
          if (error) throw error;
        }
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["trip-traveller-passports", vars.tripId] });
      toast.success("Passport info saved");
    },
    onError: (err: any) => {
      toast.error("Couldn't save passport", { description: err?.message ?? "Please try again." });
    },
  });
}
