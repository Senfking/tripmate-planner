import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ensureFreshSession, forceRefreshSession } from "@/lib/sessionRefresh";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ExternalLink,
  FileText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { COUNTRIES } from "@/lib/countries";
import { Skeleton } from "@/components/ui/skeleton";
import { AllClearPanel } from "@/components/entry-requirements/AllClearPanel";
import type { EntryRequirementsResult, EntryRequirementDoc } from "@/hooks/useEntryRequirements";
import { cn } from "@/lib/utils";

interface Props {
  destinationCountryIso: string | null | undefined;
  tripLengthDays: number;
  className?: string;
  /** When provided, the anon "sign up" CTA calls this instead of using a route link. */
  authGate?: () => void;
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
  authGate,
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
      await ensureFreshSession();
      const body = {
        nationalities,
        destination_country: destIso,
        trip_length_days: lengthDays,
        purpose: "tourism",
      };
      let { data, error } = await supabase.functions.invoke("get-entry-requirements", { body });
      const isAuthErr =
        error && (((error as any).context?.status === 401) || /unauthor/i.test(error.message ?? ""));
      if (isAuthErr) {
        await forceRefreshSession();
        ({ data, error } = await supabase.functions.invoke("get-entry-requirements", { body }));
      }
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

  // Section wrapper (matches sibling sections in TripResultsView style).
  // IMPORTANT: must be defined outside the component body OR inlined — defining
  // it inside the render creates a new component type on every render, which
  // unmounts/remounts children (resetting AllClearPanel's open state whenever
  // an unrelated sibling like PackingCard toggles).
  const wrap = (children: React.ReactNode) => (
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

  // Anonymous user — enticing signup CTA with passport visual.
  if (!user) {
    const handleClick = (e: React.MouseEvent) => {
      if (authGate) {
        e.preventDefault();
        authGate();
      }
    };
    return (
      wrap(<>
        <button
          type="button"
          onClick={authGate ? (e) => { e.preventDefault(); authGate(); } : undefined}
          {...(!authGate ? {} : {})}
          className="group relative w-full overflow-hidden rounded-2xl border border-[#0D9488]/25 bg-gradient-to-br from-[#0D9488] via-[#0F766E] to-[#134E4A] p-4 text-left shadow-[0_8px_24px_-12px_rgba(13,148,136,0.45)] transition-transform hover:scale-[1.01] active:scale-[0.99]"
        >
          {/* decorative passport stamp circles */}
          <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full border-2 border-white/10" />
          <div className="pointer-events-none absolute -right-2 -top-2 h-16 w-16 rounded-full border border-white/15" />
          <div className="pointer-events-none absolute right-3 top-3 rotate-12 rounded-md border border-white/30 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-white/70">
            {destIso ?? "Visa"}
          </div>

          <div className="relative flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-inset ring-white/25 backdrop-blur-sm">
              <ShieldCheck className="h-5 w-5 text-white" strokeWidth={2.25} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold leading-tight text-white">
                Will you need a visa for {destName ?? "this trip"}?
              </p>
              <p className="mt-1 text-[12px] leading-snug text-white/80">
                Get personalized entry requirements based on your passport — visa rules, passport validity, and required documents.
              </p>
              <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0F766E] shadow-sm transition-all group-hover:gap-2 group-hover:bg-white/95">
                <Sparkles className="h-3.5 w-3.5" />
                Sign up free to unlock
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </span>
            </div>
          </div>
        </button>
        {!authGate && (
          <Link
            to="/ref"
            className="absolute inset-0"
            aria-label="Sign up to see entry requirements"
          />
        )}
      </>)
    );
  }

  // Empty state: no nationality on profile
  if (!hasNationality) {
    return (
      wrap(<>
        <div className="rounded-xl border border-border bg-card px-3 py-2.5 text-[12.5px] text-muted-foreground leading-snug">
          Add your nationality to see entry requirements for this trip.{" "}
          <Link
            to="/app/more?edit=nationality"
            className="font-medium text-[#0D9488] hover:underline whitespace-nowrap"
          >
            Set nationality →
          </Link>
        </div>
      </>)
    );
  }

  if (isLoading) {
    return (
      wrap(<>
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
      </>)
    );
  }

  if (isError || !data) {
    return (
      wrap(<>
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
      </>)
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
      wrap(<>
        <AllClearPanel
          destName={destName}
          nationality={nationalities[0]}
          summary={summary}
          embassy={embassy}
          passportValidity={data.passport_validity}
          additionalNotes={data.additional_notes}
          disclaimer={disclaimer}
        />
      </>)
    );
  }

  return (
    wrap(<>
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
    </>)
  );
}

