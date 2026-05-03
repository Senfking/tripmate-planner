import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { JuntoWordmark } from "./JuntoWordmark";
import { SAMPLE_TRIPS } from "./sampleTrips";
import { useNavigate } from "react-router-dom";

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
};

// Atmospheric full-bleed background photo. Picked for warm golden-hour
// light + open sky/horizon area at the top so the headline sits over a
// readable region. Hosted on Unsplash CDN with a width param so we don't
// pull a 5MB original.
const HERO_BG =
  "https://images.unsplash.com/photo-1503917988258-f87a78e3c995?w=2400&q=80&auto=format&fit=crop";

// Auto-resizing textarea height: re-measure scrollHeight on every input
// so the field grows naturally with multi-line prompts. Capped via CSS
// max-height so very long pastes scroll internally instead of pushing
// the CTA off-screen.
function useAutoSize(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
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
}: Props) {
  const [value, setValue] = useState(prefill ?? "");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const textareaRef = useAutoSize(value);
  const navigate = useNavigate();

  // Mirror prefill into local state when it resolves after mount (e.g.
  // consumePendingPrompt fires async, or the in-page authed flow on
  // /trips/new sets a new prompt). Only overwrite when the user hasn't
  // typed yet, to avoid stomping their input.
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
    // Cmd/Ctrl + Enter submits. Plain Enter inserts a newline.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSubmit();
    }
  }

  return (
    <section
      className="relative w-full overflow-hidden isolate"
      style={{ minHeight: "min(85vh, 900px)" }}
    >
      {/* Full-bleed atmospheric background. Loaded eagerly + high priority
          since it's the LCP element. */}
      <img
        src={HERO_BG}
        alt=""
        aria-hidden
        // @ts-expect-error -- fetchpriority is valid HTML, not yet typed
        fetchpriority="high"
        className="absolute inset-0 -z-20 h-full w-full object-cover"
      />
      {/* Dark gradient overlay for text legibility. Heavier at top where
          the wordmark + headline sit, lighter at the bottom over the
          glass input. */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0.30) 45%, rgba(0,0,0,0.55) 100%)",
        }}
        aria-hidden
      />

      {/* Top bar: wordmark + log in pill */}
      <div className="relative z-10 flex items-center justify-between px-5 sm:px-10 pt-5 sm:pt-7">
        <JuntoWordmark variant="light" />
        <Link
          to="/ref"
          className="inline-flex items-center rounded-full px-4 py-2 text-sm font-medium text-white bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 transition-colors"
        >
          Log in
        </Link>
      </div>

      {/* Center stack — sized to ~75vh mobile, ~85vh desktop minus top bar */}
      <div
        className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center justify-center px-5 sm:px-8 text-center"
        style={{ minHeight: "min(75vh, 760px)" }}
      >
        {/* Pill */}
        <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 px-3 py-1.5 text-xs font-medium text-white shadow-sm">
          <Sparkles className="h-3 w-3" aria-hidden />
          AI-powered group travel
        </div>

        {/* Headline */}
        <h1 className="mt-5 text-5xl sm:text-7xl font-bold tracking-tight text-white leading-[1.05] drop-shadow-md">
          Plan, split, decide. Together.
        </h1>

        {/* Subhead */}
        <p className="mt-4 sm:mt-5 text-lg sm:text-xl text-white/90 max-w-2xl leading-relaxed drop-shadow-sm">
          AI trip planning, expense splitting, and group decisions in one app.
        </p>

        {/* Glass input */}
        <form onSubmit={handleSubmit} className="mt-8 sm:mt-10 w-full max-w-2xl">
          <div
            className={[
              "flex flex-col sm:flex-row sm:items-end gap-2",
              "rounded-2xl bg-white/95 backdrop-blur-xl border border-white/40",
              "shadow-2xl p-2 transition-all",
              "focus-within:ring-2 focus-within:ring-white/60",
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
              rows={2}
              placeholder="Tell Junto AI about your trip — destination, dates, who's coming"
              aria-label="Describe your trip"
              aria-invalid={!!error}
              className={[
                "block w-full resize-none bg-transparent",
                "px-3 py-2.5 sm:px-4 sm:py-3",
                "text-base text-gray-900 placeholder:text-gray-500",
                "outline-none rounded-xl",
                "max-h-[180px] overflow-y-auto",
                "disabled:opacity-60",
                "text-left",
              ].join(" ")}
            />

            <button
              type="submit"
              disabled={busy}
              className={[
                "inline-flex items-center justify-center gap-2",
                "rounded-xl bg-primary text-white font-semibold",
                "px-5 py-3 text-sm whitespace-nowrap",
                "shadow-md transition-all",
                "hover:brightness-110 hover:shadow-lg active:brightness-95",
                "disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:shadow-md",
                "w-full sm:w-auto sm:shrink-0",
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

          {/* Inline validation — readable pill on photo bg */}
          {error && (
            <p
              className="mt-3 inline-block rounded-full bg-black/40 backdrop-blur px-3 py-1 text-sm text-white"
              role="alert"
            >
              {error}
            </p>
          )}
        </form>

        {/* Optional secondary action (e.g. "Prefer to fill in details
            step by step?" link on /trips/new). */}
        {secondaryAction && (
          <div className="mt-4 text-sm text-white/85 drop-shadow-sm">
            {secondaryAction}
          </div>
        )}

        {/* Sample trips — understated quick-start row */}
        <div className="mt-10 sm:mt-12 w-full max-w-2xl">
          <p className="text-sm text-white/80 mb-3 text-left sm:text-center drop-shadow-sm">
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
                className={[
                  "snap-start shrink-0",
                  "flex items-center gap-3 text-left",
                  "rounded-xl bg-white/10 hover:bg-white/15 backdrop-blur-md",
                  "border border-white/20 px-3 py-2.5",
                  "transition-colors",
                  "min-w-[240px] sm:min-w-0",
                ].join(" ")}
              >
                <img
                  src={trip.image}
                  alt=""
                  loading="lazy"
                  className="h-10 w-10 rounded-full object-cover shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">
                    {trip.title}
                  </div>
                  <div className="mt-0.5">
                    <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/15 text-white/90">
                      {trip.tags[0]}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Local keyframe for the empty-submit shake. Inline to avoid
          bloating index.css for one micro-interaction. */}
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
