import { ChevronDown, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusVariant = "done" | "active" | "waiting" | "muted";

type Props = {
  stepNumber: number;
  title: string;
  subtitle?: string;
  statusText: string;
  statusVariant: StatusVariant;
  isExpanded: boolean;
  onToggle: () => void;
  isLocked?: boolean;
  lockMessage?: string;
  onSkip?: () => void;
  activeBorder?: boolean;
  collapsedSummary?: string;
  isHighlighted?: boolean;
  children: React.ReactNode;
};

const variantStyles: Record<StatusVariant, string> = {
  done: "bg-emerald-100 text-emerald-700 border-emerald-200",
  active: "bg-primary/10 text-primary border-primary/20",
  waiting: "bg-muted text-muted-foreground border-border",
  muted: "bg-muted text-muted-foreground border-border",
};

export function StepSection({
  stepNumber,
  title,
  subtitle,
  statusText,
  statusVariant,
  isExpanded,
  onToggle,
  isLocked,
  lockMessage,
  onSkip,
  activeBorder,
  collapsedSummary,
  children,
}: Props) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card shadow-sm transition-all duration-200",
        activeBorder && "border-primary border-[1.5px]",
        isLocked && "opacity-70"
      )}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="flex items-center gap-3 w-full p-4 text-left"
      >
        {/* Step circle */}
        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0">
          {stepNumber}
        </div>

        {/* Title area */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground text-sm">
              {title}
            </span>
            {subtitle && (
              <span className="text-xs text-muted-foreground">{subtitle}</span>
            )}
          </div>
          {!isExpanded && collapsedSummary && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {collapsedSummary}
            </p>
          )}
          {isLocked && lockMessage && !isExpanded && (
            <div className="flex items-center gap-1 mt-0.5">
              <Lock className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{lockMessage}</span>
              {onSkip && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSkip();
                  }}
                  className="text-xs text-primary underline ml-1"
                >
                  Skip
                </button>
              )}
            </div>
          )}
        </div>

        {/* Status badge */}
        <Badge
          className={cn(
            "text-[10px] px-2 py-0.5 shrink-0 font-medium",
            variantStyles[statusVariant]
          )}
          variant="outline"
        >
          {statusText}
        </Badge>

        {/* Chevron */}
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-300",
            !isExpanded && "-rotate-90"
          )}
        />
      </button>

      {/* Collapsible body */}
      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          {(!isLocked || isExpanded) && (
            <div className="px-4 pb-4">{children}</div>
          )}
        </div>
      </div>
    </div>
  );
}
