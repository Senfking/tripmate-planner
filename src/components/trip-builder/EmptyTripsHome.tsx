import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, FileText, Hash, ListChecks, Sparkles } from "lucide-react";
import { TripCarousels } from "@/components/landing/TripCarousel";

/**
 * EmptyTripsHome — the redesigned zero-trips state for /app/trips.
 *
 * Replaces the previous Hero(app) + feature-cards composition with a
 * product-feeling layout: animated AI pill, equally-weighted alternate
 * paths, prominent join-with-code CTA, and an inspiration grid that
 * pre-fills the prompt.
 */

const SAMPLE_PROMPTS = [
  "10 days in Japan in April, 4 friends, food and temples",
  "Honeymoon in Greece, 2 weeks in June, island hopping",
  "7-day Iceland road trip in September, northern lights",
  "Family of 5 in Costa Rica over Christmas, beaches and rainforest",
  "Bachelor weekend in Lisbon for 8 in late May, rooftops and surf",
  "Solo backpacking SE Asia for 3 weeks, hostels under $40/night",
];

type Inspiration = {
  id: string;
  title: string;
  meta: string;
  prompt: string;
  image: string;
};

const INSPIRATION: Inspiration[] = [
  {
    id: "tokyo-foodie",
    title: "Tokyo for foodies",
    meta: "5 days · 2 people",
    prompt: "5 days in Tokyo for 2 foodies — ramen, sushi, izakayas, one fine dining splurge",
    image: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=600&q=70&auto=format&fit=crop",
  },
  {
    id: "lisbon-weekend",
    title: "Lisbon weekend",
    meta: "3 days · friends",
    prompt: "Long weekend in Lisbon for 4 friends — rooftop bars, Alfama, day trip to Sintra",
    image: "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=600&q=70&auto=format&fit=crop",
  },
  {
    id: "bali-wellness",
    title: "Bali wellness reset",
    meta: "7 days · solo",
    prompt: "7-day wellness reset in Bali — yoga, Ubud retreats, healthy food, beach time",
    image: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=600&q=70&auto=format&fit=crop",
  },
  {
    id: "iceland-roadtrip",
    title: "Iceland ring road",
    meta: "8 days · couple",
    prompt: "8 days driving the Iceland ring road in September with my partner, northern lights and hot springs",
    image: "https://images.unsplash.com/photo-1531168556467-80aace0d0144?w=600&q=70&auto=format&fit=crop",
  },
];

function useTypewriter(active: boolean, fallback: string) {
  const [text, setText] = useState(fallback);
  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    if (!active || reduced) {
      setText(fallback);
      return;
    }
    let promptIdx = 0;
    let charIdx = 0;
    let phase: "typing" | "holding" | "deleting" = "typing";
    let timer: number;
    const tick = () => {
      const current = SAMPLE_PROMPTS[promptIdx];
      if (phase === "typing") {
        charIdx += 1;
        setText(current.slice(0, charIdx));
        if (charIdx >= current.length) {
          phase = "holding";
          timer = window.setTimeout(tick, 2400);
          return;
        }
        timer = window.setTimeout(tick, 26 + Math.random() * 38);
      } else if (phase === "holding") {
        phase = "deleting";
        timer = window.setTimeout(tick, 20);
      } else {
        charIdx -= 2;
        if (charIdx <= 0) {
          charIdx = 0;
          phase = "typing";
          promptIdx = (promptIdx + 1) % SAMPLE_PROMPTS.length;
          setText("");
          timer = window.setTimeout(tick, 380);
          return;
        }
        setText(current.slice(0, Math.max(charIdx, 0)));
        timer = window.setTimeout(tick, 14);
      }
    };
    timer = window.setTimeout(tick, 700);
    return () => window.clearTimeout(timer);
  }, [active, fallback]);
  return text;
}

function getGreeting(name: string | null | undefined): string {
  const hour = new Date().getHours();
  const first = name?.split(" ")[0] ?? "";
  const suffix = first ? `, ${first}` : "";
  if (hour >= 5 && hour < 12) return `Morning${suffix}`;
  if (hour >= 12 && hour < 18) return `Afternoon${suffix}`;
  return `Evening${suffix}`;
}

export type EmptyTripsHomeProps = {
  displayName?: string | null;
  onSubmitPrompt: (prompt: string) => void;
  onPlanStepByStep: () => void;
  onSkipItinerary: () => void;
  onJoinWithCode: () => void;
};

export function EmptyTripsHome({
  displayName,
  onSubmitPrompt,
  onPlanStepByStep,
  onSkipItinerary,
  onJoinWithCode,
}: EmptyTripsHomeProps) {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [shake, setShake] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const animated = useTypewriter(value.length === 0, "Describe your trip — destination, dates, who's coming");

  const greeting = getGreeting(displayName);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setShake(true);
      window.setTimeout(() => setShake(false), 400);
      textareaRef.current?.focus();
      return;
    }
    onSubmitPrompt(trimmed);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  }

  function pickInspiration(prompt: string) {
    setValue(prompt);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  return (
    <div className="w-full">
      {/* Desktop softened greeting */}
      <div className="hidden md:block pt-8 pb-2 px-6 max-w-3xl mx-auto w-full">
        <h1 className="text-[26px] font-bold text-foreground tracking-tight">
          {greeting} — where to next?
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tell Junto AI about a trip you're dreaming up, or start from one of the ideas below.
        </p>
      </div>

      <section className="relative w-full">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 pt-4 pb-8 sm:pb-12">
          {/* Hero card with animated AI pill */}
          <div className="relative overflow-hidden rounded-3xl border border-[#0D9488]/15 bg-gradient-to-br from-[#0D9488]/[0.07] via-background to-background p-5 sm:p-7 shadow-sm">
            <div className="pointer-events-none absolute -top-20 -right-20 h-52 w-52 rounded-full bg-[#0D9488]/15 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-12 h-48 w-48 rounded-full bg-[#0891b2]/10 blur-3xl" />

            <div className="relative flex flex-col items-center text-center">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#0D9488]/25 bg-background/70 backdrop-blur px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#0D9488]">
                <Sparkles className="h-3 w-3" />
                Powered by Junto AI
              </div>
              <h2 className="mt-3 text-[22px] sm:text-[26px] font-semibold tracking-tight text-foreground leading-tight">
                Plan your next trip,
                <br />
                <span className="text-[#0D9488]">Junto AI does the heavy lifting</span>
              </h2>

              {/* Pill input — visual parity with the landing hero pill */}
              <form
                onSubmit={submit}
                className={`mt-5 w-full max-w-xl ${shake ? "eth-shake" : ""}`}
              >
                <div className="flex items-center gap-2 rounded-[36px] sm:rounded-full bg-white border border-gray-100 shadow-[0_8px_30px_-12px_rgba(13,148,136,0.25)] pl-4 pr-2 py-2 sm:p-1.5 transition-all focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/40">
                  <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={2}
                    aria-label="Describe your trip"
                    placeholder={animated}
                    className="block w-full min-w-0 flex-1 resize-none bg-transparent pl-2 pr-0 sm:px-5 py-0 sm:py-2 text-[14px] sm:text-[13.5px] text-gray-700 placeholder:text-gray-500 outline-none border-0 leading-[1.4] overflow-y-auto scrollbar-hide min-h-[48px] text-left"
                  />
                  <button
                    type="submit"
                    aria-label="Plan with Junto AI"
                    className="group relative overflow-hidden inline-flex items-center justify-center gap-2 shrink-0 rounded-full text-white font-semibold h-[52px] w-[52px] p-0 sm:h-auto sm:w-auto sm:self-stretch sm:px-6 text-sm whitespace-nowrap shadow-[0_8px_24px_-6px_rgba(13,148,136,0.55)] transition-transform hover:scale-[1.02] active:scale-95"
                    style={{
                      background: "linear-gradient(135deg, #0D9488 0%, #14b8a6 50%, #0891b2 100%)",
                    }}
                  >
                    <span className="landing-shimmer pointer-events-none rounded-full" aria-hidden />
                    <span className="relative inline-flex items-center gap-2">
                      <Sparkles className="h-4 w-4" aria-hidden />
                      <span className="hidden sm:inline">Plan with Junto AI</span>
                      <ArrowRight className="hidden h-4 w-4 sm:block" aria-hidden />
                    </span>
                  </button>
                </div>
              </form>

              {/* Two equally-weighted alternate paths */}
              <div className="mt-3 flex w-full max-w-xl flex-col gap-2.5 sm:flex-row sm:gap-3">
                <button
                  type="button"
                  onClick={onPlanStepByStep}
                  className="group inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-gray-200 bg-white px-4 py-3 text-[13px] font-medium text-gray-700 transition-all hover:border-primary/40 hover:text-foreground active:opacity-80 min-h-[44px]"
                >
                  <ListChecks className="h-4 w-4" />
                  Plan step-by-step
                </button>
                <button
                  type="button"
                  onClick={onSkipItinerary}
                  className="group inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-gray-200 bg-white px-4 py-3 text-[13px] font-medium text-gray-700 transition-all hover:border-primary/40 hover:text-foreground active:opacity-80 min-h-[44px]"
                >
                  <FileText className="h-4 w-4" />
                  Start without an itinerary
                </button>
              </div>

              {/* Join-with-code: visually distinct second CTA, near the input */}
              <button
                type="button"
                onClick={onJoinWithCode}
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#0D9488]/30 bg-[#0D9488]/[0.06] px-4 py-2 text-[13px] font-semibold text-[#0D9488] hover:bg-[#0D9488]/10 transition-colors min-h-[40px]"
              >
                <Hash className="h-3.5 w-3.5" />
                Joining a friend's trip? Enter their code
              </button>
            </div>
          </div>

          {/* Inspiration grid */}
          <div className="mt-8">
            <div className="flex items-baseline justify-between mb-3 px-1">
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Need inspiration
              </h3>
              <span className="text-[11px] text-muted-foreground/70">Tap to pre-fill</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
              {INSPIRATION.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => pickInspiration(it.prompt)}
                  className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm text-left transition-all hover:shadow-md hover:-translate-y-0.5 active:opacity-90"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden">
                    <img
                      src={it.image}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-2.5">
                    <p className="text-[12.5px] font-semibold text-white leading-tight line-clamp-2 drop-shadow">
                      {it.title}
                    </p>
                    <p className="text-[10.5px] text-white/85 mt-0.5">{it.meta}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <style>{`
          @keyframes eth-shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-4px); }
            75% { transform: translateX(4px); }
          }
          .eth-shake { animation: eth-shake 0.35s ease-in-out; }
        `}</style>
      </section>
    </div>
  );
}
