import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { JuntoWordmark } from "./JuntoWordmark";
import { SampleTripCard } from "./SampleTripCard";
import { SAMPLE_TRIPS } from "./sampleTrips";

type Props = {
  /** Called when the user submits a non-empty prompt. */
  onSubmit: (prompt: string) => void | Promise<void>;
  /** Disables the input + button (e.g. during navigation/AI work). */
  busy?: boolean;
  /** Optional initial value (used to resume a prompt after signup). */
  prefill?: string;
};

// Auto-resizing textarea height: re-measure scrollHeight on every input
// so the field grows naturally with multi-line prompts. Shrinks back via
// the height: 'auto' reset on each pass.
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

export function Hero({ onSubmit, busy = false, prefill }: Props) {
  const [value, setValue] = useState(prefill ?? "");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const textareaRef = useAutoSize(value);

  // If the host swaps `prefill` (e.g. consumePendingPrompt resolves after
  // mount, or the in-page authed flow on /trips/new sets a new prompt),
  // mirror it into local state. We only overwrite when the user hasn't
  // typed anything themselves yet, to avoid stomping their input.
  useEffect(() => {
    if (prefill && value.length === 0) {
      setValue(prefill);
    }
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
    // Cmd/Ctrl + Enter submits. Plain Enter inserts a newline — we want
    // multi-line prompts to feel natural.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSubmit();
    }
  }

  return (
    <section className="w-full">
      <div className="mx-auto w-full max-w-3xl px-5 sm:px-8 pt-6 sm:pt-8 pb-10 sm:pb-16">
        {/* Wordmark, top-left */}
        <div className="mb-10 sm:mb-16">
          <JuntoWordmark />
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-foreground leading-[1.05]">
          Plan, split, decide. Together.
        </h1>

        {/* Subhead */}
        <p className="mt-4 sm:mt-5 text-base sm:text-lg text-muted-foreground max-w-2xl leading-relaxed">
          AI trip planning, expense splitting, and group decisions in one app.
        </p>

        {/* Input */}
        <form onSubmit={handleSubmit} className="mt-8 sm:mt-10">
          <div
            className={[
              "relative rounded-2xl border bg-card shadow-sm transition-all",
              "focus-within:border-primary/40 focus-within:shadow-md",
              error ? "border-destructive/50" : "border-border",
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
              rows={3}
              placeholder="Tell Junto AI about your trip — destination, dates, who's coming"
              aria-label="Describe your trip"
              aria-invalid={!!error}
              className={[
                "block w-full resize-none bg-transparent",
                "px-5 pt-4 pb-3 sm:pb-4 sm:pr-44",
                "text-foreground placeholder:text-muted-foreground/70",
                "outline-none rounded-2xl",
                "disabled:opacity-60",
              ].join(" ")}
            />

            {/* Plan button — full-width below on mobile, bottom-right on desktop */}
            <div className="px-3 pb-3 sm:p-0">
              <button
                type="submit"
                disabled={busy}
                className={[
                  "inline-flex items-center justify-center gap-1.5",
                  "rounded-xl bg-primary text-primary-foreground",
                  "px-5 py-3 text-sm font-semibold",
                  "shadow-sm hover:bg-primary/90 active:bg-primary/95",
                  "disabled:opacity-60 disabled:cursor-not-allowed",
                  "transition-colors",
                  // Mobile: full-width below textarea
                  "w-full",
                  // Desktop: anchor inside the textarea, bottom-right
                  "sm:w-auto sm:absolute sm:right-3 sm:bottom-3",
                ].join(" ")}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Planning…
                  </>
                ) : (
                  <>
                    Plan my trip
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Inline validation */}
          {error && (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </form>

        {/* Sample trips */}
        <div className="mt-10 sm:mt-14">
          <p className="text-sm text-muted-foreground mb-3">
            Or browse a sample trip:
          </p>
          <div
            className={[
              // Mobile: horizontal scroll-snap row, bleeds to page edges
              "flex gap-4 overflow-x-auto snap-x snap-mandatory -mx-5 px-5 pb-2",
              // Desktop: 3-up grid, no bleed, no scroll
              "md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:mx-0 md:px-0",
            ].join(" ")}
          >
            {SAMPLE_TRIPS.map((trip) => (
              <div
                key={trip.id}
                className="snap-start shrink-0 min-w-[80%] sm:min-w-[60%] md:min-w-0"
              >
                <SampleTripCard trip={trip} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tiny shake keyframe scoped to the empty-submit error. Kept inline
          so we don't bloat index.css for one micro-interaction. */}
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
