import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ExpenseRow, SplitRow, MemberProfile } from "@/hooks/useExpenses";
import { convertAmount, formatCurrency, Rates } from "@/lib/settlementCalc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Utensils, Car, Hotel, Ticket, ShoppingBag, MoreHorizontal,
  ArrowLeftRight, Pencil, Trash2, MapPin,
} from "lucide-react";
import { format } from "date-fns";

const CATEGORY_CONFIG: Record<string, {
  icon: typeof Utensils;
  label: string;
  bg: string;
  color: string;
  border: string;
}> = {
  food: { icon: Utensils, label: "Food & Drink", bg: "#FFF3E0", color: "#F57C00", border: "#F57C00" },
  transport: { icon: Car, label: "Transport", bg: "#E3F2FD", color: "#1565C0", border: "#1565C0" },
  accommodation: { icon: Hotel, label: "Accommodation", bg: "#F3E5F5", color: "#6A1B9A", border: "#6A1B9A" },
  activities: { icon: Ticket, label: "Activities", bg: "#E8F5E9", color: "#2E7D32", border: "#2E7D32" },
  shopping: { icon: ShoppingBag, label: "Shopping", bg: "#FCE4EC", color: "#C62828", border: "#C62828" },
  settlement: { icon: ArrowLeftRight, label: "Settlement", bg: "#E0F2F1", color: "#00695C", border: "#00695C" },
  other: { icon: MoreHorizontal, label: "Other", bg: "#F5F5F5", color: "#757575", border: "#757575" },
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
    <div
      className={`rounded-2xl bg-card overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.07)] ${isNew ? "animate-realtime-flash" : ""}`}
      style={{ borderLeft: `3px solid ${cat.border}` }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-3 flex items-center gap-3"
      >
        <div
          className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: cat.bg }}
        >
          <Icon className="h-5 w-5" style={{ color: cat.color }} />
        </div>
        <div className="flex-1 min-w-0">
          {/* Row 1: Title + Amount */}
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-[15px] leading-snug line-clamp-2">{expense.title}</p>
            <div className="text-right shrink-0">
              <p className="font-bold text-[15px]">
                {formatCurrency(expense.amount, expense.currency)}
              </p>
              {isDifferentCurrency && convertedAmount != null && (
                <p className="text-xs text-muted-foreground">
                  ≈ {formatCurrency(convertedAmount, settlementCurrency)}
                </p>
              )}
            </div>
          </div>
          {/* Row 2: Payer · Date · optional itinerary link */}
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-xs text-muted-foreground">
              {payer?.displayName || "Unknown"} · {format(new Date(expense.incurred_on), "MMM d")}
            </span>
            {linkedItem && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5 py-0 gap-0.5 font-normal">
                <MapPin className="h-2.5 w-2.5" />
                {linkedItem.title}
              </Badge>
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-muted/60 mx-3 px-0 py-2.5 space-y-2">
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
                    {isDifferentCurrency && convertedShare != null && (
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
