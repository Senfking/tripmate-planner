import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

type Props = {
  value: string;
  source: string | null;
  surpriseMe: boolean;
  onChange: (v: string) => void;
  onSurpriseMe: (v: boolean) => void;
};

export function StepDestination({ value, source, surpriseMe, onChange, onSurpriseMe }: Props) {
  return (
    <div className="flex flex-col h-full px-6 pt-12 sm:pt-16">
      <h2 className="text-2xl font-bold text-foreground mb-1">Where are you going?</h2>
      {source && (
        <p className="text-xs text-muted-foreground mb-4">{source}</p>
      )}
      {!source && <div className="mb-4" />}

      {!surpriseMe ? (
        <>
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Bali, Barcelona, Tokyo..."
            className="h-14 rounded-xl text-lg bg-card border-border"
            autoFocus
          />
          <Button
            variant="ghost"
            className="mt-4 self-start text-sm font-medium gap-2"
            onClick={() => onSurpriseMe(true)}
          >
            <Sparkles className="h-4 w-4" />
            Surprise me ✨
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Let AI pick based on your other answers
          </p>
        </>
      ) : (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
          <Sparkles className="h-8 w-8 text-primary mx-auto mb-3" />
          <p className="font-semibold text-foreground">We'll surprise you!</p>
          <p className="text-sm text-muted-foreground mt-1">AI will pick based on your vibes and budget</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-4 text-xs"
            onClick={() => onSurpriseMe(false)}
          >
            Actually, I have a place in mind
          </Button>
        </div>
      )}
    </div>
  );
}
