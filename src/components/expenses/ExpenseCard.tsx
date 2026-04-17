import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ExpenseRow, SplitRow, MemberProfile } from "@/hooks/useExpenses";
import { useLineItemClaims } from "@/hooks/useLineItemClaims";
import { convertAmount, formatCurrency, Rates } from "@/lib/settlementCalc";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  Utensils, Car, Hotel, Ticket, ShoppingBag, MoreHorizontal,
  ArrowLeftRight, Trash2, Receipt, Pencil, Check,
} from "lucide-react";
import { format } from "date-fns";
import { InlineExpenseHeader } from "./inline/InlineExpenseHeader";
import { InlineLineItemList } from "./inline/InlineLineItemList";

const CATEGORY_CONFIG: Record<string, { icon: typeof Utensils; label: string; iconColor: string; bgColor: string }> = {
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
  cachedCurrencyCodes?: string[];
  isNew?: boolean;
  onDelete: (id: string) => void;
  /** Kept for API compat with ExpensesTab — no longer used (inline editing replaces the modal). */
  onEdit?: (expense: ExpenseRow) => void;
}

export function ExpenseCard({
  expense, splits, members, myRole, tripId, settlementCurrency,
  baseCurrency, rates, itineraryItems, cachedCurrencyCodes = [], isNew, onDelete,
}: Props) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const { lineItems, claims, hasLineItems, toggleClaim, setClaimQuantity } = useLineItemClaims(
    expanded ? expense.id : null,
    tripId,
  );

  const hasReceipt = !!expense.receipt_image_path;

  const handleViewReceipt = async () => {
    const tab = window.open("about:blank", "_blank");
    const { data } = await supabase.storage.from("receipt-images").createSignedUrl(expense.receipt_image_path!, 3600);
    if (data?.signedUrl) {
      if (tab) tab.location.href = data.signedUrl;
      else window.open(data.signedUrl, "_blank", "noopener");
    } else {
      tab?.close();
    }
  };

  const cat = CATEGORY_CONFIG[expense.category] || CATEGORY_CONFIG.other;
  const Icon = cat.icon;
  const payer = members.find((m) => m.userId === expense.payer_id);
  const isSettlement = expense.category === "settlement";
  const isPayer = expense.payer_id === user?.id;
  const mySplit = user ? splits.find((s) => s.user_id === user.id) : null;
  const splitsReady = splits.length > 0 || !isPayer;
  const youLentAmount = isPayer && mySplit
    ? expense.amount - mySplit.share_amount
    : isPayer && !splitsReady ? null : isPayer ? expense.amount : 0;

  const canModify = expense.payer_id === user?.id || myRole === "owner" || myRole === "admin";

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
              {!isSettlement && isPayer && youLentAmount === null ? (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#0D9488" }}>you lent</p>
                  <p className="text-[17px] font-bold text-foreground text-muted-foreground/50">…</p>
                </>
              ) : !isSettlement && isPayer && youLentAmount != null && youLentAmount > 0 ? (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#0D9488" }}>you lent</p>
                  <p className="text-[17px] font-bold text-foreground">{formatCurrency(youLentAmount, expense.currency)}</p>
                  {youLentAmount !== expense.amount && (
                    <p className="text-[11px] text-muted-foreground">total {formatCurrency(expense.amount, expense.currency)}</p>
                  )}
                </>
              ) : !isSettlement && !isPayer && mySplit ? (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#EF4444" }}>you owe</p>
                  <p className="text-[17px] font-bold text-foreground">{formatCurrency(mySplit.share_amount, expense.currency)}</p>
                  {mySplit.share_amount !== expense.amount && (
                    <p className="text-[11px] text-muted-foreground">total {formatCurrency(expense.amount, expense.currency)}</p>
                  )}
                </>
              ) : (
                <p className="font-bold text-[15px]">{formatCurrency(expense.amount, expense.currency)}</p>
              )}
            </div>
          </div>
        </div>
      </button>

      {expanded && (
        <ExpandedDetail
          expense={expense}
          splits={splits}
          members={members}
          tripId={tripId}
          settlementCurrency={settlementCurrency}
          baseCurrency={baseCurrency}
          rates={rates}
          cachedCurrencyCodes={cachedCurrencyCodes}
          canModify={canModify}
          hasReceipt={hasReceipt}
          handleViewReceipt={handleViewReceipt}
          onDelete={onDelete}
          hasLineItems={hasLineItems}
          lineItems={lineItems}
          claims={claims}
          toggleClaim={toggleClaim}
          setClaimQuantity={setClaimQuantity}
        />
      )}
    </div>
  );
}

function ExpandedDetail({
  expense, splits, members, tripId, settlementCurrency, baseCurrency, rates,
  cachedCurrencyCodes, canModify, hasReceipt, handleViewReceipt, onDelete,
  hasLineItems, lineItems, claims, toggleClaim, setClaimQuantity,
}: {
  expense: ExpenseRow;
  splits: SplitRow[];
  members: MemberProfile[];
  tripId: string;
  settlementCurrency: string;
  baseCurrency: string;
  rates: Rates;
  cachedCurrencyCodes: string[];
  canModify: boolean;
  hasReceipt: boolean;
  handleViewReceipt: () => Promise<void>;
  onDelete: (id: string) => void;
  hasLineItems: boolean;
  lineItems: ReturnType<typeof useLineItemClaims>["lineItems"];
  claims: ReturnType<typeof useLineItemClaims>["claims"];
  toggleClaim: ReturnType<typeof useLineItemClaims>["toggleClaim"];
  setClaimQuantity: ReturnType<typeof useLineItemClaims>["setClaimQuantity"];
}) {
  const [editMode, setEditMode] = useState(false);

  return (
    <div className="space-y-2" style={{ padding: "0 16px 12px" }}>
      {/* Compact metadata grid (includes editable Title in edit mode) */}
      <InlineExpenseHeader
        expense={expense}
        splits={splits}
        members={members}
        tripId={tripId}
        editMode={editMode && canModify}
        hasLineItems={hasLineItems}
        cachedCurrencyCodes={cachedCurrencyCodes}
      />

      {/* Either line items (with claims + editing) or plain splits breakdown */}
      {hasLineItems ? (
        <InlineLineItemList
          expenseId={expense.id}
          tripId={tripId}
          members={members}
          currency={expense.currency}
          totalAmount={expense.amount}
          lineItems={lineItems}
          claims={claims}
          canEdit={canModify}
          editMode={editMode}
          toggleClaim={(id, userId) => toggleClaim.mutate({ lineItemId: id, userId })}
          setClaimQuantity={(id, qty, userId) => setClaimQuantity.mutateAsync({ lineItemId: id, quantity: qty, userId })}
          isToggling={toggleClaim.isPending}
        />
      ) : (
        <div className="space-y-1">
          {splits.map((s) => {
            const member = members.find((m) => m.userId === s.user_id);
            const isDifferent = expense.currency !== settlementCurrency;
            const converted = isDifferent
              ? convertAmount(s.share_amount, expense.currency, settlementCurrency, baseCurrency, rates)
              : s.share_amount;
            return (
              <div key={s.id} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{member?.displayName || "Unknown"}</span>
                <span>
                  {formatCurrency(s.share_amount, expense.currency)}
                  {isDifferent && converted != null && (
                    <span className="text-muted-foreground ml-1">≈ {formatCurrency(converted, settlementCurrency)}</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Action buttons: [View receipt] [Edit/Done] [Delete] */}
      <div className="flex gap-2 pt-1 flex-wrap">
        {hasReceipt && (
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 px-2" onClick={handleViewReceipt}>
            <Receipt className="h-3 w-3" /> View receipt
          </Button>
        )}
        {canModify && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1 px-2 text-primary hover:text-primary"
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? <Check className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
            {editMode ? "Done" : "Edit"}
          </Button>
        )}
        {canModify && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1 px-2 text-destructive hover:text-destructive"
            onClick={() => onDelete(expense.id)}
          >
            <Trash2 className="h-3 w-3" /> Delete
          </Button>
        )}
      </div>
    </div>
  );
}
