import { useState, useRef, useEffect } from "react";
import { ArrowRight, Sparkles, ListChecks, MapPin, Calendar, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  onStepByStep: () => void;
  onFreeText: (text: string) => void;
};

const ROTATING_TEXTS = [
  "Bali with 4 friends, beaches & nightlife…",
  "Romantic week in Tuscany, wine & history…",
  "Family road trip through Iceland…",
  "Tokyo for cherry blossom season…",
  "Backpacking Southeast Asia on a budget…",
];

export function StepEntryChoice({ onStepByStep, onFreeText }: Props) {
  const [text, setText] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [fadeIn, setFadeIn] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const canSubmit = text.trim().length >= 10;

  useEffect(() => {
    const t = setTimeout(() => setFadeIn(true), 50);
    return () => clearTimeout(t);
  }, []);

  // Rotate placeholder text
  useEffect(() => {
    if (expanded || text.length > 0) return;
    const interval = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % ROTATING_TEXTS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [expanded, text]);

  const handleExpand = () => {
    setExpanded(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  return (
    <div className="flex flex-col h-full items-center justify-center px-6 pb-6">
      {/* Hero content — centered */}
      <div
        className={cn(
          "flex flex-col items-center text-center w-full max-w-2xl transition-all duration-700",
          fadeIn ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
          expanded ? "-mt-16" : "mt-0"
        )}
      >
        {/* Junto AI badge */}
        <div
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full mb-5 transition-all duration-500",
            "bg-primary/10 border border-primary/20"
          )}
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-primary tracking-wider uppercase">
            Junto AI
          </span>
        </div>

        <h1
          className={cn(
            "font-bold text-foreground leading-tight mb-3 transition-all duration-500",
            expanded ? "text-xl" : "text-3xl sm:text-4xl"
          )}
        >
          Plan your perfect trip
        </h1>
        <p
          className={cn(
            "text-muted-foreground mb-8 max-w-md transition-all duration-500",
            expanded ? "text-sm mb-5" : "text-base"
          )}
        >
          Tell us where you want to go and we'll craft a complete itinerary
        </p>

        {/* Search bar */}
        {!expanded ? (
          /* Collapsed — Airbnb-style pill */
          <button
            onClick={handleExpand}
            className={cn(
              "w-full max-w-lg flex items-center gap-3 rounded-full",
              "bg-card border border-border shadow-lg hover:shadow-xl",
              "px-6 py-4 transition-all duration-300 hover:border-primary/30",
              "active:scale-[0.99] group cursor-text"
            )}
          >
            <Sparkles className="h-5 w-5 text-primary shrink-0" />
            <span className="flex-1 text-left text-muted-foreground/60 text-[15px] truncate">
              {ROTATING_TEXTS[placeholderIdx]}
            </span>
            <div
              className="h-10 w-10 rounded-full flex items-center justify-center shrink-0 shadow-sm group-hover:shadow-md transition-shadow"
              style={{ background: "var(--gradient-primary)" }}
            >
              <ArrowRight className="h-4 w-4 text-primary-foreground" />
            </div>
          </button>
        ) : (
          /* Expanded — full input */
          <div
            className={cn(
              "w-full max-w-lg rounded-2xl border border-border bg-card shadow-xl",
              "transition-all duration-300 focus-within:border-primary/40 focus-within:shadow-2xl"
            )}
          >
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && canSubmit) {
                  e.preventDefault();
                  onFreeText(text.trim());
                }
              }}
              placeholder="Describe your dream trip — destinations, dates, group size, vibe, budget…"
              rows={3}
              className={cn(
                "w-full resize-none bg-transparent border-none outline-none",
                "text-[15px] text-foreground placeholder:text-muted-foreground/40",
                "p-5 pb-2 rounded-2xl"
              )}
            />

            {/* Quick hint chips */}
            {text.length === 0 && (
              <div className="px-5 pb-2 flex flex-wrap gap-1.5">
                {["📍 Destination", "📅 Dates", "👥 Group size", "💰 Budget", "✨ Vibes"].map((chip) => (
                  <span
                    key={chip}
                    className="text-[11px] text-muted-foreground/50 px-2 py-0.5 rounded-full bg-muted/50"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between px-4 pb-3 pt-1">
              <button
                onClick={() => { setExpanded(false); setText(""); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
              >
                Cancel
              </button>
              <button
                onClick={() => canSubmit && onFreeText(text.trim())}
                disabled={!canSubmit}
                className={cn(
                  "h-10 px-5 rounded-full flex items-center gap-2 text-sm font-semibold transition-all",
                  canSubmit
                    ? "text-primary-foreground shadow-md hover:shadow-lg active:scale-[0.97]"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                )}
                style={canSubmit ? { background: "var(--gradient-primary)" } : undefined}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Plan my trip
              </button>
            </div>
          </div>
        )}

        {/* Subtle step-by-step link */}
        <button
          onClick={onStepByStep}
          className={cn(
            "mt-6 flex items-center gap-2 text-sm text-muted-foreground/70 hover:text-foreground transition-colors",
            "group"
          )}
        >
          <ListChecks className="h-4 w-4 group-hover:text-primary transition-colors" />
          <span>Or answer step by step</span>
        </button>
      </div>
    </div>
  );
}
