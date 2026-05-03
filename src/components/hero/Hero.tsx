import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
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
    // Only auto-grow on mobile (stacked card layout). On desktop the
    // textarea sits inside a single-row pill — letting it grow distorts
    // the pill shape, so we keep a fixed height and let content scroll.
    const isDesktop = window.matchMedia("(min-width: 640px)").matches;
    if (isDesktop) {
      el.style.height = "";
      return;
    }
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
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
  // Mobile: stacked card (rounded-3xl) — textarea on top, full-width
  // button below. Desktop (sm+): single-row rounded-full pill with the
  // button nested on the right, sized so it nearly fills the pill height.
  const pillClasses = isApp
    ? [
        "relative flex flex-col sm:flex-row sm:items-stretch gap-2 sm:gap-0",
        "rounded-3xl sm:rounded-full bg-white border border-gray-200",
        "shadow-md p-2 sm:pl-5 sm:pr-1 sm:py-1 transition-all",
        "focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/40",
      ].join(" ")
    : [
        "relative flex flex-col sm:flex-row sm:items-stretch gap-2 sm:gap-0",
        "rounded-3xl sm:rounded-full bg-white/95 backdrop-blur-xl border border-white/50",
        "shadow-2xl p-2 sm:pl-5 sm:pr-1 sm:py-1 transition-all",
        "focus-within:ring-2 focus-within:ring-white/70",
      ].join(" ");

  const formEl = (
    <form
      onSubmit={handleSubmit}
      className={isApp ? "mt-6 w-full max-w-2xl" : "mt-8 sm:mt-10 w-full max-w-2xl"}
    >
      <div
        className={[
          pillClasses,
          error ? "ring-2 ring-destructive/50" : "",
          shake ? "hero-shake" : "",
        ].join(" ")}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          disabled={busy}
          rows={1}
          placeholder={
            isApp
              ? "Describe your trip — destination, dates, who's coming"
              : "Tell Junto AI about your trip — destination, dates, who's coming"
          }
          aria-label="Describe your trip"
          aria-invalid={!!error}
          className={[
            "block w-full flex-1 resize-none bg-transparent",
            "px-3 py-2 sm:px-0 sm:py-2.5",
            "text-[15px] sm:text-[15px] text-gray-900 placeholder:text-gray-500",
            "outline-none",
            // Mobile: auto-grows up to 140px (multiline card). Desktop:
            // fixed single-line height that matches the button so the
            // pill shape stays constant; overflow scrolls internally.
            "min-h-[44px] max-h-[140px] sm:max-h-none sm:h-10 overflow-y-auto",
            "disabled:opacity-60",
            "text-left sm:text-center leading-snug",
          ].join(" ")}
        />

        <button
          type="submit"
          disabled={busy}
          className={[
            "inline-flex items-center justify-center gap-2",
            "rounded-2xl sm:rounded-full bg-primary text-white font-semibold",
            "px-5 py-3 sm:px-6 sm:py-2.5 text-sm sm:text-[14px] whitespace-nowrap",
            "shadow-[0_4px_14px_-2px_hsl(var(--primary)/0.5)]",
            "transition-all",
            "hover:brightness-110 hover:shadow-[0_6px_20px_-2px_hsl(var(--primary)/0.6)]",
            "active:brightness-95",
            "disabled:opacity-60 disabled:cursor-not-allowed",
            "w-full sm:w-auto sm:shrink-0 sm:self-stretch",
          ].join(" ")}
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Planning…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" aria-hidden />
              Plan with Junto AI
              <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
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

          {/* OR divider + stacked secondary actions */}
          {secondaryAction && (
            <div className="mt-6 flex flex-col items-center">
              <p className="text-[11.5px] uppercase tracking-[0.14em] text-muted-foreground/60">OR</p>
              <div className="mt-2 w-full">{secondaryAction}</div>
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
