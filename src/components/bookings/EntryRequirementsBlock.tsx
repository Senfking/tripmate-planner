import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTripTravellerPassports } from "@/hooks/useTripTravellerPassports";
import {
  useEntryRequirements,
  useEntryReqAcks,
  useAcknowledgeEntryReq,
  useUnacknowledgeEntryReq,
  type EntryRequirementDoc,
} from "@/hooks/useEntryRequirements";
import { COUNTRIES } from "@/lib/countries";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  ExternalLink,
  FileText,
  ShieldCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  Upload,
  Sparkles,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";

interface Props {
  tripId: string;
  onUploadForRequirement: (requirementName: string) => void;
}

function countryName(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const match = COUNTRIES.find((c) => c.code === iso.toUpperCase());
  return match?.name ?? iso.toUpperCase();
}

// "Passport" itself is always listed as a doc (the LLM is instructed to
// include it). For the "all clear" state we only care about non-passport
// mandatory documents — those represent actual user action.
function actionableDocCount(docs: EntryRequirementDoc[]): number {
  return docs.filter(
    (d) => d.mandatory && !/^passport(\s|$|:)/i.test(d.name.trim()),
  ).length;
}

export function EntryRequirementsBlock({ tripId, onUploadForRequirement }: Props) {
  const { user, profile } = useAuth();

  // Trip destination ISO
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
    enabled: !!user,
  });

  const { data: passports } = useTripTravellerPassports(tripId);
  const myPassports = useMemo(
    () => (passports ?? []).filter((p) => p.user_id === user?.id),
    [passports, user?.id],
  );
  const profileNationality = profile?.nationality_iso?.toUpperCase() ?? null;
  const primaryNationality = myPassports[0]?.nationality_iso ?? profileNationality;

  const hasNationality = myPassports.length > 0 || !!profileNationality;
  const hasDestIso = !!trip?.destination_country_iso;
  const canFetch = hasNationality && hasDestIso;

  const { data, isLoading, isError, refetch, isFetching } = useEntryRequirements({
    tripId,
    enabled: canFetch,
  });

  const { data: acks } = useEntryReqAcks(tripId);
  const ackMutation = useAcknowledgeEntryReq(tripId);
  const unackMutation = useUnacknowledgeEntryReq(tripId);

  const ackedNames = useMemo(
    () => new Set((acks ?? []).map((a) => a.requirement_name.toLowerCase())),
    [acks],
  );

  const destName = countryName(trip?.destination_country_iso);

  // Empty state: no destination country ISO — make it visible (was silent before)
  if (!hasDestIso) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-900 leading-snug dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-200">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Set destination country to see entry requirements</p>
          <p className="mt-0.5 text-amber-900/80 dark:text-amber-200/80">
            We need the destination country to look up visa and document rules. Edit the trip
            destination from the trip overview to enable this.
          </p>
        </div>
      </div>
    );
  }

  // Empty state: destination set but user has no nationality
  if (!hasNationality) {
    return (
      <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-[12.5px] text-muted-foreground leading-snug">
        Add your nationality to see personalized entry requirements.{" "}
        <Link
          to="/app/more"
          className="font-medium text-[#0D9488] hover:underline"
        >
          Open profile →
        </Link>
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="rounded-lg bg-muted/40 px-3 py-2">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="mt-1.5 h-2.5 w-1/2" />
        </div>
        {[0, 1].map((i) => (
          <div key={i} className="rounded-lg border border-border/60 border-l-4 border-l-[#0D9488] bg-card p-3">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="mt-2 h-2.5 w-full" />
            <Skeleton className="mt-1 h-2.5 w-4/5" />
          </div>
        ))}
      </div>
    );
  }

  // Error
  if (isError) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-900 leading-snug dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-200">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            Couldn't load AI entry requirements.{" "}
            <button
              type="button"
              onClick={() => refetch()}
              className="font-medium underline hover:no-underline"
            >
              Try again
            </button>
            .
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const docs: EntryRequirementDoc[] = data.documents_needed ?? [];
  const summary = data.summary;
  const embassy = data.embassy_url;
  const confidence = data.confidence ?? "unknown";
  const disclaimerText =
    data.disclaimer ??
    "AI-generated guidance, not legal advice. Visa rules change frequently. Always verify with the embassy or official source before booking.";

  // Positive "all clear" state: visa not required, no pre-arrival authorisation
  // (ESTA/ETIAS/eTA), and no actionable mandatory documents beyond carrying
  // your passport. Visibility = reassurance — we used to render only the
  // summary line here, which left users wondering whether the section had
  // failed to load.
  const isAllClear =
    data.visa_required === "no" &&
    !data.entry_form_required &&
    actionableDocCount(docs) === 0;

  if (isAllClear) {
    return (
      <AllClearState
        destName={destName}
          nationality={primaryNationality ?? null}
        passportValidity={data.passport_validity}
        summary={summary}
        embassy={embassy}
        additionalNotes={data.additional_notes}
        disclaimer={disclaimerText}
      />
    );
  }

  return (
    <div className="space-y-2">
      {/* (b) Subtle info row */}
      {(summary || destName) && (
        <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-[12.5px] leading-snug">
          {destName && (
            <span className="font-medium text-foreground">
              Entry requirements for {destName}:
            </span>
          )}{" "}
          <span className="text-muted-foreground">{summary ?? "—"}</span>
          {embassy && (
            <>
              {" "}
              <a
                href={embassy}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 font-medium text-[#0D9488] hover:underline whitespace-nowrap"
              >
                Verify on official site
                <ExternalLink className="h-3 w-3" />
              </a>
            </>
          )}
        </div>
      )}

      {/* (4) Confidence banners */}
      {confidence === "low" && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-900 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-200">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>Limited confidence in this result. Please verify directly with the embassy.</span>
        </div>
      )}
      {confidence === "unknown" && (
        <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-[12px] text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            We couldn't determine entry requirements with certainty. Please check the embassy site
            directly.
          </span>
        </div>
      )}

      {/* (c) Strong non-dismissable disclaimer */}
      {docs.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-300 px-3 py-2.5 text-[12px] text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span className="leading-snug">{disclaimerText}</span>
        </div>
      )}

      {/* (d) Document rows */}
      {docs.map((doc) => {
        const isAcked = ackedNames.has(doc.name.toLowerCase());
        const ackRow = (acks ?? []).find(
          (a) => a.requirement_name.toLowerCase() === doc.name.toLowerCase(),
        );

        if (isAcked) {
          return (
            <div
              key={doc.name}
              className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-[12.5px] dark:bg-emerald-950/20 dark:border-emerald-900"
            >
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="flex-1 min-w-0">
                <span className="font-medium text-foreground">{doc.name}</span>
                <span className="text-muted-foreground">
                  {" · Confirmed"}
                  {ackRow?.acknowledged_at
                    ? ` on ${format(new Date(ackRow.acknowledged_at), "MMM d")}`
                    : ""}
                </span>
              </div>
              <button
                type="button"
                onClick={() => unackMutation.mutate(doc.name)}
                disabled={unackMutation.isPending}
                className="text-[11.5px] font-medium text-muted-foreground hover:text-foreground hover:underline shrink-0"
              >
                Undo
              </button>
            </div>
          );
        }

        return (
          <div
            key={doc.name}
            className="rounded-lg border border-border/60 border-l-4 border-l-[#0D9488] bg-card p-3"
          >
            <div className="flex items-start gap-2">
              <FileText className="h-4 w-4 text-[#0D9488] shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[13px] font-semibold text-foreground leading-tight">
                    {doc.name}
                  </span>
                  <span
                    className={
                      doc.mandatory
                        ? "inline-flex items-center rounded-full bg-red-100 text-red-700 px-1.5 py-0 text-[10px] font-semibold dark:bg-red-950/40 dark:text-red-300"
                        : "inline-flex items-center rounded-full bg-muted text-muted-foreground px-1.5 py-0 text-[10px] font-semibold"
                    }
                  >
                    {doc.mandatory ? "Required" : "Recommended"}
                  </span>
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-muted text-muted-foreground px-1.5 py-0 text-[10px] font-medium">
                    <Sparkles className="h-2.5 w-2.5" />
                    AI-suggested
                  </span>
                </div>
                {doc.description && (
                  <p className="mt-1 text-[12px] text-muted-foreground leading-snug">
                    {doc.description}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onUploadForRequirement(doc.name)}
                    className="inline-flex items-center gap-1 rounded-md bg-[#0D9488] text-white px-2.5 py-1 text-[11.5px] font-medium hover:bg-[#0a7c72] transition-colors"
                  >
                    <Upload className="h-3 w-3" />
                    Upload document
                  </button>
                  <button
                    type="button"
                    onClick={() => ackMutation.mutate(doc.name)}
                    disabled={ackMutation.isPending}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-[11.5px] font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    {ackMutation.isPending && ackMutation.variables === doc.name ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                    I have this
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {isFetching && !isLoading && (
        <p className="text-[11px] text-muted-foreground/70 text-center pt-1">
          Refreshing entry requirements…
        </p>
      )}
    </div>
  );
}

interface AllClearProps {
  destName: string | null;
  nationality: string | null;
  passportValidity?: string;
  summary?: string;
  embassy?: string;
  additionalNotes?: string[];
  disclaimer: string;
}

function AllClearState({
  destName,
  nationality,
  passportValidity,
  summary,
  embassy,
  additionalNotes,
  disclaimer,
}: AllClearProps) {
  const [open, setOpen] = useState(false);
  const nationalityName = countryName(nationality);
  const possessive = nationalityName ? `Your ${nationalityName} passport` : "Your passport";
  const destPhrase = destName ? ` for ${destName}` : "";
  const hasDetails = !!(passportValidity || summary || embassy || (additionalNotes && additionalNotes.length > 0));

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:bg-emerald-950/20 dark:border-emerald-900">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-emerald-900 dark:text-emerald-200">
            Entry requirements: All clear
          </p>
          <p className="mt-1 text-[12.5px] text-emerald-900/85 dark:text-emerald-200/80 leading-snug">
            {possessive} doesn&apos;t require a visa{destPhrase}. No additional entry documents needed.
          </p>
          <p className="mt-1.5 text-[11.5px] text-emerald-900/70 dark:text-emerald-200/60 leading-snug">
            Always verify with the destination&apos;s embassy before travel.
          </p>
          {hasDetails && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-medium text-emerald-800 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-200"
            >
              <ChevronDown
                className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
              />
              {open ? "Hide details" : "Show details"}
            </button>
          )}
          {open && hasDetails && (
            <div className="mt-2 space-y-1.5 border-t border-emerald-200/60 pt-2 dark:border-emerald-900/60">
              {summary && (
                <p className="text-[12px] text-emerald-900/80 dark:text-emerald-200/75 leading-snug">
                  {summary}
                </p>
              )}
              {passportValidity && (
                <p className="text-[12px] text-emerald-900/80 dark:text-emerald-200/75 leading-snug">
                  <span className="font-medium">Passport validity:</span> {passportValidity}
                </p>
              )}
              {additionalNotes && additionalNotes.length > 0 && (
                <ul className="space-y-0.5 text-[12px] text-emerald-900/80 dark:text-emerald-200/75 leading-snug list-disc pl-4">
                  {additionalNotes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              )}
              {embassy && (
                <a
                  href={embassy}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-[12px] font-medium text-emerald-800 hover:underline dark:text-emerald-300"
                >
                  Verify on official site
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <p className="pt-1 text-[11px] text-emerald-900/60 dark:text-emerald-200/55 leading-snug">
                {disclaimer}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Counts mandatory AI-suggested requirements that the current user
 * has neither acknowledged nor uploaded a document for.
 * Used by the dashboard banner.
 */
export function useUnhandledMandatoryCount(
  tripId: string,
  uploadedRequirementNames: Set<string>,
): { count: number; hasData: boolean } {
  const { user } = useAuth();
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
    enabled: !!user,
  });
  const { data: passports } = useTripTravellerPassports(tripId);
  const myPassports = (passports ?? []).filter((p) => p.user_id === user?.id);
  const enabled = myPassports.length > 0 && !!trip?.destination_country_iso;
  const { data } = useEntryRequirements({ tripId, enabled });
  const { data: acks } = useEntryReqAcks(tripId);

  const ackedNames = new Set((acks ?? []).map((a) => a.requirement_name.toLowerCase()));
  const docs = data?.documents_needed ?? [];
  const count = docs.filter(
    (d) =>
      d.mandatory &&
      !ackedNames.has(d.name.toLowerCase()) &&
      !uploadedRequirementNames.has(d.name.toLowerCase()),
  ).length;

  return { count, hasData: !!data };
}
