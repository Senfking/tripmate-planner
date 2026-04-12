import { useEffect, useState, useCallback } from "react";
import { Plane, Bed, Wallet, MapPin, CalendarDays, Package } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

interface TimelineNode {
  id: string;
  icon?: React.ElementType;
  label: string;
  sublabel?: string;
  /** Minor nodes render as small dots instead of full circles */
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

  // Only one "Stay" node (not per-destination)
  const hasAccommodation = destinations.some(d => d.accommodation);
  if (hasAccommodation) {
    nodes.push({ id: `section-stay-${destinations[0]?.name}`, icon: Bed, label: "Stay" });
  }

  nodes.push({ id: "section-budget", icon: Wallet, label: "Budget" });

  for (const dest of destinations) {
    nodes.push({ id: `section-dest-${dest.name}`, icon: MapPin, label: dest.name });
    const destDays = allDays.filter(d => d.date >= dest.start_date && d.date <= dest.end_date);
    for (const day of destDays) {
      nodes.push({ id: `section-day-${day.day_number}`, label: `D${day.day_number}`, minor: true });
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

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0 }
    );

    for (const node of nodes) {
      const el = document.getElementById(node.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [nodes]);

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (!isDesktop) return null;

  return (
    <div className="fixed left-[max(12px,calc(50%-420px))] top-[72px] bottom-[72px] w-[48px] z-40 flex flex-col items-center py-6 overflow-y-auto scrollbar-none">
      {/* Thin vertical line */}
      <div className="absolute left-1/2 top-4 bottom-4 w-px bg-[#0D9488]/15 -translate-x-1/2" />

      <div className="relative flex flex-col gap-0.5 items-center">
        {nodes.map((node) => {
          const Icon = node.icon;
          const isActive = activeId === node.id;

          if (node.minor) {
            // Day dots — minimal small circles
            return (
              <button
                key={node.id}
                onClick={() => scrollTo(node.id)}
                className="group relative flex items-center justify-center py-1 z-10"
                title={node.label}
              >
                <div
                  className={`rounded-full transition-all duration-300 ${
                    isActive
                      ? "w-2.5 h-2.5 bg-[#0D9488] shadow-[0_0_8px_rgba(13,148,136,0.4)]"
                      : "w-1.5 h-1.5 bg-[#0D9488]/25 group-hover:bg-[#0D9488]/50"
                  }`}
                />
                {/* Label appears on hover or active */}
                <span
                  className={`absolute left-full ml-2 text-[10px] font-medium whitespace-nowrap transition-all duration-200 ${
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

          // Major section nodes
          return (
            <button
              key={node.id}
              onClick={() => scrollTo(node.id)}
              className="group relative flex items-center justify-center py-2 z-10"
              title={node.sublabel ? `${node.label}: ${node.sublabel}` : node.label}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isActive
                    ? "bg-[#0D9488] text-white shadow-[0_0_16px_rgba(13,148,136,0.35)] scale-105"
                    : "bg-background border border-[#0D9488]/20 text-[#0D9488]/40 group-hover:border-[#0D9488]/40 group-hover:text-[#0D9488]/70"
                }`}
              >
                {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={isActive ? 2.5 : 1.5} />}
              </div>
              {/* Label appears on hover or active */}
              <span
                className={`absolute left-full ml-2 text-[10px] font-semibold whitespace-nowrap transition-all duration-200 ${
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
