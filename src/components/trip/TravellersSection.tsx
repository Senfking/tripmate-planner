import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, User, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useTripTravellerPassports, type TravellerPassport } from "@/hooks/useTripTravellerPassports";
import { PassportEditModal } from "./PassportEditModal";

interface TravellersSectionProps {
  tripId: string;
  myRole?: string;
}

interface MemberLite {
  userId: string;
  displayName: string;
}

export function TravellersSection({ tripId, myRole }: TravellersSectionProps) {
  const { user } = useAuth();
  const userId = user?.id;
  const isAdminOrOwner = myRole === "owner" || myRole === "admin";
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  const { data: members } = useQuery({
    queryKey: ["trip-travellers-members", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_members")
        .select("user_id, joined_at")
        .eq("trip_id", tripId)
        .order("joined_at");
      if (error) throw error;
      const ids = data.map((m) => m.user_id);
      const { data: profiles } = await supabase.rpc("get_public_profiles", { _user_ids: ids });
      const map = new Map(profiles?.map((p) => [p.id, p.display_name || "Member"]) ?? []);
      return data.map<MemberLite>((m) => ({
        userId: m.user_id,
        displayName: map.get(m.user_id) ?? "Member",
      }));
    },
    enabled: !!tripId,
  });

  const { data: passports } = useTripTravellerPassports(tripId);

  const passportsByUser = useMemo(() => {
    const map = new Map<string, TravellerPassport[]>();
    (passports ?? []).forEach((p) => {
      if (!p.user_id) return;
      const arr = map.get(p.user_id) ?? [];
      arr.push(p);
      map.set(p.user_id, arr);
    });
    return map;
  }, [passports]);

  const editingMember = members?.find((m) => m.userId === editingUserId);
  const editingExisting = editingUserId ? passportsByUser.get(editingUserId) ?? [] : [];

  const totalWithPassports = useMemo(
    () => Array.from(passportsByUser.keys()).length,
    [passportsByUser],
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-[15px] text-foreground">Travellers</h3>
        {totalWithPassports === 0 && (
          <span className="text-[11px] text-muted-foreground">Optional</span>
        )}
      </div>

      {totalWithPassports === 0 && (
        <p className="text-[12px] text-muted-foreground mb-3 leading-relaxed">
          Add passport info to get personalized visa and entry guidance
        </p>
      )}

      <div className="space-y-2">
        {(members ?? []).map((m) => {
          const rows = passportsByUser.get(m.userId) ?? [];
          const canEdit = m.userId === userId || isAdminOrOwner;
          const sorted = [...rows].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
          return (
            <div
              key={m.userId}
              className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5"
            >
              <div className="h-8 w-8 rounded-full bg-[#0D9488]/10 flex items-center justify-center shrink-0">
                <User className="h-4 w-4 text-[#0D9488]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{m.displayName}</p>
                {sorted.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {sorted.map((r) => (
                      <span
                        key={r.id}
                        className={
                          r.is_primary
                            ? "font-mono text-[10px] font-semibold tracking-wide rounded px-1.5 py-0.5 bg-[#0D9488] text-white"
                            : "font-mono text-[10px] font-semibold tracking-wide rounded px-1.5 py-0.5 bg-muted text-muted-foreground"
                        }
                      >
                        {r.nationality_iso.toUpperCase()}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground mt-0.5">No passport added</p>
                )}
              </div>
              {canEdit ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingUserId(m.userId)}
                  className="h-8 px-2 text-[#0D9488] hover:bg-[#0D9488]/10 hover:text-[#0D9488]"
                >
                  {sorted.length === 0 ? (
                    <>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      <span className="text-xs">Add passport</span>
                    </>
                  ) : (
                    <>
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      <span className="text-xs">Edit</span>
                    </>
                  )}
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>

      {editingMember && editingUserId && (
        <PassportEditModal
          open={true}
          onOpenChange={(o) => !o && setEditingUserId(null)}
          tripId={tripId}
          userId={editingUserId}
          travellerName={editingMember.displayName}
          existing={editingExisting}
        />
      )}
    </div>
  );
}
