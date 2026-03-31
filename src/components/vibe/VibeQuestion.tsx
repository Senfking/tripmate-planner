import { cn } from "@/lib/utils";

export type VibeOption = { label: string; sub: string | null };

type Props = {
  label: string;
  emoji?: string;
  options: VibeOption[];
  selected: string[];
  multiSelect?: boolean;
  disabled?: boolean;
  missing?: boolean;
  onSelect: (value: string) => void;
};

export function VibeQuestion({
  label,
  emoji,
  options,
  selected,
  multiSelect,
  disabled,
  missing,
  onSelect,
}: Props) {
  return (
    <div className={cn("mt-6 first:mt-0 rounded-xl p-3 -mx-1 transition-colors", missing && "bg-destructive/5 ring-1 ring-destructive/20")}>
      <div className="flex items-center gap-2 mb-3">
        {emoji && <span className="text-lg">{emoji}</span>}
        <p className="text-[15px] font-semibold text-foreground">
          {label}
          {multiSelect && (
            <span className="text-muted-foreground font-normal ml-1 text-[13px]">
              · pick up to 2
            </span>
          )}
          {missing && (
            <span className="text-destructive font-normal ml-1 text-xs">
              — pick one
            </span>
          )}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isSelected = selected.includes(opt.label);
          return (
            <button
              key={opt.label}
              disabled={disabled}
              onClick={() => onSelect(opt.label)}
              className={cn(
                "rounded-xl text-left transition-all min-h-[44px] px-4 py-2",
                "disabled:opacity-60 disabled:cursor-not-allowed",
                isSelected
                  ? "text-white border border-transparent shadow-md"
                  : "bg-white text-[#374151] border border-[#E5E7EB] hover:border-[#0D9488]/40 hover:shadow-sm active:scale-[0.97]"
              )}
              style={isSelected ? { background: "linear-gradient(135deg, #0D9488, #0369a1)" } : undefined}
            >
              <span className="text-[14px] font-medium leading-tight">{opt.label}</span>
              {opt.sub && (
                <span className={cn(
                  "block text-[11px] leading-tight mt-0.5",
                  isSelected ? "text-white/70" : "text-muted-foreground"
                )}>
                  {opt.sub}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
