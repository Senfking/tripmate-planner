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
      const normalizedPrimary = primaryCode ? primaryCode.toUpperCase() : null;

      // 1. Delete rows not in desired set.
      const toDelete = existing.filter((r) => !desired.has(r.nationality_iso.toUpperCase())).map((r) => r.id);
      if (toDelete.length > 0) {
        const { error } = await supabase.from("trip_traveller_passports").delete().in("id", toDelete);
        if (error) throw error;
      }

      // 2. Clear the previous primary BEFORE inserting / setting the new one.
      // The partial unique index idx_trip_traveller_passports_primary_account
      // forbids two is_primary=true rows for the same (trip_id, user_id), so
      // any insert or update that sets a new primary must be preceded by an
      // unset of the previous primary row whenever the primary is changing.
      const previousPrimaryRow = existing.find(
        (r) => r.is_primary && r.nationality_iso.toUpperCase() !== normalizedPrimary,
      );
      if (previousPrimaryRow) {
        const { error } = await supabase
          .from("trip_traveller_passports")
          .update({ is_primary: false })
          .eq("id", previousPrimaryRow.id);
        if (error) throw error;
      }

      // 3. Insert new rows with is_primary=false. The primary flag is applied
      // as a separate step (4) so the partial unique index can't fire on insert.
      const toInsert = [...desired]
        .filter((code) => !existingByCode.has(code))
        .map((code) => ({
          trip_id: tripId,
          user_id: userId,
          nationality_iso: code,
          is_primary: false,
        }));
      if (toInsert.length > 0) {
        const { error } = await supabase.from("trip_traveller_passports").insert(toInsert);
        if (error) throw error;
      }

      // 4. Set the new primary, scoped by (trip_id, user_id, nationality_iso)
      // so it works whether the row was just inserted or pre-existed.
      if (normalizedPrimary && desired.has(normalizedPrimary)) {
        const { error } = await supabase
          .from("trip_traveller_passports")
          .update({ is_primary: true })
          .eq("trip_id", tripId)
          .eq("user_id", userId)
          .eq("nationality_iso", normalizedPrimary);
        if (error) throw error;
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
