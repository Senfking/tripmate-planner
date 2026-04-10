import { useState } from "react";
import { Sparkles, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { JuntoAIChat } from "./JuntoAIChat";

type Props = {
  onStepByStep: () => void;
  onFreeText: (text: string) => void;
};

export function StepEntryChoice({ onStepByStep, onFreeText }: Props) {
  const [mode, setMode] = useState<"choice" | "chat">("choice");

  if (mode === "chat") {
    return (
      <JuntoAIChat
        onSubmit={onFreeText}
        onBack={() => setMode("choice")}
      />
    );
  }

  return (
    <div className="flex flex-col h-full px-6 pt-12 pb-6">
      <h2 className="text-2xl font-bold text-foreground mb-2">
        How would you like to start? ✨
      </h2>
      <p className="text-sm text-muted-foreground mb-8">
        We'll build your perfect itinerary with Junto AI
      </p>

      <div className="flex flex-col gap-4 flex-1">
        <button
          onClick={() => setMode("chat")}
          className={cn(
            "flex items-start gap-4 p-5 rounded-2xl border border-border bg-card",
            "hover:border-primary/40 hover:shadow-md transition-all text-left active:scale-[0.98]"
          )}
        >
          <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-[15px]">Chat with Junto AI</p>
            <p className="text-sm text-muted-foreground mt-1">
              Describe your dream trip and we'll plan it for you
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
