import { useState, useRef } from "react";
import { ArrowRight, Sparkles, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  onStepByStep: () => void;
  onFreeText: (text: string) => void;
};

export function StepEntryChoice({ onStepByStep, onFreeText }: Props) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const canSubmit = text.trim().length >= 10;

  return (
    <div className="flex flex-col h-full px-6 pt-10 pb-6">
      {/* Hero section */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className="h-8 w-8 rounded-full flex items-center justify-center"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Sparkles className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="text-sm font-semibold text-primary tracking-wide uppercase">
          Junto AI
        </span>
      </div>

      <h2 className="text-2xl font-bold text-foreground mb-1">
        Where do you want to go? ✨
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        Describe your dream trip and Junto AI will plan it for you
      </p>

      {/* Prominent input area */}
      <div className="rounded-2xl border border-border bg-card shadow-sm focus-within:border-primary/50 focus-within:shadow-md transition-all">
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
          placeholder="e.g. 4 friends going to Bali for 10 days in July, we love food and nightlife, budget around €100/day…"
          rows={4}
          className={cn(
            "w-full resize-none bg-transparent border-none outline-none text-[15px] text-foreground",
            "placeholder:text-muted-foreground/50 p-4 rounded-2xl"
          )}
          autoFocus
        />
        <div className="flex items-center justify-between px-4 pb-3">
          <span className="text-xs text-muted-foreground/60">
            {text.trim().length > 0 && text.trim().length < 10 && "Keep going…"}
          </span>
          <button
            onClick={() => canSubmit && onFreeText(text.trim())}
            disabled={!canSubmit}
            className={cn(
              "h-9 px-4 rounded-full flex items-center gap-2 text-sm font-semibold transition-all",
              canSubmit
                ? "text-primary-foreground shadow-md hover:shadow-lg active:scale-[0.97]"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
            style={canSubmit ? { background: "var(--gradient-primary)" } : undefined}
          >
            Plan my trip
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Secondary option */}
      <button
        onClick={onStepByStep}
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-xl border border-border/60 bg-card/50",
          "hover:border-primary/30 hover:bg-card transition-all text-left active:scale-[0.98]"
        )}
      >
        <ListChecks className="h-5 w-5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-sm font-medium text-foreground">Or answer step by step</p>
          <p className="text-xs text-muted-foreground">We'll guide you through a few quick questions</p>
        </div>
      </button>
    </div>
  );
}
