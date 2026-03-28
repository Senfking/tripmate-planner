import { cn } from "@/lib/utils";

type Props = {
  label: string;
  options: string[];
  selected: string[];
  multiSelect?: boolean;
  disabled?: boolean;
  missing?: boolean;
  onSelect: (value: string) => void;
};

export function VibeQuestion({
  label,
  options,
  selected,
  multiSelect,
  disabled,
  missing,
  onSelect,
}: Props) {
  return (
    <div className={cn("space-y-2 rounded-lg p-2 -mx-2 transition-colors", missing && "bg-destructive/5 ring-1 ring-destructive/20")}>
      <p className="text-sm font-medium text-foreground">
        {label}
        {multiSelect && (
          <span className="text-muted-foreground font-normal ml-1">
            (pick up to 2)
          </span>
        )}
        {missing && (
          <span className="text-destructive font-normal ml-1 text-xs">
            — please select
          </span>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isSelected = selected.includes(opt);
          return (
            <button
              key={opt}
              disabled={disabled}
              onClick={() => onSelect(opt)}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium border transition-all",
                "disabled:opacity-60 disabled:cursor-not-allowed",
                isSelected
                  ? "bg-gradient-primary text-primary-foreground border-transparent shadow-sm"
                  : "bg-card text-foreground border-border hover:border-primary/40 hover:bg-accent"
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
