import { useState } from "react";
import { MessageSquareText, ListChecks, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Props = {
  onStepByStep: () => void;
  onFreeText: (text: string) => void;
};

export function StepEntryChoice({ onStepByStep, onFreeText }: Props) {
  const [mode, setMode] = useState<"choice" | "freetext">("choice");
  const [text, setText] = useState("");

  if (mode === "freetext") {
    return (
      <div className="flex flex-col h-full px-6 pt-8 pb-6">
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Tell us about your dream trip ✈️
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Describe everything — we'll fill in the details for you to review.
        </p>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="We're 4 friends going to Southeast Asia for 10 days in July, we love food and nightlife, budget is around €100/day, one of us is vegetarian..."
          className="flex-1 min-h-[160px] rounded-xl text-base bg-card border-border resize-none"
          autoFocus
        />
        <div className="flex gap-3 mt-6">
          <Button
            variant="outline"
            className="flex-1 h-12 rounded-xl"
            onClick={() => setMode("choice")}
          >
            Back
          </Button>
          <Button
            className="flex-1 h-12 rounded-xl text-primary-foreground font-semibold"
            style={{ background: "var(--gradient-primary)" }}
            disabled={text.trim().length < 10}
            onClick={() => onFreeText(text.trim())}
          >
            Continue
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full px-6 pt-12 pb-6">
      <h2 className="text-2xl font-bold text-foreground mb-2">
        How would you like to start? ✨
      </h2>
      <p className="text-sm text-muted-foreground mb-8">
        We'll build your perfect itinerary with AI
      </p>

      <div className="flex flex-col gap-4 flex-1">
        <button
          onClick={() => setMode("freetext")}
          className={cn(
            "flex items-start gap-4 p-5 rounded-2xl border border-border bg-card",
            "hover:border-primary/40 hover:shadow-md transition-all text-left active:scale-[0.98]"
          )}
        >
          <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "var(--gradient-primary)" }}
          >
            <MessageSquareText className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-[15px]">Tell us about your dream trip</p>
            <p className="text-sm text-muted-foreground mt-1">
              Describe it in your own words and we'll do the rest
            </p>
          </div>
        </button>

        <button
          onClick={onStepByStep}
          className={cn(
            "flex items-start gap-4 p-5 rounded-2xl border border-border bg-card",
            "hover:border-primary/40 hover:shadow-md transition-all text-left active:scale-[0.98]"
          )}
        >
          <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0 bg-muted">
            <ListChecks className="h-6 w-6 text-foreground" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-[15px]">Answer step by step</p>
            <p className="text-sm text-muted-foreground mt-1">
              We'll guide you through a few quick questions
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
