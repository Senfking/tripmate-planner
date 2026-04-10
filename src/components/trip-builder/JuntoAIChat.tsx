import { useState, useRef, useEffect } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  onSubmit: (text: string) => void;
  onBack: () => void;
};

const SUGGESTIONS = [
  "4 friends, Bali, 10 days in July, beach + nightlife 🏖️",
  "Romantic week in Italy, wine tasting & history 🍷",
  "Budget backpacking Southeast Asia for 2 weeks 🎒",
  "Family trip to Japan with kids, cherry blossom season 🌸",
];

export function JuntoAIChat({ onSubmit, onBack }: Props) {
  const [text, setText] = useState("");
  const [showGreeting, setShowGreeting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t1 = setTimeout(() => setShowGreeting(true), 150);
    const t2 = setTimeout(() => setShowSuggestions(true), 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const handleSubmit = () => {
    if (text.trim().length < 10) return;
    onSubmit(text.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-5 pt-8 pb-4">
        {/* AI greeting bubble */}
        <div
          className={cn(
            "flex gap-3 items-start transition-all duration-500",
            showGreeting ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
          )}
        >
          {/* AI avatar */}
          <div
            className="h-9 w-9 rounded-full shrink-0 flex items-center justify-center shadow-lg"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>

          <div className="flex flex-col gap-2 max-w-[85%]">
            <span className="text-xs font-semibold text-primary tracking-wide uppercase">
              Junto AI
            </span>
            <div className="rounded-2xl rounded-tl-sm bg-card border border-border px-4 py-3 shadow-sm">
              <p className="text-[15px] text-foreground leading-relaxed">
                Hey! ✨ Tell me about your dream trip — where you want to go, how many people, 
                what kind of vibe you're after, budget… anything! I'll plan the whole thing for you.
              </p>
            </div>
          </div>
        </div>

        {/* Suggestion chips */}
        <div
          className={cn(
            "mt-5 ml-12 flex flex-col gap-2 transition-all duration-500 delay-200",
            showSuggestions ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
          )}
        >
          <p className="text-xs text-muted-foreground mb-1">Try something like:</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setText(s);
                  inputRef.current?.focus();
                }}
                className={cn(
                  "text-left text-sm px-3 py-2 rounded-xl border border-border bg-card/60",
                  "hover:border-primary/40 hover:bg-card transition-all active:scale-[0.98]",
                  "text-muted-foreground hover:text-foreground"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Input bar */}
      <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-2 border-t border-border bg-background">
        <div className="flex items-end gap-2 bg-card border border-border rounded-2xl px-4 py-2 shadow-sm focus-within:border-primary/50 transition-colors">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your dream trip…"
            rows={1}
            className={cn(
              "flex-1 resize-none bg-transparent border-none outline-none text-[15px] text-foreground",
              "placeholder:text-muted-foreground/60 min-h-[24px] max-h-[120px] py-1"
            )}
            style={{ fieldSizing: "content" } as any}
            autoFocus
          />
          <button
            onClick={handleSubmit}
            disabled={text.trim().length < 10}
            className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-all",
              text.trim().length >= 10
                ? "text-primary-foreground shadow-md"
                : "bg-muted text-muted-foreground"
            )}
            style={text.trim().length >= 10 ? { background: "var(--gradient-primary)" } : undefined}
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
        <button
          onClick={onBack}
          className="w-full text-center text-sm text-muted-foreground mt-2 py-1"
        >
          ← Back to options
        </button>
      </div>
    </div>
  );
}
