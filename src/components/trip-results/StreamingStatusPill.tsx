import { useEffect, useRef, useState } from "react";
import { Loader2, Check } from "lucide-react";

interface Props {
  /** Latest stage from edge function. user_text drives non-ranking stages. */
  stage: { stage: string; user_text: string; percent_complete: number } | null;
  /** Destination-specific rotating micro-copy. Used during ranking_days. */
  statusMessages: string[];
  /** Fallback message when no stage events have arrived yet. */
  fallback: string;
}

/**
 * Cinematic status pill shown at the top of the streaming results surface.
 *
 * - Default: shows `stage.user_text` (e.g. "Locating Madrid").
 * - During the long ranking_days stage, rotates through the destination-
 *   specific micro-copy strings (when 2+ provided) every 3.5s with a 250ms
 *   cross-fade. Rotation is anchored to a ref so component re-renders during
 *   streaming don't reset the cycle back to index 0.
 * - Falls back to `fallback` if no enriched events have arrived (older edge
 *   function deployment).
 */
export function StreamingStatusPill({ stage, statusMessages, fallback }: Props) {
  const isRanking = stage?.stage === "ranking_days" || stage?.stage === "ranking";
  const rotate = isRanking && statusMessages.length >= 2;

  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  // Track the last messages array identity we set up an interval for, so we
  // only reset the rotation on actual content change — not on every re-render
  // (parent re-renders during streaming would otherwise restart the cycle).
  const setupKeyRef = useRef<string>("");

  useEffect(() => {
    if (!rotate) {
      setupKeyRef.current = "";
      return;
    }
    const key = `${statusMessages.length}:${statusMessages[0] ?? ""}`;
    if (setupKeyRef.current === key) return;
    setupKeyRef.current = key;
    setIdx(0);
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % statusMessages.length);
        setVisible(true);
      }, 250);
    }, 3500);
    return () => clearInterval(interval);
  }, [rotate, statusMessages]);

  const text = rotate
    ? statusMessages[idx % statusMessages.length]
    : stage?.user_text || fallback;

  return (
    <div className="flex justify-center">
      <div
        className="inline-flex items-center gap-2.5 px-4 py-2.5 sm:px-5 sm:py-3 rounded-full shadow-md"
        style={{
          backgroundColor: "rgba(13, 148, 136, 0.12)",
          border: "1px solid rgba(13, 148, 136, 0.35)",
          backdropFilter: "blur(8px)",
        }}
      >
        <Loader2
          className="h-4 w-4 sm:h-5 sm:w-5 text-[#0D9488] animate-spin"
          style={{ animation: "spin 1s linear infinite, statusPillPulse 2s ease-in-out infinite" }}
        />
        <span
          className="text-sm sm:text-base font-semibold text-[#0F766E] transition-opacity duration-250"
          style={{ opacity: visible ? 1 : 0 }}
        >
          {text}
          {text.endsWith("…") || text.endsWith("...") ? "" : "..."}
        </span>
      </div>
      <style>{`
        @keyframes statusPillPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
      `}</style>
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

interface LadderProps {
  /** Total number of days in the trip skeleton. */
  totalDays: number;
  /** day_numbers (1-indexed) that have completed. */
  completedDays: number[];
}

/**
 * Horizontal "progress ladder" of pills, one per day. Filled = complete,
 * pulsing = currently being generated (next after the last completed),
 * empty = not yet started. Gives users a clear "I'm on day 2 of 5" sense
 * throughout generation.
 */
export function StreamingProgressLadder({ totalDays, completedDays }: LadderProps) {
  if (totalDays <= 0) return null;
  const completedSet = new Set(completedDays);
  // Current = lowest day_number not yet in completed set.
  let current = 0;
  for (let n = 1; n <= totalDays; n++) {
    if (!completedSet.has(n)) {
      current = n;
      break;
    }
  }
  return (
    <div className="flex flex-wrap justify-center gap-1.5 px-2">
      {Array.from({ length: totalDays }, (_, i) => i + 1).map((n) => {
        const isDone = completedSet.has(n);
        const isCurrent = n === current;
        return (
          <div
            key={n}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-mono font-semibold transition-all"
            style={{
              backgroundColor: isDone
                ? "rgba(13, 148, 136, 0.18)"
                : isCurrent
                ? "rgba(13, 148, 136, 0.10)"
                : "rgba(229, 231, 235, 0.4)",
              border: isDone
                ? "1px solid rgba(13, 148, 136, 0.45)"
                : isCurrent
                ? "1px solid rgba(13, 148, 136, 0.35)"
                : "1px solid rgba(229, 231, 235, 0.6)",
              color: isDone || isCurrent ? "#0F766E" : "#9CA3AF",
              boxShadow: isDone ? "0 0 8px rgba(13, 148, 136, 0.25)" : undefined,
              animation: isCurrent ? "ladderPulse 1.4s ease-in-out infinite" : undefined,
            }}
            aria-label={isDone ? `Day ${n} complete` : isCurrent ? `Day ${n} generating` : `Day ${n} pending`}
          >
            {isDone ? (
              <Check className="h-3 w-3" strokeWidth={3} />
            ) : isCurrent ? (
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: "#0D9488" }}
              />
            ) : (
              <span
                className="inline-block h-1.5 w-1.5 rounded-full border"
                style={{ borderColor: "#9CA3AF" }}
              />
            )}
            <span>Day {n}</span>
          </div>
        );
      })}
      <style>{`
        @keyframes ladderPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
      `}</style>
    </div>
  );
}
