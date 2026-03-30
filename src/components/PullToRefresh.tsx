import { useRef, useState, useCallback, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

const THRESHOLD = 60;
const MAX_PULL = 100;

export function PullToRefresh({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (refreshing) return;
    // Only activate when scrolled to top
    if (window.scrollY > 0) return;
    startY.current = e.touches[0].clientY;
    pulling.current = true;
  }, [refreshing]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling.current || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta < 0) {
      pulling.current = false;
      setPullDistance(0);
      return;
    }
    // Rubber-band effect
    const distance = Math.min(delta * 0.5, MAX_PULL);
    setPullDistance(distance);
  }, [refreshing]);

  const onTouchEnd = useCallback(async () => {
    if (!pulling.current && pullDistance === 0) return;
    pulling.current = false;

    if (pullDistance >= THRESHOLD) {
      setRefreshing(true);
      setPullDistance(THRESHOLD);
      await queryClient.invalidateQueries();
      // Small delay so spinner is visible
      await new Promise((r) => setTimeout(r, 400));
      setRefreshing(false);
    }
    setPullDistance(0);
  }, [pullDistance, queryClient]);

  const showIndicator = pullDistance > 0 || refreshing;
  const indicatorOpacity = refreshing ? 1 : Math.min(pullDistance / THRESHOLD, 1);
  const indicatorScale = refreshing ? 1 : 0.5 + Math.min(pullDistance / THRESHOLD, 1) * 0.5;

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className="relative"
    >
      {/* Pull indicator */}
      {showIndicator && (
        <div
          className="flex items-center justify-center pointer-events-none"
          style={{
            height: refreshing ? THRESHOLD : pullDistance,
            transition: refreshing ? "none" : pulling.current ? "none" : "height 200ms ease-out",
          }}
        >
          <Loader2
            className="text-primary"
            style={{
              width: 22,
              height: 22,
              opacity: indicatorOpacity,
              transform: `scale(${indicatorScale})${refreshing ? "" : ` rotate(${pullDistance * 3}deg)`}`,
              transition: pulling.current ? "none" : "all 200ms ease-out",
              animation: refreshing ? "spin 0.8s linear infinite" : "none",
            }}
          />
        </div>
      )}
      {children}
    </div>
  );
}
