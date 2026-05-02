import { useEffect, useMemo, useState } from "react";
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
      [profile?.nationality_iso, profile?.secondary_nationality_iso]
        .map((n) => n?.toUpperCase())
        .filter((n): n is string => !!n && n.length === 2),
    [profile?.nationality_iso, profile?.secondary_nationality_iso],
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

  // Allow the timeline rail to remote-open the details when the user clicks
  // the "Entry" node. The wrapper div uses id="section-entry".
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (detail?.id === "section-entry" && hasDetails) {
        setOpen(true);
      }
    };
    window.addEventListener("results:expand", handler as EventListener);
    return () => window.removeEventListener("results:expand", handler as EventListener);
  }, [hasDetails]);


  return (
    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50/80 to-emerald-50/30 shadow-sm overflow-hidden dark:from-emerald-950/30 dark:to-emerald-950/10 dark:border-emerald-900">
      {/* Header row — acts as the collapse toggle when there are details */}
      {hasDetails ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="w-full flex items-start gap-3 p-4 text-left hover:bg-emerald-100/40 dark:hover:bg-emerald-900/20 transition-colors"
        >
          <HeaderContent
            possessive={possessive}
            destPhrase={destPhrase}
          />
          <div
            className={cn(
              "shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-600 text-white text-[11px] font-semibold shadow-sm transition-colors",
              "hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-emerald-950"
            )}
          >
            {open ? "Hide" : "Details"}
            <ChevronDown
              className={cn("h-3 w-3 transition-transform duration-200", open && "rotate-180")}
            />
          </div>
        </button>
      ) : (
        <div className="p-4 flex items-start gap-3">
          <HeaderContent possessive={possessive} destPhrase={destPhrase} />
        </div>
      )}

      {/* Expanded details */}
      {open && hasDetails && (
        <div className="px-4 pb-4 pt-0 animate-fade-in">
          <div className="rounded-xl border border-emerald-200/70 bg-background/70 backdrop-blur-sm p-4 space-y-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
            {summary && (
              <p className="text-[12.5px] text-foreground/85 leading-relaxed">
                {summary}
              </p>
            )}
            {passportValidity && (
              <div className="flex items-start gap-2 rounded-lg bg-emerald-100/60 px-3 py-2 dark:bg-emerald-900/30">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300 shrink-0 mt-0.5" />
                <p className="text-[12px] text-emerald-900 dark:text-emerald-100 leading-snug">
                  <span className="font-semibold">Passport validity: </span>
                  <span className="font-normal">{passportValidity}</span>
                </p>
              </div>
            )}
            {additionalNotes && additionalNotes.length > 0 && (
              <ul className="space-y-1.5">
                {additionalNotes.map((note, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-[12px] text-foreground/80 leading-snug"
                  >
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-emerald-600 dark:bg-emerald-400 shrink-0" />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            )}
            {embassy && (
              <a
                href={embassy}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700 hover:text-emerald-800 hover:underline dark:text-emerald-300 dark:hover:text-emerald-200"
              >
                Verify on official site
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <p className="pt-2 border-t border-emerald-200/60 text-[10.5px] text-muted-foreground leading-snug dark:border-emerald-900/60">
              {disclaimer}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function HeaderContent({ possessive, destPhrase }: { possessive: string; destPhrase: string }) {
  return (
    <>
      <div className="h-9 w-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm dark:bg-emerald-500 dark:text-emerald-950">
        <CheckCircle2 className="h-[18px] w-[18px]" strokeWidth={2.25} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-emerald-900 dark:text-emerald-100 leading-tight">
          All clear — no visa needed
        </p>
        <p className="mt-1 text-[12px] text-emerald-900/80 dark:text-emerald-200/80 leading-snug">
          {possessive} doesn&apos;t require a visa{destPhrase}.
        </p>
      </div>
    </>
  );
}
