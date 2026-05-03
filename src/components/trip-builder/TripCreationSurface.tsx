import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Loader2, Map, Sparkles, Users } from "lucide-react";

/**
 * TripCreationSurface — single hero-first creation entry shared by:
 *   • /trips/new (standalone, no template context)
 *   • /templates/:slug/personalize (template context B)
 *
 * It owns ONLY presentation + the free-text pill. The page that hosts it
 * provides callbacks that decide what the three CTAs actually do
 * (free-text submit, step-by-step open, blank trip open).
 *
 * The detailed step-by-step form (StandaloneTripBuilder + PremiumTripInput)
 * is NOT inlined here — it stays in its modal exactly as before. We only
 * surface a text-link CTA that opens it.
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
  /** Opens the step-by-step form (StandaloneTripBuilder). */
  onStepByStep: () => void;
  /** Opens BlankTripModal. */
  onSkipItinerary: () => void;
  /** Optional template card rendered above the hero. */
  templateCard?: ReactNode;
  /** Optional content rendered below the hero card (info cards, carousels). */
  belowHero?: ReactNode;
  /** Disables the submit button. */
  busy?: boolean;
};

export function TripCreationSurface({
  headline,
  subtitle,
  placeholder,
  ctaLabel,
  onFreeTextSubmit,
  onStepByStep,
  onSkipItinerary,
  templateCard,
  belowHero,
  busy = false,
}: TripCreationSurfaceProps) {
  const [value, setValue] = useState("");
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

  return (
    <section className="relative w-full bg-gray-50">
      <div className="relative z-10 mx-auto w-full max-w-2xl px-5 sm:px-8 py-8 sm:py-12">
        {templateCard}

        {/* Hero card */}
        <div className="relative overflow-hidden rounded-2xl border border-[#0D9488]/15 bg-gradient-to-br from-[#0D9488]/[0.06] via-background to-background p-6 sm:p-8">
          <div className="pointer-events-none absolute -top-16 -right-16 h-44 w-44 rounded-full bg-[#0D9488]/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-[#0D9488]/10 blur-3xl" />

          <div className="relative flex flex-col items-center text-center">
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

            {/* Free-text pill */}
            <form
              onSubmit={handleSubmit}
              className={`mt-6 w-full max-w-xl ${shake ? "tcs-shake" : ""}`}
            >
              <div className="flex items-center gap-1.5 rounded-full bg-white border border-gray-100 shadow-sm pl-1.5 pr-1.5 py-1.5 transition-all focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/40">
                <textarea
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleSubmit(e as unknown as FormEvent);
                    }
                  }}
                  rows={2}
                  disabled={busy}
                  placeholder={placeholder}
                  aria-label="Describe your trip"
                  className="block w-full min-w-0 flex-1 resize-none bg-transparent self-center px-3 py-2 sm:px-4 sm:py-2.5 text-[13px] sm:text-[14.5px] text-gray-900 placeholder:text-gray-500 outline-none border-0 leading-[1.3] overflow-hidden h-[48px] sm:h-auto sm:min-h-[52px] sm:max-h-[100px] disabled:opacity-60 text-left"
                />
                <button
                  type="submit"
                  disabled={busy}
                  aria-label={ctaLabel}
                  className="inline-flex items-center justify-center gap-2 shrink-0 rounded-full bg-primary text-white font-medium h-[48px] w-[48px] p-0 sm:h-[52px] sm:w-auto sm:px-5 text-sm whitespace-nowrap shadow-[0_4px_14px_-2px_hsl(var(--primary)/0.5)] transition-all hover:brightness-110 active:brightness-95 disabled:opacity-60"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span className="hidden sm:inline">{ctaLabel}</span>
                      <ArrowRight className="hidden h-4 w-4 sm:block" />
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Two text-link CTAs (always visible) */}
            <div className="mt-5 flex flex-col items-center gap-2.5">
              <button
                type="button"
                onClick={onStepByStep}
                className="text-[13.5px] font-medium text-gray-700 hover:text-foreground transition-colors inline-flex items-center gap-1"
              >
                Or build it step-by-step <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onSkipItinerary}
                className="text-[13.5px] font-medium text-gray-700 hover:text-foreground transition-colors inline-flex items-center gap-1"
              >
                Or start without an itinerary <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {belowHero}
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
