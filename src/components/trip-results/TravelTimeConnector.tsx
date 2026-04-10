interface Props {
  travelTime: string | null;
  travelMode: string | null;
}

const MODE_ICONS: Record<string, string> = {
  walk: "🚶",
  walking: "🚶",
  drive: "🚗",
  driving: "🚗",
  car: "🚗",
  taxi: "🚕",
  bus: "🚌",
  train: "🚆",
  ferry: "⛴️",
  bike: "🚲",
  cycling: "🚲",
};

export function TravelTimeConnector({ travelTime, travelMode }: Props) {
  if (!travelTime) return null;

  const icon = MODE_ICONS[travelMode?.toLowerCase() || ""] || "🚗";

  return (
    <div className="flex items-center justify-center py-1">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
        <div className="w-px h-3 bg-border" />
        <span>
          {icon} {travelTime}
        </span>
        <div className="w-px h-3 bg-border" />
      </div>
    </div>
  );
}
