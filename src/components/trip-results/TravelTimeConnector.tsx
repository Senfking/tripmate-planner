import { Footprints, Car, Bus, Train, Ship, Bike } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Props {
  travelTime: string | null;
  travelMode: string | null;
}

const MODE_ICONS: Record<string, LucideIcon> = {
  walk: Footprints,
  walking: Footprints,
  drive: Car,
  driving: Car,
  car: Car,
  taxi: Car,
  bus: Bus,
  train: Train,
  ferry: Ship,
  bike: Bike,
  cycling: Bike,
};

export function TravelTimeConnector({ travelTime, travelMode }: Props) {
  if (!travelTime) return null;

  const Icon = MODE_ICONS[travelMode?.toLowerCase() || ""] || Car;

  return (
    <div className="flex items-center justify-center py-1">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
        <div className="w-px h-3 bg-border" />
        <Icon className="h-3 w-3" />
        <span>{travelTime}</span>
        <div className="w-px h-3 bg-border" />
      </div>
    </div>
  );
}
