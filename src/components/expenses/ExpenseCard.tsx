import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ExpenseRow, SplitRow, MemberProfile } from "@/hooks/useExpenses";
import { useLineItemClaims } from "@/hooks/useLineItemClaims";
import { convertAmount, formatCurrency, Rates } from "@/lib/settlementCalc";
import { Button } from "@/components/ui/button";
import { LineItemClaimList } from "./LineItemClaimList";
import { ReceiptLightbox } from "./ReceiptLightbox";
import { supabase } from "@/integrations/supabase/client";
import {
  Utensils, Car, Hotel, Ticket, ShoppingBag, MoreHorizontal,
  ArrowLeftRight, Pencil, Trash2, Receipt,
} from "lucide-react";
import { format } from "date-fns";

const CATEGORY_CONFIG: Record<string, {
  icon: typeof Utensils;
  label: string;
  iconColor: string;
  bgColor: string;
}> = {
  food:          { icon: Utensils,       label: "Food & Drink",  iconColor: "#0D9488", bgColor: "rgba(13,148,136,0.08)" },
  transport:     { icon: Car,            label: "Transport",     iconColor: "#0D9488", bgColor: "rgba(13,148,136,0.08)" },
  accommodation: { icon: Hotel,          label: "Accommodation", iconColor: "#0D9488", bgColor: "rgba(13,148,136,0.08)" },
  activities:    { icon: Ticket,         label: "Activities",    iconColor: "#0D9488", bgColor: "rgba(13,148,136,0.08)" },
  shopping:      { icon: ShoppingBag,    label: "Shopping",      iconColor: "#0D9488", bgColor: "rgba(13,148,136,0.08)" },
  settlement:    { icon: ArrowLeftRight, label: "Settlement",    iconColor: "#0D9488", bgColor: "rgba(13,148,136,0.08)" },
  other:         { icon: MoreHorizontal, label: "Other",         iconColor: "#0D9488", bgColor: "rgba(13,148,136,0.08)" },
};

interface Props {
  expense: ExpenseRow;
  splits: SplitRow[];
  members: MemberProfile[];
  myRole?: string;
  tripId: string;
  settlementCurrency: string;
  baseCurrency: string;
  rates: Rates;
  itineraryItems: { id: string; title: string; day_date: string }[];
  isNew?: boolean;
  onEdit: (expense: ExpenseRow) => void;
  onDelete: (id: string) => void;
}

export function ExpenseCard({
  expense, splits, members, myRole, tripId, settlementCurrency,
  baseCurrency, rates, itineraryItems, isNew, onEdit, onDelete,
}: Props) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const { lineItems, claims, hasLineItems, toggleClaim } = useLineItemClaims(
    expanded ? expense.id : null,
    tripId
  );

  const hasReceipt = !!expense.receipt_image_path;

  const handleViewReceipt = async () => {
    const tab = window.open("about:blank", "_blank");
    const { data } = await supabase.storage
      .from("receipt-images")
      .createSignedUrl(expense.receipt_image_path!, 3600);
    if (data?.signedUrl) {
      if (tab) {
        tab.location.href = data.signedUrl;
      } else {
        window.open(data.signedUrl, "_blank", "noopener");
      }
    } else {
      tab?.close();
    }
  };

  const cat = CATEGORY_CONFIG[expense.category] || CATEGORY_CONFIG.other;
  const Icon = cat.icon;
  const payer = members.find((m) => m.userId === expense.payer_id);
  const isDifferentCurrency = expense.currency !== settlementCurrency;
  const convertedAmount = isDifferentCurrency
    ? convertAmount(expense.amount, expense.currency, settlementCurrency, baseCurrency, rates)
    : expense.amount;

  const isSettlement = expense.category === "settlement";
  const isPayer = expense.payer_id === user?.id;
  const mySplit = user ? splits.find((s) => s.user_id === user.id) : null;
  const youLentAmount = isPayer && mySplit
    ? expense.amount - mySplit.share_amount
    : isPayer ? expense.amount : 0;

  const canModify =
    expense.payer_id === user?.id || myRole === "owner" || myRole === "admin";

  return (
    <div
      className={`overflow-hidden transition-colors duration-150 ${isNew ? "animate-realtime-flash" : ""}`}
      style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left flex items-center gap-3 hover:bg-[rgba(13,148,136,0.03)] transition-colors"
        style={{ padding: "14px 16px" }}
      >
        <div
          className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: "rgba(13,148,136,0.08)", border: "1px solid rgba(13,148,136,0.12)" }}
        >
          <Icon className="h-4 w-4" style={{ color: cat.iconColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-[15px] leading-snug truncate text-foreground">{expense.title}</p>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                {payer?.displayName || "Unknown"} · {format(new Date(expense.incurred_on), "MMM d")}
              </p>
            </div>
            <div className="text-right shrink-0">
              {!isSettlement && isPayer && youLentAmount > 0 ? (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#0D9488" }}>you lent</p>
                  <p className="text-[17px] font-bold text-foreground">
                    {formatCurrency(youLentAmount, expense.currency)}
                  </p>
                  {youLentAmount !== expense.amount && (
                    <p className="text-[11px] text-muted-foreground">total {formatCurrency(expense.amount, expense.currency)}</p>
                  )}
                </>
              ) : !isSettlement && !isPayer && mySplit ? (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#EF4444" }}>you owe</p>
                  <p className="text-[17px] font-bold text-foreground">
                    {formatCurrency(mySplit.share_amount, expense.currency)}
                  </p>
                  {mySplit.share_amount !== expense.amount && (
                    <p className="text-[11px] text-muted-foreground">total {formatCurrency(expense.amount, expense.currency)}</p>
                  )}
                </>
              ) : (
                <p className="font-bold text-[15px]">
                  {formatCurrency(expense.amount, expense.currency)}
                </p>
              )}
            </div>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="py-2.5 space-y-3" style={{ padding: "10px 16px", borderTop: "1px solid rgba(0,0,0,0.04)" }}>
          {/* Line item claiming UI */}
          {hasLineItems && (
            <LineItemClaimList
              lineItems={lineItems}
              claims={claims}
              members={members}
              currency={expense.currency}
              totalAmount={expense.amount}
              onToggleClaim={(id) => toggleClaim.mutate(id)}
              isToggling={toggleClaim.isPending}
            />
          )}

          {/* Standard splits breakdown */}
          {!hasLineItems && (
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
          )}

          {expense.notes && (
            <p className="text-xs text-muted-foreground italic">{expense.notes}</p>
          )}

          {/* Receipt & action buttons */}
          <div className="flex gap-2 pt-1 flex-wrap">
            {hasReceipt && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleViewReceipt}>
                <Receipt className="h-3 w-3" /> View receipt
              </Button>
            )}
            {canModify && (
              <>
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
              </>
            )}
          </div>
        </div>
      )}

      {/* Receipt lightbox */}
      {hasReceipt && receiptUrl && (
        <ReceiptLightbox open={lightboxOpen} onOpenChange={setLightboxOpen} imageUrl={receiptUrl} />
      )}
    </div>
  );
}
