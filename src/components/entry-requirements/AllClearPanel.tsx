import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { COUNTRIES } from "@/lib/countries";
import { cn } from "@/lib/utils";

/**
 * Shared "All clear" entry-requirements panel.
 *
 * Used in two places:
 *   1. Trip builder preview (EntryRequirementsPreview)
 *   2. Bookings & Docs (EntryRequirementsBlock)
 *
 * Keeping this in a single place ensures the visual treatment stays in sync
 * — when we tweak this design, both surfaces update together.
 *
 * The panel listens for a `results:expand` window event with detail
 * `{ id: "section-entry" }` so the trip-builder timeline rail can remote-open
 * the details section.
 */

function countryName(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const match = COUNTRIES.find((c) => c.code === iso.toUpperCase());
  return match?.name ?? iso.toUpperCase();
}

export interface AllClearPanelProps {
  destName: string | null;
  nationality: string | null;
  summary?: string;
  embassy?: string;
  passportValidity?: string;
  additionalNotes?: string[];
  disclaimer: string;
  className?: string;
}

export function AllClearPanel({
  destName,
  nationality,
  summary,
  embassy,
  passportValidity,
  additionalNotes,
  disclaimer,
  className,
}: AllClearPanelProps) {
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

  // Allow the trip-builder timeline rail to remote-open the details when
  // the user clicks the "Entry" node.
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
    <div
      className={cn(
        "rounded-2xl border border-emerald-200/80 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(16,185,129,0.18)] overflow-hidden dark:border-emerald-900/70",
        className,
      )}
    >
      {hasDetails ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="group w-full flex items-center gap-3.5 p-4 text-left hover:bg-muted/40 transition-colors"
        >
          <HeaderContent possessive={possessive} destPhrase={destPhrase} />
          <div className="h-7 w-7 rounded-full bg-muted/60 flex items-center justify-center shrink-0 group-hover:bg-muted transition-colors">
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground transition-transform duration-300",
                !open && "-rotate-90",
              )}
            />
          </div>
        </button>
      ) : (
        <div className="p-4 flex items-center gap-3.5">
          <HeaderContent possessive={possessive} destPhrase={destPhrase} />
        </div>
      )}

      {open && hasDetails && (
        <div className="border-t border-border/60 px-5 py-4 space-y-4 animate-fade-in">
          {summary && (
            <p className="text-[13px] text-foreground/85 leading-relaxed">
              {summary}
            </p>
          )}

          {passportValidity && (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/50 px-3.5 py-3 dark:border-emerald-900/70 dark:bg-emerald-950/20">
              <div className="h-8 w-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 dark:bg-emerald-500 dark:text-emerald-950">
                <ShieldCheck className="h-4 w-4" strokeWidth={2.25} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300">
                  Passport validity
                </p>
                <p className="text-[12.5px] text-foreground leading-snug mt-0.5">
                  {passportValidity}
                </p>
              </div>
            </div>
          )}

          {additionalNotes && additionalNotes.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
                Good to know
              </p>
              <ul className="space-y-2">
                {additionalNotes.map((note, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 text-[12.5px] text-foreground/85 leading-snug"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {embassy && (
            <a
              href={embassy}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-emerald-700 hover:text-emerald-800 hover:underline dark:text-emerald-300 dark:hover:text-emerald-200"
            >
              Verify on official site
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}

          <p className="pt-3 border-t border-border/60 text-[10.5px] text-muted-foreground leading-snug">
            {disclaimer}
          </p>
        </div>
      )}
    </div>
  );
}

function HeaderContent({ possessive, destPhrase }: { possessive: string; destPhrase: string }) {
  return (
    <>
      <div className="relative h-11 w-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white flex items-center justify-center shrink-0 shadow-[0_2px_8px_-2px_rgba(16,185,129,0.45)] ring-1 ring-inset ring-white/20">
        <CheckCircle2 className="h-[20px] w-[20px]" strokeWidth={2.25} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[15px] font-semibold text-foreground leading-tight tracking-tight">
            All clear
          </p>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[10px] font-semibold uppercase tracking-wide dark:bg-emerald-900/40 dark:text-emerald-300">
            No visa
          </span>
        </div>
        <p className="mt-1 text-[12px] text-muted-foreground leading-snug">
          {possessive} doesn&apos;t require a visa{destPhrase}.
        </p>
      </div>
    </>
  );
}
