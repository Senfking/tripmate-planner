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

  const isMultiDestination = destinations.length > 1;
  const hasAccommodation = destinations.some((d) => d.accommodation);
  // Standalone "Stays" overview only renders for multi-destination trips
  if (isMultiDestination && hasAccommodation) {
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

  // Returns whichever element is the actual scroller. The results view used
  // to scroll inside [data-results-scroll-root]; now (for screenshot/extension
  // compatibility) document scroll is the default and the inner element only
  // becomes scrollable when the map side panel is open. Detect that at call
  // time so the same code works in both states.
  const getScrollRoot = useCallback((): HTMLElement => {
    const marked = document.querySelector<HTMLElement>("[data-results-scroll-root='true']");
    if (marked && marked.scrollHeight > marked.clientHeight + 1) return marked;
    return document.scrollingElement as HTMLElement ?? document.documentElement;
  }, []);

  const getHeaderOffset = useCallback(() => {
    const header = document.querySelector<HTMLElement>("[data-results-header='true']");
    return (header?.getBoundingClientRect().height ?? 0) + 12;
  }, []);

  useEffect(() => {
    if (!isDesktop) return;

    const nodeIds = nodes.map((n) => n.id);

    const findTopmost = () => {
      if (isClickScrolling.current) return;

      const topBoundary = getHeaderOffset();
      let bestId: string | null = null;
      let bestDistance = Infinity;

      // Use viewport-relative coordinates — works whether document or an
      // inner element is the scroller, since getBoundingClientRect is always
      // relative to the viewport.
      for (const id of nodeIds) {
        const el = document.getElementById(id);
        if (!el) continue;

        const rect = el.getBoundingClientRect();
        const dist = rect.top - topBoundary;

        const absDist = dist <= 0 ? -dist : dist + 10000;
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

    // Listen on both window (document scroll) and the marked inner element
    // (when map panel is open and inner scroll is active). One of them is the
    // active scroller at any given time; the other is a no-op.
    const marked = document.querySelector<HTMLElement>("[data-results-scroll-root='true']");
    window.addEventListener("scroll", findTopmost, { passive: true });
    marked?.addEventListener("scroll", findTopmost, { passive: true });
    window.addEventListener("resize", findTopmost);
    findTopmost();

    return () => {
      window.removeEventListener("scroll", findTopmost);
      marked?.removeEventListener("scroll", findTopmost);
      window.removeEventListener("resize", findTopmost);
    };
  }, [nodes, isDesktop, getHeaderOffset]);

  const scrollTo = useCallback(
    (id: string) => {
      const el = document.getElementById(id);
      if (!el) return;

      const scrollRoot = getScrollRoot();
      const isDocument =
        scrollRoot === document.documentElement || scrollRoot === document.body;
      const elementRect = el.getBoundingClientRect();
      const currentTop = isDocument ? window.scrollY : scrollRoot.scrollTop;
      const rootTop = isDocument ? 0 : scrollRoot.getBoundingClientRect().top;
      const targetTop = Math.max(0, currentTop + (elementRect.top - rootTop) - getHeaderOffset());

      setActiveId(id);
      isClickScrolling.current = true;

      window.clearTimeout(scrollTimeoutRef.current);
      if (isDocument) {
        window.scrollTo({ top: targetTop, behavior: "smooth" });
      } else {
        scrollRoot.scrollTo({ top: targetTop, behavior: "smooth" });
      }

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
      style={{ top: topOffset }}
      className={compact
        ? "fixed left-3 bottom-[72px] w-10 z-40 flex flex-col items-center overflow-visible scrollbar-none transition-[top] duration-150"
        : "fixed left-[max(12px,calc(50%-420px))] bottom-[72px] w-[56px] z-40 flex flex-col items-center overflow-visible scrollbar-none transition-[top] duration-150"}
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
