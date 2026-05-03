import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, Map, Sparkles, Users } from "lucide-react";
import { JuntoWordmark } from "./JuntoWordmark";
import { SAMPLE_TRIPS } from "./sampleTrips";

type Variant = "public" | "app";

type Props = {
  /** Called when the user submits a non-empty prompt. */
  onSubmit: (prompt: string) => void | Promise<void>;
  /** Disables the input + button (e.g. during navigation/AI work). */
  busy?: boolean;
  /** Optional initial value (used to resume a prompt after signup). */
  prefill?: string;
  /**
   * Optional slot rendered just below the input. Used on /trips/new to
   * surface the "Prefer to fill in details step by step?" link that
   * opens the StandaloneTripBuilder modal.
   */
  secondaryAction?: ReactNode;
  /**
   * Visual variant.
   * - "public" (default): atmospheric photo background, marketing-y,
   *   used on / for logged-out visitors.
   * - "app": clean light surface, no photo, smaller, used at /trips/new
   *   for logged-in users who are already inside the app shell context.
   */
  variant?: Variant;
};

// Atmospheric full-bleed background photo (public variant only).
const HERO_BG =
  "https://images.unsplash.com/photo-1503917988258-f87a78e3c995?w=2400&q=80&auto=format&fit=crop";

function useAutoSize(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Pill is a fixed-height integrated container on every viewport.
    // Don't auto-grow — let content scroll past the 2-line cap instead,
    // otherwise the pill shape distorts.
    el.style.height = "";
  }, [value]);
  return ref;
}

export function Hero({
  onSubmit,
  busy = false,
  prefill,
  secondaryAction,
  variant = "public",
}: Props) {
  const [value, setValue] = useState(prefill ?? "");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const textareaRef = useAutoSize(value);
  const navigate = useNavigate();

  const isApp = variant === "app";

  useEffect(() => {
    if (prefill && value.length === 0) setValue(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  function triggerShake() {
    setShake(true);
    window.setTimeout(() => setShake(false), 450);
  }

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      setError("Tell us a little about your trip first.");
      triggerShake();
      return;
    }
    setError(null);
    await onSubmit(trimmed);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSubmit();
    }
  }

  // ── Shared: pill input form ──────────────────────────────────────────
  // Single integrated pill on ALL viewports — textarea on the left,
  // nested button on the right. The textarea allows 2 rows so the
  // pill is just slightly taller on mobile than on desktop.
  const pillWrapper = isApp
    ? [
        "flex items-center gap-1",
        "rounded-full bg-white border border-gray-100",
        "shadow-sm pl-1 pr-1 py-1 transition-all",
        "focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/40",
      ].join(" ")
    : [
        "flex items-center gap-1",
        "rounded-full bg-white/95 backdrop-blur-xl border border-white/50",
        "shadow-2xl pl-1 pr-1 py-1 transition-all",
        "focus-within:ring-2 focus-within:ring-white/70",
      ].join(" ");

  const placeholder = isApp
    ? "Describe your trip — destination, dates, who's coming"
    : "Tell Junto AI about your trip — destination, dates, who's coming";

  const sharedTextareaProps = {
    ref: textareaRef,
    value,
    onChange: (e: ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value);
      if (error) setError(null);
    },
    onKeyDown: handleKeyDown,
    disabled: busy,
    placeholder,
    "aria-label": "Describe your trip",
    "aria-invalid": !!error,
  };

  // Mobile is always icon-only so the textarea keeps enough width inside
  // the integrated pill. Desktop keeps the full CTA label and arrow.
  const buttonContent = busy ? (
    <>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      <span className="hidden sm:inline">Planning…</span>
    </>
  ) : (
    <>
      <Sparkles className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">Plan with Junto AI</span>
      <ArrowRight className="hidden h-4 w-4 sm:block" aria-hidden />
    </>
  );

  const formEl = (
    <form
      onSubmit={handleSubmit}
      className={isApp ? "mt-6 w-full max-w-2xl" : "mt-8 sm:mt-10 w-full max-w-2xl"}
    >
      {/* ── Single integrated pill (all viewports) ── */}
      <div
        className={[
          pillWrapper,
          error ? "ring-2 ring-destructive/50" : "",
          shake ? "hero-shake" : "",
        ].join(" ")}
      >
        <textarea
          {...sharedTextareaProps}
          rows={2}
          className={[
            "block w-full min-w-0 flex-1 resize-none bg-transparent",
            "px-3 py-2.5 sm:px-4",
            "text-[13px] sm:text-[14.5px] text-gray-900 placeholder:text-gray-500",
            "outline-none border-0",
            "leading-tight overflow-hidden",
            "min-h-[52px] max-h-[100px]",
            "disabled:opacity-60 text-left",
          ].join(" ")}
        />

        <button
          type="submit"
          disabled={busy}
          aria-label="Plan with Junto AI"
          className={[
            "inline-flex items-center justify-center gap-2 shrink-0",
            "rounded-full bg-primary text-white font-medium",
            "h-11 w-11 p-0 sm:h-auto sm:w-auto sm:px-5 sm:py-3 text-sm whitespace-nowrap",
            "shadow-[0_4px_14px_-2px_hsl(var(--primary)/0.5)]",
            "transition-all hover:brightness-110 hover:shadow-[0_6px_20px_-2px_hsl(var(--primary)/0.6)]",
            "active:brightness-95 disabled:opacity-60 disabled:cursor-not-allowed",
          ].join(" ")}
        >
          {buttonContent}
        </button>
      </div>

      {error && (
        <p
          className={
            isApp
              ? "mt-3 inline-block rounded-md bg-destructive/10 px-3 py-1 text-sm text-destructive"
              : "mt-3 inline-block rounded-full bg-black/40 backdrop-blur px-3 py-1 text-sm text-white"
          }
          role="alert"
        >
          {error}
        </p>
      )}
    </form>
  );

  // ── Sample trips row ────────────────────────────────────────────────
  const sampleRow = (
    <div className={isApp ? "mt-8 w-full max-w-2xl" : "mt-10 sm:mt-12 w-full max-w-2xl"}>
      <p
        className={
          isApp
            ? "text-sm text-gray-500 mb-3 text-left sm:text-center"
            : "text-sm text-white/80 mb-3 text-left sm:text-center drop-shadow-sm"
        }
      >
        Or browse a sample trip
      </p>
      <div
        className={[
          "flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-5 px-5 pb-2",
          "sm:mx-0 sm:px-0 sm:overflow-visible sm:justify-center sm:flex-wrap",
        ].join(" ")}
      >
        {SAMPLE_TRIPS.map((trip) => (
          <button
            key={trip.id}
            type="button"
            onClick={() => navigate(`/trips/sample/${trip.id}`)}
            className={
              isApp
                ? [
                    "snap-start shrink-0",
                    "flex items-center gap-3 text-left",
                    "rounded-xl bg-white hover:bg-gray-50",
                    "border border-gray-100 px-3 py-2.5 shadow-sm",
                    "transition-colors",
                    "min-w-[240px] sm:min-w-0",
                  ].join(" ")
                : [
                    "snap-start shrink-0",
                    "flex items-center gap-3 text-left",
                    "rounded-xl bg-white/10 hover:bg-white/15 backdrop-blur-md",
                    "border border-white/20 px-3 py-2.5",
                    "transition-colors",
                    "min-w-[240px] sm:min-w-0",
                  ].join(" ")
            }
          >
            <img
              src={trip.image}
              alt=""
              loading="lazy"
              className="h-10 w-10 rounded-full object-cover shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div
                className={
                  isApp
                    ? "text-sm font-medium text-gray-900 truncate"
                    : "text-sm font-medium text-white truncate"
                }
              >
                {trip.title}
              </div>
              <div className="mt-0.5">
                <span
                  className={
                    isApp
                      ? "inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
                      : "inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/15 text-white/90"
                  }
                >
                  {trip.tags[0]}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  // ─── APP variant: in-app empty-state, mirrors Expenses empty hero ──
  if (isApp) {
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
      <section className="relative w-full bg-gray-50 border-b border-gray-100">
        <div className="relative z-10 mx-auto w-full max-w-2xl px-5 sm:px-8 py-10 sm:py-14">
          {/* Hero card — same shell pattern as ExpensesTab empty state */}
          <div className="relative overflow-hidden rounded-2xl border border-[#0D9488]/15 bg-gradient-to-br from-[#0D9488]/[0.06] via-background to-background p-6">
            <div className="pointer-events-none absolute -top-16 -right-16 h-44 w-44 rounded-full bg-[#0D9488]/15 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-[#0D9488]/10 blur-3xl" />

            <div className="relative flex flex-col items-center text-center">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#0D9488]/25 bg-background/70 backdrop-blur px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#0D9488]">
                <Sparkles className="h-3 w-3" />
                Powered by Junto AI
              </div>

              <h2 className="mt-4 text-[22px] sm:text-[26px] font-semibold tracking-tight text-foreground leading-tight">
                Plan your next trip,<br />
                <span className="text-[#0D9488]">Junto AI does the heavy lifting</span>
              </h2>
              <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">
                Describe what you have in mind — destination, dates, who's coming. Junto AI builds an itinerary in seconds.
              </p>

              {/* Pill input — primary action */}
              <div className="w-full">{formEl}</div>
            </div>
          </div>

          {/* Feature explainer rows — exact pattern from ExpensesTab */}
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

          {/* OR divider + stacked secondary actions. Auth-page pattern:
              centered "OR" chip with horizontal rules on either side. */}
          {secondaryAction && (
            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-3" aria-hidden>
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
                  OR
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="w-full">{secondaryAction}</div>
            </div>
          )}
        </div>

        <style>{`
          @keyframes hero-shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-4px); }
            75% { transform: translateX(4px); }
          }
          .hero-shake { animation: hero-shake 0.35s ease-in-out; }
        `}</style>
      </section>
    );
  }

  // ─── PUBLIC variant: full-bleed atmospheric photo ──────────────────
  return (
    <section
      className="relative w-full overflow-hidden isolate"
      style={{ minHeight: "min(85vh, 900px)" }}
    >
      <img
        src={HERO_BG}
        alt=""
        aria-hidden
        // @ts-expect-error -- fetchpriority is valid HTML, not yet typed
        fetchpriority="high"
        className="absolute inset-0 -z-20 h-full w-full object-cover"
      />
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0.30) 45%, rgba(0,0,0,0.55) 100%)",
        }}
        aria-hidden
      />

      <div className="relative z-10 flex items-center justify-between px-5 sm:px-10 pt-5 sm:pt-7">
        <JuntoWordmark variant="light" />
        <Link
          to="/ref"
          className="inline-flex items-center rounded-full px-4 py-2 text-sm font-medium text-white bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 transition-colors"
        >
          Log in
        </Link>
      </div>

      <div
        className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center justify-center px-5 sm:px-8 text-center"
        style={{ minHeight: "min(75vh, 760px)" }}
      >
        <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 px-3 py-1.5 text-xs font-medium text-white shadow-sm">
          <Sparkles className="h-3 w-3" aria-hidden />
          AI-powered group travel
        </div>

        <h1 className="mt-5 text-5xl sm:text-7xl font-bold tracking-tight text-white leading-[1.05] drop-shadow-md">
          Plan, split, decide. Together.
        </h1>

        <p className="mt-4 sm:mt-5 text-lg sm:text-xl text-white/90 max-w-2xl leading-relaxed drop-shadow-sm">
          AI trip planning, expense splitting, and group decisions in one app.
        </p>

        {formEl}

        {secondaryAction && (
          <div className="mt-4 text-sm text-white/85 drop-shadow-sm">
            {secondaryAction}
          </div>
        )}

        {sampleRow}
      </div>

      <style>{`
        @keyframes hero-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .hero-shake { animation: hero-shake 0.35s ease-in-out; }
      `}</style>
    </section>
  );
}
