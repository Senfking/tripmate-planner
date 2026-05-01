import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ChevronDown,
  CheckCircle2,
  ExternalLink,
  FileText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { COUNTRIES } from "@/lib/countries";
import { Skeleton } from "@/components/ui/skeleton";
import type { EntryRequirementsResult, EntryRequirementDoc } from "@/hooks/useEntryRequirements";
import { cn } from "@/lib/utils";

interface Props {
  destinationCountryIso: string | null | undefined;
  tripLengthDays: number;
  className?: string;
}

function countryName(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const match = COUNTRIES.find((c) => c.code === iso.toUpperCase());
  return match?.name ?? iso.toUpperCase();
}

function actionableDocCount(docs: EntryRequirementDoc[]): number {
  return docs.filter(
    (d) => d.mandatory && !/^passport(\s|$|:)/i.test(d.name.trim()),
  ).length;
}

/**
 * Read-only entry-requirements preview shown in the trip-builder result view
 * BEFORE the trip is saved. Calls the same get-entry-requirements edge
 * function but uses the "direct" path (no trip_id) — passing nationalities
 * + destination ISO + trip length explicitly. Once the trip is created, the
 * fully interactive EntryRequirementsBlock takes over in Bookings & Docs.
 */
export function EntryRequirementsPreview({
  destinationCountryIso,
  tripLengthDays,
  className,
}: Props) {
  const { user, profile } = useAuth();
  const nationalities = useMemo(
    () =>
      (profile?.nationalities ?? [])
        .map((n) => n?.toUpperCase())
        .filter((n): n is string => !!n && n.length >= 2)
        .slice(0, 4),
    [profile?.nationalities],
  );

  const destIso = destinationCountryIso?.toUpperCase() ?? null;
  const hasDestIso = !!destIso && destIso.length === 2;
  const hasNationality = nationalities.length > 0;
  const canFetch = !!user && hasDestIso && hasNationality;

  const lengthDays = Math.max(1, Math.min(365, Math.round(tripLengthDays || 7)));

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [
      "entry-requirements-preview",
      destIso,
      nationalities.join(","),
      lengthDays,
    ],
    queryFn: async (): Promise<EntryRequirementsResult> => {
      const { data, error } = await supabase.functions.invoke("get-entry-requirements", {
        body: {
          nationalities,
          destination_country: destIso,
          trip_length_days: lengthDays,
          purpose: "tourism",
        },
      });
      if (error) throw error;
      return (data ?? {}) as EntryRequirementsResult;
    },
    enabled: canFetch,
    staleTime: 1000 * 60 * 60,
    retry: 1,
  });

  // Silent: no destination ISO at all (per spec)
  if (!hasDestIso) return null;

  const destName = countryName(destIso);

  // Section wrapper (matches sibling sections in TripResultsView style)
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <div
      id="section-entry-requirements"
      className={cn("mx-4 mt-2 mb-4", className)}
    >
      <div className="flex items-center gap-2 px-1 mb-2">
        <ShieldCheck className="h-4 w-4 text-[#0D9488]" />
        <h3 className="text-sm font-semibold text-foreground">
          Visa &amp; entry{destName ? ` — ${destName}` : ""}
        </h3>
        <span className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-muted text-muted-foreground px-1.5 py-0.5 text-[10px] font-medium">
          <Sparkles className="h-2.5 w-2.5" />
          AI preview
        </span>
      </div>
      {children}
    </div>
  );

  // Empty state: no nationality on profile
  if (!hasNationality) {
    return (
      <Wrapper>
        <div className="rounded-xl border border-border bg-card px-3 py-2.5 text-[12.5px] text-muted-foreground leading-snug">
          Add your nationality to see entry requirements for this trip.{" "}
          <Link
            to="/app/more"
            className="font-medium text-[#0D9488] hover:underline whitespace-nowrap"
          >
            Open profile →
          </Link>
        </div>
      </Wrapper>
    );
  }

  if (isLoading) {
    return (
      <Wrapper>
        <div className="space-y-2">
          <div className="rounded-xl border border-border bg-card px-3 py-2.5">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="mt-1.5 h-2.5 w-1/2" />
          </div>
          <div className="rounded-xl border border-border border-l-4 border-l-[#0D9488] bg-card p-3">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="mt-2 h-2.5 w-full" />
          </div>
        </div>
      </Wrapper>
    );
  }

  if (isError || !data) {
    return (
      <Wrapper>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-900 leading-snug dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              Couldn&apos;t load entry requirements right now.{" "}
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
      </Wrapper>
    );
  }

  const docs = data.documents_needed ?? [];
  const summary = data.summary;
  const embassy = data.embassy_url;
  const confidence = data.confidence ?? "unknown";
  const disclaimer =
    data.disclaimer ??
    "AI-generated guidance, not legal advice. Visa rules change frequently. Always verify with the embassy or official source before booking.";

  const isAllClear =
    data.visa_required === "no" &&
    !data.entry_form_required &&
    actionableDocCount(docs) === 0;

  if (isAllClear) {
    return (
      <Wrapper>
        <AllClearPanel
          destName={destName}
          nationality={nationalities[0]}
          summary={summary}
          embassy={embassy}
          passportValidity={data.passport_validity}
          additionalNotes={data.additional_notes}
          disclaimer={disclaimer}
        />
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <div className="space-y-2">
        {(summary || destName) && (
          <div className="rounded-xl border border-border bg-card px-3 py-2.5 text-[12.5px] leading-snug">
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

        {confidence === "low" && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-900 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-200">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>Limited confidence in this result. Please verify directly with the embassy.</span>
          </div>
        )}

        {docs.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-300 px-3 py-2.5 text-[12px] text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span className="leading-snug">{disclaimer}</span>
          </div>
        )}

        {docs.map((doc) => (
          <div
            key={doc.name}
            className="rounded-xl border border-border border-l-4 border-l-[#0D9488] bg-card p-3 shadow-sm"
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
                </div>
                {doc.description && (
                  <p className="mt-1 text-[12px] text-muted-foreground leading-snug">
                    {doc.description}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}

        <p className="px-1 text-[11px] text-muted-foreground/80 leading-snug">
          You&apos;ll be able to confirm and upload documents after you create the trip.
        </p>
      </div>
    </Wrapper>
  );
}

interface AllClearProps {
  destName: string | null;
  nationality: string | null;
  summary?: string;
  embassy?: string;
  passportValidity?: string;
  additionalNotes?: string[];
  disclaimer: string;
}

function AllClearPanel({
  destName,
  nationality,
  summary,
  embassy,
  passportValidity,
  additionalNotes,
  disclaimer,
}: AllClearProps) {
  const [open, setOpen] = useState(false);
  const nationalityName = countryName(nationality);
  const possessive = nationalityName ? `Your ${nationalityName} passport` : "Your passport";
  const destPhrase = destName ? ` for ${destName}` : "";
  const hasDetails = !!(
    passportValidity ||
    summary ||
    embassy ||
    (additionalNotes && additionalNotes.length > 0)
  );

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-sm dark:bg-emerald-950/20 dark:border-emerald-900">
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
