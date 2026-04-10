import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  dietary: string[];
  notes: string;
  prefilledFromFreeText?: boolean;
  onToggleDietary: (v: string) => void;
  onNotesChange: (v: string) => void;
};

const DIETARY_OPTIONS = ["Vegetarian", "Vegan", "Halal", "Gluten-free", "No restrictions"];

export function StepExtras({ dietary, notes, prefilledFromFreeText, onToggleDietary, onNotesChange }: Props) {
  return (
    <div className="flex flex-col h-full px-6 pt-12 sm:pt-16">
      <h2 className="text-2xl font-bold text-foreground mb-1">Anything else we should know?</h2>
      {prefilledFromFreeText && (
        <p className="text-xs text-primary/70 mb-1">Pre-filled from your description</p>
      )}
      <p className="text-sm text-muted-foreground mb-5">Optional — you can skip this</p>

      <div className="mb-6">
        <p className="text-sm font-medium text-foreground mb-3">Dietary preferences</p>
        <div className="flex flex-wrap gap-2">
          {DIETARY_OPTIONS.map((d) => {
            const isOn = dietary.includes(d);
            return (
              <button
                key={d}
                onClick={() => onToggleDietary(d)}
                className={cn(
                  "px-3.5 py-2 rounded-full border text-sm font-medium transition-all active:scale-[0.95]",
                  isOn
                    ? "text-primary-foreground border-transparent shadow-md"
                    : "bg-card text-foreground border-border hover:border-primary/40"
                )}
                style={isOn ? { background: "var(--gradient-primary)" } : undefined}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-foreground mb-2">Special needs or preferences</p>
        <Textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Traveling with kids, wheelchair access, etc."
          className="rounded-xl bg-card border-border resize-none min-h-[100px]"
        />
      </div>
    </div>
  );
}
