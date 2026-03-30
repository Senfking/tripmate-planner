import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ExpenseRow, SplitRow, MemberProfile } from "@/hooks/useExpenses";
import { convertAmount, formatCurrency, Rates } from "@/lib/settlementCalc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Utensils, Car, Hotel, Ticket, ShoppingBag, MoreHorizontal,
  ChevronDown, ChevronUp, Pencil, Trash2, MapPin,
} from "lucide-react";
import { format } from "date-fns";

const CATEGORY_CONFIG: Record<string, { icon: typeof Utensils; label: string }> = {
  food: { icon: Utensils, label: "Food & Drink" },
  transport: { icon: Car, label: "Transport" },
  accommodation: { icon: Hotel, label: "Accommodation" },
  activities: { icon: Ticket, label: "Activities" },
  shopping: { icon: ShoppingBag, label: "Shopping" },
  other: { icon: MoreHorizontal, label: "Other" },
};

interface Props {
  expense: ExpenseRow;
  splits: SplitRow[];
  members: MemberProfile[];
  myRole?: string;
  settlementCurrency: string;
  baseCurrency: string;
  rates: Rates;
  itineraryItems: { id: string; title: string; day_date: string }[];
  isNew?: boolean;
  onEdit: (expense: ExpenseRow) => void;
  onDelete: (id: string) => void;
}

export function ExpenseCard({
  expense, splits, members, myRole, settlementCurrency,
  baseCurrency, rates, itineraryItems, isNew, onEdit, onDelete,
}: Props) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);

  const cat = CATEGORY_CONFIG[expense.category] || CATEGORY_CONFIG.other;
  const Icon = cat.icon;
  const payer = members.find((m) => m.userId === expense.payer_id);
  const isDifferentCurrency = expense.currency !== settlementCurrency;
  const convertedAmount = isDifferentCurrency
    ? convertAmount(expense.amount, expense.currency, settlementCurrency, baseCurrency, rates)
    : expense.amount;

  const linkedItem = expense.itinerary_item_id
    ? itineraryItems.find((it) => it.id === expense.itinerary_item_id)
    : null;

  const canModify =
    expense.payer_id === user?.id || myRole === "owner" || myRole === "admin";

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-3 flex items-start gap-3"
      >
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <Icon className="h-4.5 w-4.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium text-sm truncate">{expense.title}</p>
            <div className="text-right shrink-0">
              <p className="font-semibold text-sm">
                {formatCurrency(expense.amount, expense.currency)}
              </p>
              {isDifferentCurrency && (
                <p className="text-xs text-muted-foreground">
                  ≈ {formatCurrency(convertedAmount, settlementCurrency)}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-muted-foreground">
              {payer?.displayName || "Unknown"} · {format(new Date(expense.incurred_on), "MMM d")}
            </span>
            <Badge variant="outline" className="text-[10px] h-5 px-1.5">
              {cat.label}
            </Badge>
            {linkedItem && (
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 gap-0.5">
                <MapPin className="h-2.5 w-2.5" />
                {linkedItem.title}
              </Badge>
            )}
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
        )}
      </button>

      {expanded && (
        <div className="border-t px-3 py-2 space-y-2">
          <div className="space-y-1">
            {splits.map((s) => {
              const member = members.find((m) => m.userId === s.user_id);
              const convertedShare = isDifferentCurrency
                ? convertAmount(s.share_amount, expense.currency, settlementCurrency, baseCurrency, rates)
                : s.share_amount;
              return (
                <div key={s.id} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{member?.displayName || "Unknown"}</span>
                  <span>
                    {formatCurrency(s.share_amount, expense.currency)}
                    {isDifferentCurrency && (
                      <span className="text-muted-foreground ml-1">
                        ≈ {formatCurrency(convertedShare, settlementCurrency)}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          {expense.notes && (
            <p className="text-xs text-muted-foreground italic">{expense.notes}</p>
          )}
          {canModify && (
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onEdit(expense)}>
                <Pencil className="h-3 w-3" /> Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                onClick={() => onDelete(expense.id)}
              >
                <Trash2 className="h-3 w-3" /> Delete
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
