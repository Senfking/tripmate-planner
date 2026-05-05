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
 * Cinematic, glassmorphic status pill shown at the top of the streaming
 * results surface. See StreamingProgressLadder for state-pill details.
 */
export function StreamingStatusPill({ stage, statusMessages, fallback }: Props) {
  const isRanking = stage?.stage === "ranking_days" || stage?.stage === "ranking";
  const rotate = isRanking && statusMessages.length >= 2;

  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
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
        className="inline-flex items-center gap-2.5 px-4 py-2.5 sm:px-5 sm:py-3 rounded-full border backdrop-blur-xl backdrop-saturate-150"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.78)",
          borderColor: "rgba(13, 148, 136, 0.35)",
          boxShadow:
            "0 10px 28px rgba(13,148,136,0.22), 0 2px 6px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
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
 * Horizontal "progress ladder" of glassmorphic pills, one per day.
 * Filled = complete, pulsing = currently being generated, empty = not started.
 * Auto-scrolls the current pill into view; long trips scroll horizontally
 * with fade edges instead of wrapping.
 */
export function StreamingProgressLadder({ totalDays, completedDays }: LadderProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);

  const completedSet = new Set(completedDays);
  let current = 0;
  for (let n = 1; n <= totalDays; n++) {
    if (!completedSet.has(n)) {
      current = n;
      break;
    }
  }

  // Auto-scroll the current pill into view as it progresses.
  useEffect(() => {
    if (!currentRef.current || !scrollRef.current) return;
    currentRef.current.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [current]);

  if (totalDays <= 0) return null;

  return (
    <div className="relative w-full">
      <div
        ref={scrollRef}
        className="flex items-center gap-1.5 overflow-x-auto px-4 py-1 scrollbar-none justify-start sm:justify-center"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {Array.from({ length: totalDays }, (_, i) => i + 1).map((n) => {
          const isDone = completedSet.has(n);
          const isCurrent = n === current;
          const refProp = isCurrent ? { ref: currentRef } : {};
          return (
            <div
              key={n}
              {...refProp}
              className="inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold transition-all duration-300 backdrop-blur-md border"
              style={{
                backgroundColor: isDone
                  ? "rgba(13, 148, 136, 0.18)"
                  : isCurrent
                  ? "rgba(13, 148, 136, 0.28)"
                  : "rgba(255, 255, 255, 0.35)",
                borderColor: isDone
                  ? "rgba(13, 148, 136, 0.45)"
                  : isCurrent
                  ? "rgba(13, 148, 136, 0.55)"
                  : "rgba(255, 255, 255, 0.6)",
                color: isDone || isCurrent ? "#0F766E" : "#9CA3AF",
                boxShadow: isDone
                  ? "0 4px 12px rgba(13,148,136,0.18), inset 0 1px 0 rgba(255,255,255,0.45)"
                  : isCurrent
                  ? "0 6px 18px rgba(13,148,136,0.28), 0 0 0 3px rgba(13,148,136,0.12), inset 0 1px 0 rgba(255,255,255,0.55)"
                  : "inset 0 1px 0 rgba(255,255,255,0.55)",
                transform: isCurrent ? "scale(1.05)" : "scale(1)",
                animation: isCurrent ? "ladderPulse 1.6s ease-in-out infinite" : undefined,
              }}
              aria-label={
                isDone ? `Day ${n} complete` : isCurrent ? `Day ${n} generating` : `Day ${n} pending`
              }
            >
              {isDone ? (
                <span
                  className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full"
                  style={{ backgroundColor: "#0D9488" }}
                >
                  <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
                </span>
              ) : isCurrent ? (
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{
                    backgroundColor: "#0D9488",
                    boxShadow: "0 0 8px rgba(13,148,136,0.7)",
                    animation: "dotPulse 1.2s ease-in-out infinite",
                  }}
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
      </div>
      <style>{`
        @keyframes ladderPulse {
          0%, 100% { transform: scale(1.05); }
          50% { transform: scale(1.09); }
        }
        @keyframes dotPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.3); }
        }
        .scrollbar-none::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
