import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, HelpCircle, X, Crown } from "lucide-react";
import type { Proposal } from "@/hooks/useProposals";

type Props = {
  proposal: Proposal;
  reactions: { in: number; maybe: number; no: number };
  myReaction: string | undefined;
  canAdopt: boolean;
  onReact: (value: string) => void;
  onAdopt: () => void;
  isAdopting: boolean;
};

const REACTION_BUTTONS = [
  { value: "in", icon: Check, label: "In", color: "text-green-600" },
  { value: "maybe", icon: HelpCircle, label: "Maybe", color: "text-amber-500" },
  { value: "no", icon: X, label: "Not for me", color: "text-destructive" },
] as const;

export function ProposalCard({ proposal, reactions, myReaction, canAdopt, onReact, onAdopt, isAdopting }: Props) {
  const fmt = (d: string) => format(new Date(d + "T00:00:00"), "MMM d");

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3 relative">
      {proposal.adopted && (
        <Badge className="absolute top-3 right-3 bg-green-600 text-white">
          <Check className="h-3 w-3 mr-1" /> Adopted
        </Badge>
      )}

      <div>
        <h4 className="font-semibold text-foreground text-base">{proposal.destination}</h4>
        <p className="text-sm text-muted-foreground">
          {fmt(proposal.start_date)} – {fmt(proposal.end_date)}
        </p>
      </div>

      {proposal.note && (
        <p className="text-sm text-foreground/80 italic">"{proposal.note}"</p>
      )}

      <p className="text-xs text-muted-foreground">Suggested by {proposal.creator_name}</p>

      {/* Reactions */}
      <div className="flex items-center gap-2 flex-wrap">
        {REACTION_BUTTONS.map(({ value, icon: Icon, label, color }) => {
          const isSelected = myReaction === value;
          const count = reactions[value as keyof typeof reactions] || 0;
          return (
            <button
              key={value}
              onClick={() => onReact(value)}
              disabled={proposal.adopted}
              className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-sm border transition-colors ${
                isSelected
                  ? "bg-primary/10 border-primary text-primary font-medium"
                  : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
              } ${proposal.adopted ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              <Icon className={`h-3.5 w-3.5 ${isSelected ? "text-primary" : color}`} />
              <span>{label}</span>
              {count > 0 && <span className="font-semibold">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Adopt button */}
      {canAdopt && !proposal.adopted && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
          onClick={onAdopt}
          disabled={isAdopting}
        >
          <Crown className="h-3.5 w-3.5" />
          {isAdopting ? "Adopting…" : "Adopt this plan"}
        </Button>
      )}
    </div>
  );
}
