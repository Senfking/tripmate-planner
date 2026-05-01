import { useEffect, useState, useCallback, useRef } from "react";
import { Plane, Bed, Wallet, MapPin, Package } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

interface TimelineNode {
  id: string;
  icon?: React.ElementType;
  label: string;
  sublabel?: string;
  minor?: boolean;
}

interface Props {
  nodes: TimelineNode[];
  compact?: boolean;
}

export function buildTimelineNodes(
  destinations: { name: string; start_date: string; end_date: string; accommodation?: { name?: string; title?: string } }[],
  allDays: { day_number: number; date: string }[],
  hasPacking: boolean
): TimelineNode[] {
  const nodes: TimelineNode[] = [];
  const seenNodeIds = new Set<string>();

  const pushNode = (node: TimelineNode) => {
    if (seenNodeIds.has(node.id)) return;
    seenNodeIds.add(node.id);
    nodes.push(node);
  };

  pushNode({ id: "section-flights", icon: Plane, label: "Flights" });

  const hasAccommodation = destinations.some((d) => d.accommodation);
  if (hasAccommodation) {
    pushNode({ id: "section-stays-overview", icon: Bed, label: "Stays" });
  }

  pushNode({ id: "section-budget", icon: Wallet, label: "Budget" });

  for (const dest of destinations) {
    pushNode({ id: `section-dest-${dest.name}`, icon: MapPin, label: dest.name });
    const destDays = allDays.filter((d) => d.date >= dest.start_date && d.date <= dest.end_date);
    for (const day of destDays) {
      pushNode({ id: `section-day-${day.day_number}`, label: `Day ${day.day_number}`, minor: true });
    }
  }

  if (hasPacking) {
    pushNode({ id: "section-packing", icon: Package, label: "Packing" });
  }

  return nodes;
}

export function ResultsTimeline({ nodes, compact = false }: Props) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [activeId, setActiveId] = useState<string | null>(null);
  const isClickScrolling = useRef(false);
  const activeIdRef = useRef(activeId);
  const scrollTimeoutRef = useRef<number>();
  activeIdRef.current = activeId;

  const getScrollRoot = useCallback(() => {
    return document.querySelector<HTMLElement>("[data-results-scroll-root='true']") ?? document.documentElement;
  }, []);

  const getHeaderOffset = useCallback(() => {
    const header = document.querySelector<HTMLElement>("[data-results-header='true']");
    return (header?.getBoundingClientRect().height ?? 0) + 12;
  }, []);

  useEffect(() => {
    if (!isDesktop) return;

    const nodeIds = nodes.map((n) => n.id);
    const scrollRoot = getScrollRoot();

    const findTopmost = () => {
      if (isClickScrolling.current) return;

      const rootRect = scrollRoot.getBoundingClientRect();
      const topBoundary = rootRect.top + getHeaderOffset();
      let bestId: string | null = null;
      let bestDistance = Infinity;

      // Find the single node whose top edge is closest to (but not far below) the header boundary
      for (const id of nodeIds) {
        const el = document.getElementById(id);
        if (!el) continue;

        const rect = el.getBoundingClientRect();
        // Distance from topBoundary — negative means section has scrolled past
        const dist = rect.top - topBoundary;

        // Prefer sections that have been scrolled past (dist <= 0) — pick the closest one
        // If none have been scrolled past, pick the nearest upcoming one
        const absDist = dist <= 0 ? -dist : dist + 10000; // heavily prefer passed sections
        if (absDist < bestDistance) {
          bestDistance = absDist;
          bestId = id;
        }
      }

      const nextActiveId = bestId ?? nodeIds[0] ?? null;
      if (nextActiveId && nextActiveId !== activeIdRef.current) {
        setActiveId(nextActiveId);
      }
    };

    scrollRoot.addEventListener("scroll", findTopmost, { passive: true });
    window.addEventListener("resize", findTopmost);
    findTopmost();

    return () => {
      scrollRoot.removeEventListener("scroll", findTopmost);
      window.removeEventListener("resize", findTopmost);
    };
  }, [nodes, isDesktop, getHeaderOffset, getScrollRoot]);

  const scrollTo = useCallback(
    (id: string) => {
      const el = document.getElementById(id);
      if (!el) return;

      const scrollRoot = getScrollRoot();
      const rootRect = scrollRoot.getBoundingClientRect();
      const elementRect = el.getBoundingClientRect();
      const targetTop = Math.max(0, scrollRoot.scrollTop + (elementRect.top - rootRect.top) - getHeaderOffset());

      setActiveId(id);
      isClickScrolling.current = true;

      window.clearTimeout(scrollTimeoutRef.current);
      scrollRoot.scrollTo({ top: targetTop, behavior: "smooth" });

      scrollTimeoutRef.current = window.setTimeout(() => {
        isClickScrolling.current = false;
      }, 700);
    },
    [getHeaderOffset, getScrollRoot]
  );

  useEffect(() => {
    return () => window.clearTimeout(scrollTimeoutRef.current);
  }, []);

  if (!isDesktop) return null;

  return (
    <div
      className={compact
        ? "fixed left-3 top-[calc(42vh+72px)] bottom-[72px] w-10 z-40 flex flex-col items-center overflow-visible scrollbar-none"
        : "fixed left-[max(12px,calc(50%-420px))] top-[calc(42vh+72px)] bottom-[72px] w-[56px] z-40 flex flex-col items-center overflow-visible scrollbar-none"}
    >
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-primary/15 -translate-x-1/2" />

      <div className="relative flex flex-col justify-between items-center overflow-visible h-full py-2">
        {nodes.map((node) => {
          const Icon = node.icon;
          const isActive = activeId === node.id;

          if (node.minor) {
            return (
              <button
                key={node.id}
                onClick={() => scrollTo(node.id)}
                className="group relative flex items-center justify-center z-10 overflow-visible"
                title={node.label}
              >
                <div
                  className={isActive
                    ? compact
                      ? "w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.45)] transition-all duration-300"
                      : "w-3 h-3 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.45)] transition-all duration-300"
                    : compact
                      ? "w-1.5 h-1.5 rounded-full bg-primary/25 group-hover:bg-primary/50 transition-all duration-300"
                      : "w-1.5 h-1.5 rounded-full bg-primary/25 group-hover:bg-primary/50 transition-all duration-300"}
                />
                {!compact && (
                  <span
                    className={isActive
                      ? "absolute left-full ml-3 text-[10px] font-medium whitespace-nowrap transition-all duration-200 pointer-events-none opacity-100 text-primary"
                      : "absolute left-full ml-3 text-[10px] font-medium whitespace-nowrap transition-all duration-200 pointer-events-none opacity-0 group-hover:opacity-100 text-muted-foreground/70"}
                  >
                    {node.label}
                  </span>
                )}
              </button>
            );
          }

          return (
            <button
              key={node.id}
              onClick={() => scrollTo(node.id)}
              className="group relative flex items-center justify-center z-10 overflow-visible"
              title={node.sublabel ? `${node.label}: ${node.sublabel}` : node.label}
            >
              <div
                className={isActive
                  ? compact
                    ? "w-7 h-7 rounded-full flex items-center justify-center bg-primary text-primary-foreground shadow-[0_0_16px_hsl(var(--primary)/0.35)] scale-105 transition-all duration-300"
                    : "w-8 h-8 rounded-full flex items-center justify-center bg-primary text-primary-foreground shadow-[0_0_16px_hsl(var(--primary)/0.35)] scale-105 transition-all duration-300"
                  : compact
                    ? "w-7 h-7 rounded-full flex items-center justify-center bg-background border border-primary/20 text-primary/40 group-hover:border-primary/40 group-hover:text-primary/70 transition-all duration-300"
                    : "w-8 h-8 rounded-full flex items-center justify-center bg-background border border-primary/20 text-primary/40 group-hover:border-primary/40 group-hover:text-primary/70 transition-all duration-300"}
              >
                {Icon && <Icon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} strokeWidth={isActive ? 2.5 : 1.5} />}
              </div>
              {!compact && (
                <span
                  className={isActive
                    ? "absolute left-full ml-3 text-[10px] font-semibold whitespace-nowrap transition-all duration-200 pointer-events-none opacity-100 text-primary"
                    : "absolute left-full ml-3 text-[10px] font-semibold whitespace-nowrap transition-all duration-200 pointer-events-none opacity-0 group-hover:opacity-100 text-muted-foreground/70"}
                >
                  {node.label}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
