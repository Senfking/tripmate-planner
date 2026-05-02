import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Plane, AlertCircle, Plus } from "lucide-react";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { countryName } from "@/lib/countries";

interface TravellersSectionProps {
  tripId: string;
  myRole?: string;
}

interface MemberLite {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  nationalityIso: string | null;
}

function getInitial(name: string | null | undefined) {
  return (name || "?").charAt(0).toUpperCase();
}

/**
 * Compact "Entry & visa" card.
 *
 * The previous version showed a full member list with redundant per-row
 * "Visa info" pills and a footer button that scrolled to a section that
 * doesn't exist on the dashboard (it lives in Bookings & Docs), making the
 * CTA look broken. Members are already represented elsewhere on the
 * dashboard (header chip + avatars), so this card focuses purely on the
 * one job nationality data is needed for: getting visa guidance for the
 * destination.
 */
export function TravellersSection({ tripId, myRole: _myRole }: TravellersSectionProps) {
  const { user } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();

  const { data: members } = useQuery({
    queryKey: ["trip-travellers-members-v4", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_members")
        .select("user_id, joined_at")
        .eq("trip_id", tripId)
        .order("joined_at");
      if (error) throw error;
      const ids = data.map((m) => m.user_id);
      if (ids.length === 0) return [] as MemberLite[];

      const [pub, profs] = await Promise.all([
        supabase.rpc("get_public_profiles", { _user_ids: ids }),
        supabase.from("profiles").select("id, nationality_iso").in("id", ids),
      ]);

      const pubMap = new Map(
        pub.data?.map((p) => [
          p.id,
          { name: p.display_name || "Member", avatar: p.avatar_url ?? null },
        ]) ?? [],
      );
      const natMap = new Map(
        profs.data?.map((p) => [p.id, (p as any).nationality_iso as string | null]) ?? [],
      );

      return data.map<MemberLite>((m) => ({
        userId: m.user_id,
        displayName: pubMap.get(m.user_id)?.name ?? "Member",
        avatarUrl: pubMap.get(m.user_id)?.avatar ?? null,
        nationalityIso: natMap.get(m.user_id) ?? null,
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

  const destIso = trip?.destination_country_iso?.toUpperCase() ?? null;
  const destName = destIso ? countryName(destIso) : null;

  const myMember = (members ?? []).find((m) => m.userId === userId);
  const myNatIso = myMember?.nationalityIso?.toUpperCase() ?? null;
  const myNatName = myNatIso ? countryName(myNatIso) : null;

  const missingCount = useMemo(
    () => (members ?? []).filter((m) => !m.nationalityIso).length,
    [members],
  );

  const goToVisa = () => {
    navigate(`/app/trips/${tripId}/bookings#visa-entry-section`);
  };

  const goToProfile = () => {
    navigate("/app/profile");
  };

  // No destination resolved yet — render nothing rather than a useless card.
  if (!destIso) return null;

  // Primary state: I have my nationality set → show route + CTA.
  const hasMyNat = !!myNatIso;

  return (
    <button
      type="button"
      onClick={hasMyNat ? goToVisa : goToProfile}
      id="travellers-section"
      className="w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-all active:scale-[0.99]"
    >
      <div className="flex items-center gap-3">
        {/* Route visual: my flag → destination flag */}
        <div className="flex items-center gap-1.5 shrink-0">
          {hasMyNat ? (
            <CountryFlag code={myNatIso!} size={28} />
          ) : (
            <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
              <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          )}
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
          <CountryFlag code={destIso} size={28} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[14px] text-foreground leading-tight">
            {hasMyNat ? (
              <>Entry to {destName}</>
            ) : (
              <>Set your nationality</>
            )}
          </p>
          <p className="text-[12px] text-muted-foreground leading-snug mt-0.5">
            {hasMyNat ? (
              <>
                Visa & entry rules for {myNatName} passport holders
              </>
            ) : (
              <>Add it to your profile to get personalized visa guidance</>
            )}
          </p>
        </div>

        <div className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#0D9488]/10 text-[#0D9488] px-2.5 py-1 text-[11px] font-semibold">
          <Plane className="h-3 w-3" />
          {hasMyNat ? "View" : "Add"}
        </div>
      </div>

      {/* Co-traveller summary — only when there are other members and some
          are missing nationality data. Encourages everyone to set their
          profile so visa info covers the whole group. */}
      {hasMyNat && (members?.length ?? 0) > 1 && missingCount > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 text-[11.5px] text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span className="flex-1">
            {missingCount} {missingCount === 1 ? "traveller hasn't" : "travellers haven't"} set their nationality
          </span>
          <div className="flex -space-x-1.5">
            {(members ?? [])
              .filter((m) => !m.nationalityIso)
              .slice(0, 3)
              .map((m) => (
                <Avatar key={m.userId} className="h-5 w-5 ring-2 ring-white">
                  {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt={m.displayName} />}
                  <AvatarFallback className="bg-muted text-[9px] font-medium">
                    {getInitial(m.displayName)}
                  </AvatarFallback>
                </Avatar>
              ))}
          </div>
        </div>
      )}
    </button>
  );
}
