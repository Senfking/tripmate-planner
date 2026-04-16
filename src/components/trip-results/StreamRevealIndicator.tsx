import { Sparkles, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  message: string;
  progress: number;
  isRevealing: boolean;
}

/**
 * Floating indicator shown during the streaming reveal.
 * Displays contextual messages about what's currently being composed.
 * Fades out when the reveal completes.
 */
export function StreamRevealIndicator({ message, progress, isRevealing }: Props) {
  const done = !isRevealing && progress >= 1;

  return (
    <div
      className={cn(
        "sticky top-[57px] z-20 flex justify-center px-4 py-2 transition-all duration-500",
        done ? "opacity-0 pointer-events-none -translate-y-2" : "opacity-100"
      )}
    >
      <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-card/95 backdrop-blur-xl border border-[#0D9488]/20 shadow-lg max-w-sm">
        {done ? (
          <div className="h-5 w-5 rounded-full bg-[#0D9488] flex items-center justify-center animate-scale-in">
            <Check className="h-3 w-3 text-white" />
          </div>
        ) : (
          <div
            className="h-5 w-5 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Sparkles className="h-3 w-3 text-primary-foreground animate-pulse" />
          </div>
        )}

        <span className="text-xs font-medium text-foreground truncate">
          {done ? "Your trip is ready!" : message}
        </span>

        {/* Progress bar */}
        {!done && (
          <div className="w-12 h-1 rounded-full bg-muted/60 overflow-hidden shrink-0">
            <div
              className="h-full rounded-full bg-[#0D9488] transition-all duration-500 ease-out"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
