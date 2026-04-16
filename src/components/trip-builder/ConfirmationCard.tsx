import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { differenceInDays } from "date-fns";
import type { PremiumInputData } from "./PremiumTripInput";

type Props = {
  data: PremiumInputData;
  onConfirm: () => void;
  onEdit: () => void;
};

export function ConfirmationCard({ data, onConfirm, onEdit }: Props) {
  const duration = data.dateRange?.from && data.dateRange?.to
    ? differenceInDays(data.dateRange.to, data.dateRange.from) + 1
    : null;

  const budgetLabels: Record<string, string> = {
    budget: "budget-friendly",
    "mid-range": "mid-range",
    premium: "premium",
    luxury: "luxury",
  };

  const partyLabels: Record<string, string> = {
    solo: "a solo traveler",
    couple: "a couple",
    friends: "friends",
    family: "a family",
    group: "a group",
  };

  const parts: string[] = [];
  if (duration) parts.push(`${duration}-day`);
  if (data.budgetLevel) parts.push(budgetLabels[data.budgetLevel] || data.budgetLevel);
  parts.push(`trip to ${data.destination}`);
  if (data.travelParty) parts.push(`for ${partyLabels[data.travelParty]}`);

  let summary = `Got it. Planning a ${parts.join(" ")}`;

  if (data.vibes.length > 0) {
    const top = data.vibes.slice(0, 2).map((v) => v.toLowerCase()).join(" & ");
    summary += `. Focus on ${top}`;
  }

  if (data.dealBreakers) {
    const first = data.dealBreakers.split(",")[0].trim().toLowerCase();
    if (first) summary += `. Avoiding ${first}`;
  }

  summary += ".";

  return (
    <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-2xl p-6 animate-fade-in">
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <p className="font-semibold text-foreground text-[15px]">Just confirming</p>
        </div>

        <p className="text-sm text-foreground leading-relaxed mb-6">{summary}</p>

        <div className="flex gap-3">
          <Button variant="ghost" onClick={onEdit} className="flex-1 h-11 rounded-xl text-sm">
            Edit
          </Button>
          <Button
            onClick={onConfirm}
            className="flex-1 h-11 rounded-xl font-semibold text-primary-foreground text-sm"
            style={{ background: "var(--gradient-primary)" }}
          >
            Looks good, continue
          </Button>
        </div>
      </div>
    </div>
  );
}
