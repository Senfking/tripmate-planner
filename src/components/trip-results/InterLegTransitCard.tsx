import { Plane, TrainFront, Car, Ship, Bus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { format, parseISO } from "date-fns";

interface Props {
  from: string;
  to: string;
  mode?: string | null;
  durationHours?: number | null;
  arrivalDate?: string | null;
}

function pickIcon(mode?: string | null): { Icon: LucideIcon; label: string } {
  switch ((mode || "").toLowerCase()) {
    case "train": return { Icon: TrainFront, label: "Train" };
    case "drive":
    case "car": return { Icon: Car, label: "Drive" };
    case "ferry":
    case "boat": return { Icon: Ship, label: "Ferry" };
    case "bus":
    case "coach": return { Icon: Bus, label: "Bus" };
    case "mixed": return { Icon: Plane, label: "Travel" };
    case "flight":
    case "plane":
    default: return { Icon: Plane, label: "Flight" };
  }
}

export function InterLegTransitCard({ from, to, mode, durationHours, arrivalDate }: Props) {
  const { Icon, label } = pickIcon(mode);
  const durLabel = typeof durationHours === "number" && durationHours > 0
    ? `${durationHours.toFixed(1).replace(/\.0$/, "")}h`
    : null;
  const timing = arrivalDate ? format(parseISO(arrivalDate), "MMM d") : null;

  // Meta line: e.g. "Flight · 2h · Jun 8"
  const meta = [label, durLabel, timing].filter(Boolean).join("  ·  ");

  return (
    <div className="px-4 py-6">
      <div className="flex items-center gap-3">
        {/* Left rule */}
        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-foreground/10" />

        {/* Center node */}
        <div className="flex items-center gap-2.5 px-1">
          <Icon className="h-3.5 w-3.5 text-[#0D9488]" strokeWidth={2.25} />
          <span className="text-[11px] font-medium tracking-[0.18em] uppercase text-foreground/70 whitespace-nowrap">
            {from} <span className="text-foreground/30 mx-1">—</span> {to}
          </span>
        </div>

        {/* Right rule */}
        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-foreground/10" />
      </div>

      {meta && (
        <p className="mt-2 text-center text-[10px] tracking-[0.22em] uppercase text-muted-foreground/70">
          {meta}
        </p>
      )}
    </div>
  );
}
