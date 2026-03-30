import { useRef, useState, useCallback, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

const THRESHOLD = 64;
const MAX_PULL = 120;

export function PullToRefresh({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);
  const startYRef = useRef(0);
  const activeRef = useRef(false);
  const indicatorRef = useRef<HTMLDivElement>(null);

  const updateIndicator = useCallback((distance: number) => {
    const el = indicatorRef.current;
    if (!el) return;
    const progress = Math.min(distance / THRESHOLD, 1);
    const scale = 0.4 + progress * 0.6;
    const rotation = distance * 4;
    el.style.transform = `translateY(${distance - 40}px) scale(${scale}) rotate(${rotation}deg)`;
    el.style.opacity = String(progress);
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (refreshing || window.scrollY > 0) return;
    startYRef.current = e.touches[0].clientY;
    activeRef.current = true;
  }, [refreshing]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!activeRef.current || refreshing) return;
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta < 0) {
      activeRef.current = false;
      pullRef.current = 0;
      updateIndicator(0);
      return;
    }
    // Rubber-band damping
    const distance = Math.min(delta * 0.4, MAX_PULL);
    pullRef.current = distance;
    updateIndicator(distance);
  }, [refreshing, updateIndicator]);

  const onTouchEnd = useCallback(async () => {
    if (!activeRef.current && pullRef.current === 0) return;
    const distance = pullRef.current;
    activeRef.current = false;
    pullRef.current = 0;

    if (distance >= THRESHOLD) {
      setRefreshing(true);
      // Animate to resting position
      const el = indicatorRef.current;
      if (el) {
        el.style.transition = "transform 200ms ease-out";
        el.style.transform = "translateY(20px) scale(1) rotate(0deg)";
        el.style.opacity = "1";
      }
      await queryClient.invalidateQueries();
      await new Promise((r) => setTimeout(r, 300));
      setRefreshing(false);
      if (el) {
        el.style.transition = "all 200ms ease-out";
        el.style.transform = "translateY(-40px) scale(0.4) rotate(0deg)";
        el.style.opacity = "0";
        setTimeout(() => { el.style.transition = "none"; }, 200);
      }
    } else {
      // Snap back
      const el = indicatorRef.current;
      if (el) {
        el.style.transition = "all 200ms ease-out";
        el.style.transform = "translateY(-40px) scale(0.4) rotate(0deg)";
        el.style.opacity = "0";
        setTimeout(() => { el.style.transition = "none"; }, 200);
      }
    }
  }, [queryClient]);

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className="relative"
    >
      {/* Floating spinner overlay — doesn't push content */}
      <div
        ref={indicatorRef}
        className="absolute left-1/2 z-50 -ml-5 pointer-events-none"
        style={{
          top: 0,
          width: 40,
          height: 40,
          opacity: 0,
          transform: "translateY(-40px) scale(0.4) rotate(0deg)",
          willChange: "transform, opacity",
        }}
      >
        <div className="flex h-full w-full items-center justify-center rounded-full bg-white shadow-lg border border-border">
          <Loader2
            className="h-5 w-5 text-primary"
            style={{
              animation: refreshing ? "spin 0.7s linear infinite" : "none",
            }}
          />
        </div>
      </div>
      {children}
    </div>
  );
}
