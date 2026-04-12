import { useEffect, useState, useCallback, useRef } from "react";
import { Plane, Bed, Wallet, MapPin, CalendarDays, Package } from "lucide-react";

export interface TimelineNode {
  id: string;
  icon: React.ElementType;
  label: string;
  sublabel?: string;
}

export function buildTimelineNodes(
  destinations: { name: string; start_date: string; end_date: string; accommodation?: { name: string } }[],
  allDays: { day_number: number; date: string }[],
  hasPacking: boolean
): TimelineNode[] {
  const nodes: TimelineNode[] = [];

  // Flights
  nodes.push({ id: "section-flights", icon: Plane, label: "Flights" });

  // Per destination accommodation
  for (const dest of destinations) {
    if (dest.accommodation) {
      nodes.push({ id: `section-stay-${dest.name}`, icon: Bed, label: "Stay", sublabel: dest.accommodation.name });
    }
  }

  // Budget
  nodes.push({ id: "section-budget", icon: Wallet, label: "Budget" });

  // Destinations + days
  for (const dest of destinations) {
    nodes.push({ id: `section-dest-${dest.name}`, icon: MapPin, label: dest.name });
    const destDays = allDays.filter(d => d.date >= dest.start_date && d.date <= dest.end_date);
    for (const day of destDays) {
      nodes.push({ id: `section-day-${day.day_number}`, icon: CalendarDays, label: `D${day.day_number}` });
    }
  }

  // Packing
  if (hasPacking) {
    nodes.push({ id: "section-packing", icon: Package, label: "Packing" });
  }

  return nodes;
}

interface Props {
  nodes: TimelineNode[];
  scrollContainer: React.RefObject<HTMLElement | null>;
}

export function ResultsTimeline({ nodes, scrollContainer }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const root = scrollContainer.current;
    if (!root) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { root, rootMargin: "-10% 0px -70% 0px", threshold: 0 }
    );

    for (const node of nodes) {
      const el = document.getElementById(node.id);
      if (el) observerRef.current.observe(el);
    }

    return () => observerRef.current?.disconnect();
  }, [nodes, scrollContainer]);

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="hidden md:flex w-[70px] flex-shrink-0 sticky top-0 self-start h-screen flex-col items-center py-16 overflow-y-auto scrollbar-none">
      {/* Vertical line */}
      <div className="absolute left-1/2 top-12 bottom-12 w-[2px] bg-[#0D9488]/20 -translate-x-1/2" />

      <div className="relative flex flex-col gap-0.5 items-center">
        {nodes.map((node) => {
          const Icon = node.icon;
          const isActive = activeId === node.id;
          return (
            <button
              key={node.id}
              onClick={() => scrollTo(node.id)}
              className="group relative flex flex-col items-center py-1 z-10"
              title={node.sublabel ? `${node.label}: ${node.sublabel}` : node.label}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all border-2 ${
                  isActive
                    ? "bg-[#0D9488] border-[#0D9488] text-white scale-110 shadow-md"
                    : "bg-background border-[#0D9488]/30 text-[#0D9488]/50 hover:border-[#0D9488]/60 hover:text-[#0D9488]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>
              <span
                className={`text-[8px] mt-0.5 font-semibold leading-tight text-center max-w-[60px] truncate transition-colors ${
                  isActive ? "text-[#0D9488]" : "text-muted-foreground/50"
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
