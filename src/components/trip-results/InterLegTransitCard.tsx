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
    ? `~${durationHours.toFixed(1).replace(/\.0$/, "")}h`
    : null;
  const timing = arrivalDate
    ? `Morning of ${format(parseISO(arrivalDate), "MMM d")}`
    : null;

  return (
    <div className="mx-4 my-4">
      <div className="rounded-2xl border border-[#0D9488]/15 bg-white px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#0D9488]/10 border border-[#0D9488]/20 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-[#0D9488]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#0D9488]/80">
            {label}{durLabel ? ` · ${durLabel}` : ""}
          </p>
          <p className="text-sm font-semibold text-foreground leading-tight mt-0.5 truncate">
            {from} <span className="text-muted-foreground/60">→</span> {to}
          </p>
          {timing && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{timing}</p>
          )}
        </div>
      </div>
    </div>
  );
}
