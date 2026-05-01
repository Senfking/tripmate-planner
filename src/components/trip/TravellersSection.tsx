import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, User, Pencil, ShieldCheck, ChevronDown } from "lucide-react";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useTripTravellerPassports, type TravellerPassport } from "@/hooks/useTripTravellerPassports";
import { countryName } from "@/lib/countries";
import { PassportEditModal } from "./PassportEditModal";

const INITIAL_VISIBLE = 4;

interface TravellersSectionProps {
  tripId: string;
  myRole?: string;
}

interface MemberLite {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

function getInitial(name: string | null | undefined) {
  return (name || "?").charAt(0).toUpperCase();
}

export function TravellersSection({ tripId, myRole }: TravellersSectionProps) {
  const { user } = useAuth();
  const userId = user?.id;
  const isAdminOrOwner = myRole === "owner" || myRole === "admin";
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

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
      const map = new Map(
        profiles?.map((p) => [p.id, { name: p.display_name || "Member", avatar: p.avatar_url ?? null }]) ?? []
      );
      return data.map<MemberLite>((m) => ({
        userId: m.user_id,
        displayName: map.get(m.user_id)?.name ?? "Member",
        avatarUrl: map.get(m.user_id)?.avatar ?? null,
      }));
    },
    enabled: !!tripId,
  });

  const { data: trip } = useQuery({
    queryKey: ["trip-destination-iso", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("destination_country_iso")
        .eq("id", tripId)
        .single();
      if (error) throw error;
      return data as { destination_country_iso: string | null };
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

  const myHasPassport = userId ? (passportsByUser.get(userId)?.length ?? 0) > 0 : false;
  const showVisaHint = myHasPassport && !!trip?.destination_country_iso;

  return (
    <div id="travellers-section" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="font-semibold text-[15px] text-foreground">Who's traveling</h3>
        {totalWithPassports === 0 && (
          <span className="text-[11px] text-muted-foreground">Optional</span>
        )}
      </div>
      <p className="text-[12px] text-muted-foreground mb-3 leading-relaxed">
        {totalWithPassports === 0
          ? "Add your nationality to get personalized visa and entry guidance"
          : "Add nationalities to see personalized entry requirements"}
      </p>

      <div className="space-y-2">
        {(expanded ? (members ?? []) : (members ?? []).slice(0, INITIAL_VISIBLE)).map((m) => {
          const rows = passportsByUser.get(m.userId) ?? [];
          const canEdit = m.userId === userId || isAdminOrOwner;
          const sorted = [...rows].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
          const hasNats = sorted.length > 0;
          return (
            <div
              key={m.userId}
              className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5"
            >
              <Avatar className="h-8 w-8 shrink-0">
                {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt={m.displayName} />}
                <AvatarFallback className="bg-[#0D9488]/10 text-[#0D9488] text-xs font-medium">
                  {getInitial(m.displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{m.displayName}</p>
                {hasNats ? (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    {sorted.map((r) => {
                      const code = r.nationality_iso.toUpperCase();
                      return (
                        <span
                          key={r.id}
                          title={`${countryName(code)}${r.is_primary ? " (Primary)" : ""}`}
                          className={
                            r.is_primary
                              ? "inline-flex items-center gap-1 rounded-full bg-[#0D9488]/10 ring-1 ring-[#0D9488]/30 pl-0.5 pr-1.5 py-0.5"
                              : "inline-flex items-center gap-1 rounded-full bg-muted pl-0.5 pr-1.5 py-0.5"
                          }
                        >
                          <CountryFlag code={code} size={20} />
                          <span
                            className={
                              r.is_primary
                                ? "font-mono text-[10px] font-semibold tracking-wide text-[#0D9488]"
                                : "font-mono text-[10px] font-semibold tracking-wide text-muted-foreground"
                            }
                          >
                            {code}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground mt-0.5">No nationality added</p>
                )}
              </div>
              {canEdit ? (
                hasNats ? (
                  <button
                    type="button"
                    onClick={() => setEditingUserId(m.userId)}
                    className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label="Edit nationalities"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingUserId(m.userId)}
                    className="h-8 px-2 text-[#0D9488] hover:bg-[#0D9488]/10 hover:text-[#0D9488]"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    <span className="text-xs">Add nationality</span>
                  </Button>
                )
              ) : null}
            </div>
          );
        })}
      </div>

      {(members?.length ?? 0) > INITIAL_VISIBLE && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 w-full flex items-center justify-center gap-1 rounded-xl py-2 text-[12px] font-medium text-[#0D9488] hover:bg-[#0D9488]/[0.06] transition-colors"
        >
          {expanded ? "Show less" : `Show ${(members?.length ?? 0) - INITIAL_VISIBLE} more`}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      )}

      {showVisaHint && (
        <button
          type="button"
          onClick={() => {
            const el = document.getElementById("visa-entry-section");
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          className="mt-3 w-full flex items-center gap-2 rounded-xl bg-[#0D9488]/[0.06] hover:bg-[#0D9488]/[0.1] transition-colors px-3 py-2 text-left"
        >
          <ShieldCheck className="h-3.5 w-3.5 text-[#0D9488] shrink-0" />
          <span className="text-[12px] font-medium text-[#0D9488] flex-1">
            Visa requirements available
          </span>
          <span className="text-[11px] text-[#0D9488]/80">View →</span>
        </button>
      )}

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
