import { useEffect, useState, type ReactNode } from "react";

interface Props {
  /** When true, render with a brief teal-ring flash + content fade-in/slide.
   *  Triggered the first time the consumer flips this true (e.g. when a
   *  day_complete event lands for this day's day_number). */
  justCompleted: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Wraps a day card. When `justCompleted` flips from false to true, the wrapper
 * fades+lifts its content (400ms) and flashes a teal ring (600ms) before
 * settling. Subsequent renders are pass-through — no replay on prop churn.
 */
export function DayCardReveal({ justCompleted, children, className }: Props) {
  const [hasAnimated, setHasAnimated] = useState(false);
  const [showRing, setShowRing] = useState(false);

  useEffect(() => {
    if (!justCompleted || hasAnimated) return;
    setHasAnimated(true);
    setShowRing(true);
    const t = setTimeout(() => setShowRing(false), 600);
    return () => clearTimeout(t);
  }, [justCompleted, hasAnimated]);

  const animate = justCompleted && hasAnimated;

  return (
    <div
      className={className}
      style={{
        animation: animate ? "dayCardReveal 400ms ease-out both" : undefined,
        boxShadow: showRing ? "0 0 0 2px rgba(13,148,136,0.6)" : undefined,
        borderRadius: showRing ? 16 : undefined,
        transition: "box-shadow 600ms ease-out",
      }}
    >
      {children}
    </div>
  );
}
