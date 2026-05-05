import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, FileText, ListChecks, Loader2, Map, Sparkles, Users } from "lucide-react";

/**
 * TripCreationSurface — single hero-first creation entry shared by:
 *   • /trips/new (standalone, no template context)
 *   • /templates/:slug/personalize (template context B)
 *
 * It owns ONLY presentation + the free-text pill. The page that hosts it
 * provides callbacks that decide what the three CTAs actually do
 * (free-text submit, step-by-step expand, blank trip open).
 *
 * The detailed step-by-step form is INLINED beneath the hero card by the
 * host page (passed via `expandedSlot` when stepByStepExpanded=true).
 * No modals, no route changes for step-by-step.
 */

export type TripCreationSurfaceProps = {
  /** Headline shown above the pill. */
  headline: ReactNode;
  /** Subtitle under the headline. */
  subtitle: string;
  /** Placeholder for the free-text pill. */
  placeholder: string;
  /** Submit-button label (desktop). Mobile is icon-only. */
  ctaLabel: string;
  /** Called when the user submits the free-text pill with non-empty value. */
  onFreeTextSubmit: (prompt: string) => void;
  /** Toggles inline step-by-step expansion. Host owns the boolean. */
  onStepByStep: () => void;
  /** Opens BlankTripModal (or other blank-trip flow). */
  onSkipItinerary: () => void;
  /** Whether the inline step-by-step form is currently expanded. Drives
   *  the secondary CTA's pressed state and reveals `expandedSlot`. */
  stepByStepExpanded?: boolean;
  /** Inline form rendered below the hero card when expanded. */
  expandedSlot?: ReactNode;
  /** Optional template card rendered to the LEFT of the hero card on
   *  desktop, ABOVE the hero card on mobile (two-column hero). */
  templateCard?: ReactNode;
  /** Optional content rendered below the hero card (info cards, carousels). */
  belowHero?: ReactNode;
  /** Disables the submit button. */
  busy?: boolean;
  /** Initial value for the free-text pill (used to restore prompt after a
   *  failed generation so the user doesn't have to retype). */
  prefill?: string;
};

export function TripCreationSurface({
  headline,
  subtitle,
  placeholder,
  ctaLabel,
  onFreeTextSubmit,
  onStepByStep,
  onSkipItinerary,
  stepByStepExpanded,
  expandedSlot,
  templateCard,
  belowHero,
  busy = false,
  prefill,
}: TripCreationSurfaceProps) {
  const [value, setValue] = useState(prefill ?? "");
  const [shake, setShake] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const trimmed = value.trim();
    if (!trimmed) {
      setShake(true);
      window.setTimeout(() => setShake(false), 400);
      return;
    }
    onFreeTextSubmit(trimmed);
  }

  // Hero card content (extracted so we can render with or without the
  // adjacent template column).
  const heroCard = (
    <div className="relative h-full overflow-hidden rounded-2xl border border-[#0D9488]/15 bg-gradient-to-br from-[#0D9488]/[0.06] via-background to-background p-6 sm:p-8">
      <div className="pointer-events-none absolute -top-16 -right-16 h-44 w-44 rounded-full bg-[#0D9488]/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-[#0D9488]/10 blur-3xl" />

      <div className="relative flex h-full flex-col items-center text-center">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-[#0D9488]/25 bg-background/70 backdrop-blur px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#0D9488]">
          <Sparkles className="h-3 w-3" />
          Powered by Junto AI
        </div>

        <h2 className="mt-4 text-[22px] sm:text-[28px] font-semibold tracking-tight text-foreground leading-tight">
          {headline}
        </h2>
        <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">
          {subtitle}
        </p>

        {/* Free-text textarea — button BELOW for breathing room */}
        <form
          onSubmit={handleSubmit}
          className={`mt-6 w-full ${shake ? "tcs-shake" : ""}`}
        >
          <div className="rounded-2xl bg-white border border-gray-200 shadow-sm transition-all focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/40">
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit(e as unknown as FormEvent);
                }
              }}
              rows={3}
              disabled={busy}
              placeholder={placeholder}
              aria-label="Describe your trip"
              className="block w-full resize-none bg-transparent rounded-2xl px-4 py-3 text-[14px] sm:text-[14.5px] text-gray-900 placeholder:text-gray-500 outline-none border-0 leading-[1.45] min-h-[88px] disabled:opacity-60 text-left"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            aria-label={ctaLabel}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary text-white font-semibold h-[52px] px-6 text-[14.5px] whitespace-nowrap shadow-[0_4px_14px_-2px_hsl(var(--primary)/0.5)] transition-all hover:brightness-110 active:brightness-95 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Sparkles className="h-[17px] w-[17px]" />
                <span>{ctaLabel}</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {/* Two side-by-side outline pill CTAs */}
        <div className="mt-3 flex w-full flex-col gap-2.5 sm:flex-row sm:gap-3">
          <button
            type="button"
            onClick={onStepByStep}
            aria-pressed={stepByStepExpanded ? true : undefined}
            className={`group inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full border bg-white px-4 py-3 text-[13px] font-medium transition-all active:opacity-80 ${
              stepByStepExpanded
                ? "border-primary text-primary shadow-sm"
                : "border-gray-200 text-gray-700 hover:border-primary/40 hover:text-foreground"
            }`}
          >
            <ListChecks className="h-4 w-4" />
            Step-by-step
          </button>
          <button
            type="button"
            onClick={onSkipItinerary}
            className="group inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-gray-200 bg-white px-4 py-3 text-[13px] font-medium text-gray-700 transition-all hover:border-primary/40 hover:text-foreground active:opacity-80"
          >
            <FileText className="h-4 w-4" />
            Skip itinerary
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <section className="relative w-full bg-gray-50" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="relative z-10 mx-auto w-full max-w-6xl px-5 sm:px-8 py-8 sm:py-12">
        {templateCard ? (
          <div className="grid gap-6 md:grid-cols-5 md:items-stretch">
            <div className="md:order-1 md:col-span-2">{templateCard}</div>
            <div className="md:order-2 md:col-span-3">{heroCard}</div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-2xl">{heroCard}</div>
        )}

        {/* Inline step-by-step form lives directly below the hero block */}
        {stepByStepExpanded && expandedSlot && (
          <div
            id="tcs-step-by-step"
            className="mx-auto mt-6 w-full max-w-2xl rounded-2xl border border-gray-100 bg-white shadow-sm"
          >
            {expandedSlot}
          </div>
        )}

        {belowHero && (
          <div className="mx-auto mt-2 w-full max-w-2xl">{belowHero}</div>
        )}
      </div>

      <style>{`
        @keyframes tcs-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .tcs-shake { animation: tcs-shake 0.35s ease-in-out; }
      `}</style>
    </section>
  );
}

/**
 * Reusable info-cards row used on the standalone /trips/new context.
 */
export function StandaloneInfoCards() {
  const features = [
    {
      icon: Sparkles,
      title: "AI-built itineraries",
      desc: "Junto AI plans your full trip — destinations, days, places, food.",
    },
    {
      icon: Users,
      title: "Group-friendly",
      desc: "Plan together. Vote on options. Split expenses fairly.",
    },
    {
      icon: Map,
      title: "Real places, real prices",
      desc: "Itineraries use Google Places data — no hallucinated venues.",
    },
  ];
  return (
    <ul className="mt-6 space-y-2.5 px-2">
      {features.map(({ icon: Icon, title, desc }) => (
        <li
          key={title}
          className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/50 p-3"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0D9488]/10">
            <Icon className="h-4 w-4 text-[#0D9488]" />
          </div>
          <div className="min-w-0 text-left">
            <p className="text-[13px] font-semibold text-foreground leading-tight">{title}</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground leading-snug">{desc}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
