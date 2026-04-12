import { useEffect, useState, useCallback, useRef } from "react";
import { Plane, Bed, Wallet, MapPin, CalendarDays, Package } from "lucide-react";
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
}

export function buildTimelineNodes(
  destinations: { name: string; start_date: string; end_date: string; accommodation?: { name: string } }[],
  allDays: { day_number: number; date: string }[],
  hasPacking: boolean
): TimelineNode[] {
  const nodes: TimelineNode[] = [];

  nodes.push({ id: "section-flights", icon: Plane, label: "Flights" });

  const hasAccommodation = destinations.some(d => d.accommodation);
  if (hasAccommodation) {
    nodes.push({ id: `section-stay-${destinations[0]?.name}`, icon: Bed, label: "Stay" });
  }

  nodes.push({ id: "section-budget", icon: Wallet, label: "Budget" });

  for (const dest of destinations) {
    nodes.push({ id: `section-dest-${dest.name}`, icon: MapPin, label: dest.name });
    const destDays = allDays.filter(d => d.date >= dest.start_date && d.date <= dest.end_date);
    for (const day of destDays) {
      nodes.push({ id: `section-day-${day.day_number}`, label: `Day ${day.day_number}`, minor: true });
    }
  }

  if (hasPacking) {
    nodes.push({ id: "section-packing", icon: Package, label: "Packing" });
  }

  return nodes;
}

export function ResultsTimeline({ nodes }: Props) {
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

    const nodeIds = nodes.map(n => n.id);
    const scrollRoot = getScrollRoot();

    const findTopmost = () => {
      if (isClickScrolling.current) return;

      const rootRect = scrollRoot.getBoundingClientRect();
      const topBoundary = rootRect.top + getHeaderOffset();
      const bottomBoundary = rootRect.bottom - 24;
      let passedId: string | null = null;
      let passedTop = -Infinity;
      let upcomingId: string | null = null;
      let upcomingTop = Infinity;

      for (const id of nodeIds) {
        const el = document.getElementById(id);
        if (!el) continue;

        const rect = el.getBoundingClientRect();
        if (rect.bottom <= topBoundary || rect.top >= bottomBoundary) continue;

        if (rect.top <= topBoundary) {
          if (rect.top > passedTop) {
            passedTop = rect.top;
            passedId = id;
          }
        } else if (rect.top < upcomingTop) {
          upcomingTop = rect.top;
          upcomingId = id;
        }
      }

      const nextActiveId = passedId ?? upcomingId ?? nodeIds[0] ?? null;
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

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;

    const scrollRoot = getScrollRoot();
    const rootRect = scrollRoot.getBoundingClientRect();
    const elementRect = el.getBoundingClientRect();
    const targetTop = Math.max(
      0,
      scrollRoot.scrollTop + (elementRect.top - rootRect.top) - getHeaderOffset()
    );

    setActiveId(id);
    isClickScrolling.current = true;

    window.clearTimeout(scrollTimeoutRef.current);

    scrollRoot.scrollTo({ top: targetTop, behavior: "smooth" });

    scrollTimeoutRef.current = window.setTimeout(() => {
      isClickScrolling.current = false;
    }, 700);
  }, [getHeaderOffset, getScrollRoot]);

  useEffect(() => {
    return () => window.clearTimeout(scrollTimeoutRef.current);
  }, []);

  if (!isDesktop) return null;

  return (
    <div className="fixed left-[max(12px,calc(50%-420px))] top-[72px] bottom-[72px] w-[56px] z-40 flex flex-col items-center overflow-visible scrollbar-none">
      {/* Thin vertical line */}
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#0D9488]/15 -translate-x-1/2" />

      {/* Spread nodes across the full height with justify-between */}
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
                  className={`rounded-full transition-all duration-300 overflow-visible ${
                    isActive
                      ? "w-3 h-3 bg-[#0D9488] shadow-[0_0_10px_rgba(13,148,136,0.5)]"
                      : "w-1.5 h-1.5 bg-[#0D9488]/25 group-hover:bg-[#0D9488]/50"
                  }`}
                />
                <span
                  className={`absolute left-full ml-3 text-[10px] font-medium whitespace-nowrap transition-all duration-200 pointer-events-none ${
                    isActive
                      ? "opacity-100 text-[#0D9488]"
                      : "opacity-0 group-hover:opacity-100 text-muted-foreground/70"
                  }`}
                >
                  {node.label}
                </span>
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
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 overflow-visible ${
                  isActive
                    ? "bg-[#0D9488] text-white shadow-[0_0_16px_rgba(13,148,136,0.35)] scale-105"
                    : "bg-background border border-[#0D9488]/20 text-[#0D9488]/40 group-hover:border-[#0D9488]/40 group-hover:text-[#0D9488]/70"
                }`}
              >
                {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={isActive ? 2.5 : 1.5} />}
              </div>
              <span
                className={`absolute left-full ml-3 text-[10px] font-semibold whitespace-nowrap transition-all duration-200 pointer-events-none ${
                  isActive
                    ? "opacity-100 text-[#0D9488]"
                    : "opacity-0 group-hover:opacity-100 text-muted-foreground/70"
                }`}
              >
                {node.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
