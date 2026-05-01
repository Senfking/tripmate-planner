import { useRef, useState, useCallback, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { ensureFreshSession } from "@/lib/sessionRefresh";

const THRESHOLD = 64;
const MAX_PULL = 120;

export function PullToRefresh({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const location = useLocation();
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
      // Pre-flight an auth refresh BEFORE refetching. Without this, the
      // refetch fires with whatever JWT is in memory — on iOS PWA returns
      // (and even on regular tab-switches that didn't trigger a refresh
      // yet), that token can be expired and the request silently returns
      // empty/401, leaving the user with the same stale UI they pulled to
      // refresh. ensureFreshSession dedupes via the inFlight promise, so if
      // AuthContext's focus/visibility/pageshow listener already kicked
      // off a refresh, we just await it.
      await ensureFreshSession();

      // Scope refetch to the current route instead of nuking everything.
      // Use refetchQueries (not invalidateQueries) so refetches happen
      // unconditionally — invalidate is gated by observer status; refetch
      // forces it. Without this, queries that briefly lose their observer
      // (e.g. modal-driven remounts) skip the refresh entirely.
      const tripMatch = location.pathname.match(/\/app\/trips\/([^/]+)/);
      const tripId = tripMatch?.[1] !== "new" ? tripMatch?.[1] : undefined;
      if (tripId) {
        // On a trip page: refetch queries whose key contains the tripId
        await queryClient.refetchQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) && query.queryKey.includes(tripId),
          type: "active",
        });
      } else {
        // On global pages: refetch global + list queries
        await queryClient.refetchQueries({
          predicate: (query) => {
            const k = query.queryKey;
            if (!Array.isArray(k) || typeof k[0] !== "string") return false;
            return k[0].startsWith("global-") || k[0] === "trips";
          },
          type: "active",
        });
      }
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
      {/* Floating spinner overlay - doesn't push content */}
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
