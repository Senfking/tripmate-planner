import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  /** Latest stage from edge function. user_text drives non-ranking stages. */
  stage: { stage: string; user_text: string; percent_complete: number } | null;
  /** Destination-specific rotating micro-copy. Used during ranking_days. */
  statusMessages: string[];
  /** Fallback message when no stage events have arrived yet. */
  fallback: string;
}

/**
 * Status pill shown at the top of the streaming results surface.
 *
 * - Default: shows `stage.user_text` (e.g. "Locating Madrid").
 * - During the long ranking_days stage, rotates through the 4
 *   destination-specific micro-copy strings every 4s with a 200ms cross-fade.
 * - Falls back to `fallback` if no enriched events have arrived (older edge
 *   function deployment).
 */
export function StreamingStatusPill({ stage, statusMessages, fallback }: Props) {
  const isRanking = stage?.stage === "ranking_days" || stage?.stage === "ranking";
  const rotate = isRanking && statusMessages.length > 0;

  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!rotate) return;
    setIdx(0);
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % statusMessages.length);
        setVisible(true);
      }, 200);
    }, 4000);
    return () => clearInterval(interval);
  }, [rotate, statusMessages.length]);

  const text = rotate
    ? statusMessages[idx % statusMessages.length]
    : stage?.user_text || fallback;

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-[#0D9488]/25 shadow-sm">
      <Loader2 className="h-3.5 w-3.5 text-[#0D9488] animate-spin" />
      <span
        className="text-xs font-medium text-foreground transition-opacity duration-200"
        style={{ opacity: visible ? 1 : 0 }}
      >
        {text}
        {text.endsWith("…") || text.endsWith("...") ? "" : "..."}
      </span>
    </div>
  );
}

interface BarProps {
  /** 0–100. If null, the bar is hidden. */
  percent: number | null;
}

/**
 * Thin teal progress bar driven by stage_progress.percent_complete events.
 * Hidden if no events have arrived. Smooth 600ms ease-out transitions.
 */
export function StreamingProgressBar({ percent }: BarProps) {
  if (percent == null) return null;
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className="w-full h-[3px] rounded-full overflow-hidden"
      style={{ backgroundColor: "rgba(229, 231, 235, 0.3)" }}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${clamped}%`,
          backgroundColor: "#0D9488",
          transition: "width 600ms ease-out",
        }}
      />
    </div>
  );
}
