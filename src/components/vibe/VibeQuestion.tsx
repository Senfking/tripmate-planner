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
    <div className={cn("mt-6 first:mt-0 rounded-lg p-2 -mx-2 transition-colors", missing && "bg-destructive/5 ring-1 ring-destructive/20")}>
      <div className="border-l-2 border-[#0D9488] pl-3">
        <p className="text-[15px] font-semibold text-foreground">
          {label}
          {multiSelect && (
            <span className="text-muted-foreground font-normal ml-1 text-[13px]">
              (pick up to 2)
            </span>
          )}
          {missing && (
            <span className="text-destructive font-normal ml-1 text-xs">
              — please select
            </span>
          )}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        {options.map((opt) => {
          const isSelected = selected.includes(opt);
          return (
            <button
              key={opt}
              disabled={disabled}
              onClick={() => onSelect(opt)}
              className={cn(
                "h-10 px-5 rounded-full text-sm font-medium transition-all",
                "disabled:opacity-60 disabled:cursor-not-allowed",
                isSelected
                  ? "bg-[#0D9488] text-white border border-transparent shadow-sm"
                  : "bg-white text-[#374151] border border-[#E5E7EB] hover:border-[#0D9488]/40"
              )}
            >
              {opt.replace(/\s*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2702}-\u{27B0}\u{200D}\u{FE0F}\u{2640}\u{2642}\u{2694}-\u{269F}\u{1FA70}-\u{1FAFF}]+$/u, "")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
