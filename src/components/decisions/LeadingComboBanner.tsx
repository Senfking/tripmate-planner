import { format } from "date-fns";
import type { DateOption } from "@/hooks/useProposals";

type Props = {
  leadingCombo: {
    confirmed: boolean;
    destination: string;
    dateOption: DateOption | null;
  } | null;
};

export function LeadingComboBanner({ leadingCombo }: Props) {
  if (!leadingCombo) return null;

  const fmt = (d: string) => format(new Date(d + "T00:00:00"), "MMM d");
  const dateStr = leadingCombo.dateOption
    ? `${fmt(leadingCombo.dateOption.start_date)} – ${fmt(leadingCombo.dateOption.end_date)}`
    : null;

  if (leadingCombo.confirmed) {
    return (
      <div className="rounded-lg bg-gradient-to-r from-primary to-primary/80 px-4 py-3 text-primary-foreground">
        <p className="text-sm font-medium">
          ✅ {leadingCombo.destination}
          {dateStr && <> · {dateStr}</>} — confirmed!
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-primary/10 px-4 py-3">
      <p className="text-sm text-primary font-medium">
        🏆 {leadingCombo.destination}
        {dateStr && <> · {dateStr}</>} is currently winning
      </p>
    </div>
  );
}
