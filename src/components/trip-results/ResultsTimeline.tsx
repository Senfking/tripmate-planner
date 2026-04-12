import { useEffect, useState, useCallback } from "react";
import { Plane, Bed, Wallet, MapPin, CalendarDays, Package } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

interface TimelineNode {
  id: string;
  icon: React.ElementType;
  label: string;
  sublabel?: string;
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

  // Flights
  nodes.push({ id: "section-flights", icon: Plane, label: "Flights" });

  // Per destination
  for (const dest of destinations) {
    if (dest.accommodation) {
      nodes.push({ id: `section-stay-${dest.name}`, icon: Bed, label: "Stay", sublabel: dest.accommodation.name });
    }
  }

  // Budget (only once)
  nodes.push({ id: "section-budget", icon: Wallet, label: "Budget" });

  // Destination + days
  for (const dest of destinations) {
    nodes.push({ id: `section-dest-${dest.name}`, icon: MapPin, label: dest.name });
    const destDays = allDays.filter(d => d.date >= dest.start_date && d.date <= dest.end_date);
    for (const day of destDays) {
      nodes.push({ id: `section-day-${day.day_number}`, icon: CalendarDays, label: `Day ${day.day_number}` });
    }
  }

  // Packing
  if (hasPacking) {
    nodes.push({ id: "section-packing", icon: Package, label: "Packing" });
  }

  return nodes;
}

export function ResultsTimeline({ nodes }: Props) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [activeId, setActiveId] = useState<string | null>(null);

  // Track which section is in view
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
    <div className="fixed left-[max(0px,calc(50%-410px))] top-[80px] bottom-[80px] w-[56px] z-40 flex flex-col items-center py-4 overflow-y-auto scrollbar-none">
      {/* Vertical line */}
      <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-[#0D9488]/20 -translate-x-1/2" />

      <div className="relative flex flex-col gap-1 items-center">
        {nodes.map((node) => {
          const Icon = node.icon;
          const isActive = activeId === node.id;
          return (
            <button
              key={node.id}
              onClick={() => scrollTo(node.id)}
              className="group relative flex flex-col items-center py-1.5 z-10"
              title={node.sublabel ? `${node.label}: ${node.sublabel}` : node.label}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all border-2 ${
                  isActive
                    ? "bg-[#0D9488] border-[#0D9488] text-white scale-110"
                    : "bg-background border-[#0D9488]/30 text-[#0D9488]/60 hover:border-[#0D9488]/60 hover:text-[#0D9488]"
                }`}
              >
                <Icon className="h-3 w-3" />
              </div>
              <span
                className={`text-[8px] mt-0.5 font-medium leading-tight text-center max-w-[52px] truncate transition-colors ${
                  isActive ? "text-[#0D9488]" : "text-muted-foreground/60"
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
