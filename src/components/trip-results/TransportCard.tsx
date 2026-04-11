import { Plane, Ship, Train, Car } from "lucide-react";

interface Props {
  from: string;
  to: string;
  mode: string;
  duration: string;
}

const MODE_ICONS: Record<string, typeof Plane> = {
  flight: Plane,
  plane: Plane,
  ferry: Ship,
  boat: Ship,
  train: Train,
  car: Car,
  drive: Car,
};

export function TransportCard({ from, to, mode, duration }: Props) {
  const Icon = MODE_ICONS[mode?.toLowerCase()] || Car;

  return (
    <div className="mx-4 my-4">
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3 bg-accent/50">
        <span className="text-xs text-muted-foreground font-medium truncate">{from}</span>
        <div className="flex-1 flex items-center gap-2">
          <div className="flex-1 border-t border-dashed border-border" />
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-card border border-border text-xs text-muted-foreground">
            <Icon className="h-3 w-3" />
            <span className="font-mono">{duration}</span>
          </div>
          <div className="flex-1 border-t border-dashed border-border" />
        </div>
        <span className="text-xs text-muted-foreground font-medium truncate">{to}</span>
      </div>
    </div>
  );
}
