import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ChevronRight,
  AlertCircle,
  Plus,
  CheckCircle2,
  ShieldAlert,
  FileText,
  Loader2,
} from "lucide-react";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { countryName } from "@/lib/countries";
import { useTripTravellerPassports } from "@/hooks/useTripTravellerPassports";
import {
  useEntryRequirements,
  type EntryRequirementDoc,
} from "@/hooks/useEntryRequirements";

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

// Documents that represent real user action — exclude "Passport" itself,
// which the LLM always lists. Mirrors the same logic in EntryRequirementsBlock.
function actionableDocs(docs: EntryRequirementDoc[]): EntryRequirementDoc[] {
  return docs.filter(
    (d) => d.mandatory && !/^passport(\s|$|:)/i.test(d.name.trim()),
  );
}

/**
 * Compact "Entry & visa" card on the trip dashboard.
 *
 * Goes one step further than just linking to Bookings & Docs: it actually
 * fetches the entry-requirements result for this trip + the current user's
 * passport, so the dashboard can immediately reflect status:
 *   - "All clear" (no visa, no docs)
 *   - "Visa required" / N required documents
 *   - "Add nationality" CTA when missing
 *
 * Tapping the card always deep-links to the visa block in Bookings & Docs
 * for the full experience.
 */
export function TravellersSection({ tripId, myRole: _myRole }: TravellersSectionProps) {
  const { user, profile } = useAuth();
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

  // The dashboard card is happy with the user's nationality from either the
  // trip-level passport row OR their profile-level nationality_iso.
  const { data: passports } = useTripTravellerPassports(tripId);

  const destIso = trip?.destination_country_iso?.toUpperCase() ?? null;
  const destName = destIso ? countryName(destIso) : null;
  const profileNatIso = profile?.nationality_iso?.toUpperCase() ?? null;

  const myMember = (members ?? []).find((m) => m.userId === userId);
  const myNatIso =
    profileNatIso ??
    (passports ?? []).find((p) => p.user_id === userId && p.is_primary)?.nationality_iso?.toUpperCase() ??
    (passports ?? []).find((p) => p.user_id === userId)?.nationality_iso?.toUpperCase() ??
    myMember?.nationalityIso?.toUpperCase() ??
    null;
  const myNatName = myNatIso ? countryName(myNatIso) : null;

  const hasMyNat = !!myNatIso;
  const canFetchReqs = hasMyNat && !!destIso;

  const missingMembers = useMemo(
    () => (members ?? []).filter((m) => (m.userId === userId ? !hasMyNat : !m.nationalityIso)),
    [members, userId, hasMyNat],
  );
  const missingCount = missingMembers.length;

  const { data: entryData, isLoading: entryLoading } = useEntryRequirements({
    tripId,
    enabled: canFetchReqs,
  });

  // Derive a compact status the card can show directly, instead of the
  // generic "View" pill that gives no information.
  type Status =
    | { kind: "loading" }
    | { kind: "all-clear" }
    | { kind: "visa-required"; docCount: number }
    | { kind: "docs-required"; docCount: number }
    | { kind: "unknown" };

  const status: Status | null = useMemo(() => {
    if (!hasMyNat) return null;
    if (entryLoading) return { kind: "loading" };
    if (!entryData) return { kind: "unknown" };

    const docs = entryData.documents_needed ?? [];
    const reqDocs = actionableDocs(docs);

    const visaState = entryData.visa_required;
    const needsForm = !!entryData.entry_form_required;

    if (visaState === "yes" || needsForm) {
      return { kind: "visa-required", docCount: reqDocs.length };
    }
    if (visaState === "no" && reqDocs.length === 0) {
      return { kind: "all-clear" };
    }
    if (reqDocs.length > 0) {
      return { kind: "docs-required", docCount: reqDocs.length };
    }
    if (visaState === "no") return { kind: "all-clear" };
    return { kind: "unknown" };
  }, [hasMyNat, entryLoading, entryData]);

  const goToVisa = () => {
    navigate(`/app/trips/${tripId}/bookings#visa-entry-section`);
  };

  const goToProfile = () => {
    navigate("/app/more");
  };

  const opensFullDetails = status?.kind === "visa-required" || status?.kind === "docs-required";
  const handleCardClick = () => {
    if (!hasMyNat) goToProfile();
    else if (opensFullDetails) goToVisa();
  };

  // No destination resolved yet — render nothing rather than a useless card.
  if (!destIso) return null;

  const statusPill = (() => {
    if (!status) {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#0D9488]/10 text-[#0D9488] px-2.5 py-1 text-[11px] font-semibold">
          <Plus className="h-3 w-3" />
          Add
        </span>
      );
    }
    switch (status.kind) {
      case "loading":
        return (
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground px-2.5 py-1 text-[11px] font-semibold">
            <Loader2 className="h-3 w-3 animate-spin" />
            Checking
          </span>
        );
      case "all-clear":
        return (
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-[11px] font-semibold">
            <CheckCircle2 className="h-3 w-3" />
            All clear
          </span>
        );
      case "visa-required":
        return (
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2.5 py-1 text-[11px] font-semibold dark:bg-amber-950/40 dark:text-amber-300">
            <ShieldAlert className="h-3 w-3" />
            Visa needed
          </span>
        );
      case "docs-required":
        return (
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2.5 py-1 text-[11px] font-semibold dark:bg-amber-950/40 dark:text-amber-300">
            <FileText className="h-3 w-3" />
            {status.docCount} doc{status.docCount === 1 ? "" : "s"}
          </span>
        );
      case "unknown":
      default:
        return (
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground px-2.5 py-1 text-[11px] font-semibold">
            View
          </span>
        );
    }
  })();

  const subtitle = (() => {
    if (!hasMyNat) return "Add it to your profile to get personalized visa guidance";
    if (!status || status.kind === "loading")
      return `Checking entry rules for ${myNatName} passport holders…`;
    switch (status.kind) {
      case "all-clear":
        return `No visa needed for ${myNatName} passport holders`;
      case "visa-required":
        return status.docCount > 0
          ? `Visa required · ${status.docCount} document${status.docCount === 1 ? "" : "s"} to prepare`
          : `Visa required for ${myNatName} passport holders`;
      case "docs-required":
        return `${status.docCount} required document${status.docCount === 1 ? "" : "s"} to prepare`;
      case "unknown":
      default:
        return `Visa & entry rules for ${myNatName} passport holders`;
    }
  })();

  const title = hasMyNat ? `Entry to ${destName}` : "Set your nationality";
  const allClearPassportLine = entryData?.passport_validity
    ? `Passport: ${entryData.passport_validity}`
    : "Passport: carry a valid passport";
  const isInteractive = !hasMyNat || opensFullDetails;

  return (
    <div
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (!isInteractive) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCardClick();
        }
      }}
      id="travellers-section"
      className={`w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 p-4 transition-all ${isInteractive ? "hover:shadow-md active:scale-[0.99] cursor-pointer" : "cursor-default"}`}
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
          <p className="font-semibold text-[14px] text-foreground leading-tight">{title}</p>
          <p className="text-[12px] text-muted-foreground leading-snug mt-0.5 truncate">
            {subtitle}
          </p>
        </div>

        {statusPill}
      </div>

      {status?.kind === "all-clear" && (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3">
          <div className="rounded-xl bg-primary/10 px-3 py-2">
            <p className="text-[11px] font-semibold text-primary">Visa</p>
            <p className="mt-0.5 text-[12px] text-foreground">Not required</p>
          </div>
          <div className="rounded-xl bg-muted/50 px-3 py-2">
            <p className="text-[11px] font-semibold text-muted-foreground">Documents</p>
            <p className="mt-0.5 text-[12px] text-foreground">No extra docs</p>
          </div>
          <p className="col-span-2 text-[11.5px] leading-snug text-muted-foreground">
            {allClearPassportLine}. Verify official rules before travel.
          </p>
        </div>
      )}

      {/* Required-docs preview — show up to 2 mandatory items inline so the
          user sees exactly what they need without leaving the dashboard. */}
      {status?.kind === "visa-required" || status?.kind === "docs-required" ? (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
          {actionableDocs(entryData?.documents_needed ?? [])
            .slice(0, 2)
            .map((doc) => (
              <div
                key={doc.name}
                className="flex items-center gap-2 text-[12px] text-foreground/80"
              >
                <FileText className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span className="font-medium truncate">{doc.name}</span>
              </div>
            ))}
          {(actionableDocs(entryData?.documents_needed ?? []).length ?? 0) > 2 && (
            <p className="text-[11.5px] text-muted-foreground pl-5">
              +{actionableDocs(entryData?.documents_needed ?? []).length - 2} more
            </p>
          )}
        </div>
      ) : null}

      {/* Co-traveller summary — only when there are other members and some
          are missing nationality data. */}
      {hasMyNat && (members?.length ?? 0) > 1 && missingCount > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 text-[11.5px] text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span className="flex-1">
            {missingCount} {missingCount === 1 ? "traveller hasn't" : "travellers haven't"} set their nationality
          </span>
          <div className="flex -space-x-1.5">
            {(members ?? [])
              .filter((m) => missingMembers.some((missing) => missing.userId === m.userId))
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
    </div>
  );
}
