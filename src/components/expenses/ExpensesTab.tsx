import { useState, useMemo } from "react";
import { useExpenses, ExpenseRow } from "@/hooks/useExpenses";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { calcNetBalances, calcSettlements, formatCurrency } from "@/lib/settlementCalc";
import { SettlementCurrencyPicker } from "./SettlementCurrencyPicker";
import { BalancesSummary } from "./BalancesSummary";
import { SettleUpSection, SettlementProgress } from "./SettleUpSection";
import { ExpenseCard } from "./ExpenseCard";
import { ExpenseFormModal } from "./ExpenseFormModal";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, AlertTriangle, Download, Loader2, ChevronRight, CheckCircle2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

interface Props {
  tripId: string;
  myRole?: string;
}

export function ExpensesTab({ tripId, myRole }: Props) {
  const { user } = useAuth();
  const {
    expenses, splits, members, settlementCurrency, rates, ratesError,
    ratesStale, ratesEmpty, cachedCurrencyCodes,
    itineraryItems, isLoading, updateSettlementCurrency, addExpense,
    updateExpense, deleteExpense,
  } = useExpenses(tripId);

  const [formOpen, setFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRow | null>(null);
  const [balancesOpen, setBalancesOpen] = useState(true);
  const [settleOpen, setSettleOpen] = useState(true);
  const [expensesOpen, setExpensesOpen] = useState(true);

  const profileMap = useMemo(
    () => Object.fromEntries(members.map((m) => [m.userId, m.displayName])),
    [members]
  );

  const expensesWithSplits = useMemo(
    () =>
      expenses.map((e) => ({
        ...e,
        splits: splits.filter((s) => s.expense_id === e.id).map((s) => ({
          user_id: s.user_id,
          share_amount: s.share_amount,
        })),
      })),
    [expenses, splits]
  );

  const balances = useMemo(
    () => calcNetBalances(expensesWithSplits, settlementCurrency, settlementCurrency, rates, profileMap),
    [expensesWithSplits, settlementCurrency, rates, profileMap]
  );

  const settlements = useMemo(() => calcSettlements(balances), [balances]);

  // Compute settlement progress per debtor→creditor pair
  const { settlementProgress, totalSettledOverall } = useMemo(() => {
    // Identify settlement expenses
    const settlementExps = expensesWithSplits.filter((e) => e.category === "settlement");
    // Build a map of settled amounts per pair (payer→split recipient)
    const settledMap = new Map<string, number>();
    for (const exp of settlementExps) {
      for (const split of exp.splits) {
        const key = `${exp.payer_id}→${split.user_id}`;
        settledMap.set(key, (settledMap.get(key) || 0) + split.share_amount);
      }
    }
    let totalSettled = 0;
    settledMap.forEach((v) => { totalSettled += v; });

    // For each current settlement, compute total owed = remaining + settled
    const progress: SettlementProgress[] = settlements.map((s) => {
      const key = `${s.from}→${s.to}`;
      const settled = settledMap.get(key) || 0;
      const totalOwed = s.amount + settled;
      return { pairKey: key, totalOwed, totalSettled: settled, remaining: s.amount };
    });

    return { settlementProgress: progress, totalSettledOverall: totalSettled };
  }, [expensesWithSplits, settlements]);

  // Collapsed summary for balances
  const myBalance = useMemo(() => {
    const entry = balances.find((b) => b.userId === user?.id);
    if (!entry) return null;
    return entry;
  }, [balances, user?.id]);

  // Collapsed summary for settle up
  const settleUpSummary = useMemo(() => {
    if (settlements.length === 0) return { text: "All settled ✓", color: "text-emerald-600" };
    const iOwe = settlements.filter((s) => s.from === user?.id).reduce((sum, s) => sum + s.amount, 0);
    const owedToMe = settlements.filter((s) => s.to === user?.id).reduce((sum, s) => sum + s.amount, 0);
    if (iOwe > 0.005) return { text: `You owe ${formatCurrency(iOwe, settlementCurrency)}`, color: "text-amber-600" };
    if (owedToMe > 0.005) return { text: `Awaiting ${formatCurrency(owedToMe, settlementCurrency)}`, color: "text-emerald-600" };
    return { text: "All settled ✓", color: "text-emerald-600" };
  }, [settlements, user?.id, settlementCurrency]);

  // Unique currencies used in existing expenses (for suggested list)
  const usedCurrencies = useMemo(() => {
    return [...new Set(expenses.map((e) => e.currency))];
  }, [expenses]);

  // Group expenses by date
  const groupedExpenses = useMemo(() => {
    const groups = new Map<string, ExpenseRow[]>();
    expenses.forEach((exp) => {
      const date = exp.incurred_on;
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date)!.push(exp);
    });
    // Sort groups by date desc, items within by created_at desc
    return Array.from(groups.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => ({
        date,
        items: [...items].sort((a, b) => b.created_at.localeCompare(a.created_at)),
      }));
  }, [expenses]);

  const totalExpenses = useMemo(() => {
    if (expenses.length === 0) return null;
    // Sum expenses converted to settlement currency where possible
    let total = 0;
    for (const exp of expenses) {
      if (exp.category === "settlement") continue;
      if (exp.currency === settlementCurrency) {
        total += exp.amount;
      } else if (rates && rates[exp.currency]) {
        total += exp.amount / rates[exp.currency];
      } else {
        total += exp.amount;
      }
    }
    return total;
  }, [expenses, settlementCurrency, rates]);

  const editingSplits = editingExpense
    ? splits.filter((s) => s.expense_id === editingExpense.id).map((s) => ({
        user_id: s.user_id,
        share_amount: s.share_amount,
      }))
    : undefined;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <SettlementCurrencyPicker
          value={settlementCurrency}
          onChange={(c) => updateSettlementCurrency.mutate(c)}
          cachedCurrencyCodes={cachedCurrencyCodes}
        />
        <div className="flex items-center gap-1.5">
          {expenses.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={async () => {
                try {
                  const { data: { session } } = await supabase.auth.getSession();
                  if (!session) { toast.error("Please sign in to export"); return; }
                  const projId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
                  const url = `https://${projId}.supabase.co/functions/v1/export-expenses-csv?trip_id=${tripId}`;
                  const res = await fetch(url, {
                    headers: { Authorization: `Bearer ${session.access_token}` },
                  });
                  if (!res.ok) throw new Error("Export failed");
                  const blob = await res.blob();
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = "junto-expenses.csv";
                  a.click();
                  URL.revokeObjectURL(a.href);
                } catch {
                  toast.error("Failed to export expenses");
                }
              }}
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
          )}
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => { setEditingExpense(null); setFormOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> Add Expense
          </Button>
        </div>
      </div>

      {/* Rate warnings */}
      {(ratesError || ratesEmpty) && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Exchange rates unavailable — amounts shown in original currencies
        </div>
      )}
      {ratesStale && !ratesEmpty && !ratesError && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Exchange rates may be outdated
        </div>
      )}

      {/* Balances section */}
      {balances.length > 0 && (
        <Collapsible open={balancesOpen} onOpenChange={setBalancesOpen}>
          <div className="rounded-xl border bg-card p-3 space-y-2">
            <CollapsibleTrigger className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2">
                <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${balancesOpen ? "rotate-90" : ""}`} />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Balances</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{balances.length}</Badge>
              </div>
            </CollapsibleTrigger>
            {!balancesOpen && myBalance && (
              <p className="text-xs text-muted-foreground pl-6">
                {myBalance.balance > 0.005
                  ? <span className="text-emerald-600">You are owed {formatCurrency(myBalance.balance, settlementCurrency)}</span>
                  : myBalance.balance < -0.005
                  ? <span className="text-red-500">You owe {formatCurrency(Math.abs(myBalance.balance), settlementCurrency)}</span>
                  : <span>All settled</span>
                }
              </p>
            )}
            <CollapsibleContent>
              <BalancesSummary balances={balances} currency={settlementCurrency} />
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}

      {/* Settle Up section */}
      {settlements.length === 0 ? (
        <div className="rounded-xl border bg-card p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Settle Up</span>
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              All settled ✓
            </span>
          </div>
        </div>
      ) : (
        <Collapsible open={settleOpen} onOpenChange={setSettleOpen}>
          <div className="rounded-xl border bg-card p-3 space-y-2">
            <CollapsibleTrigger className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2">
                <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${settleOpen ? "rotate-90" : ""}`} />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Settle Up</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{settlements.length}</Badge>
              </div>
            </CollapsibleTrigger>
            {!settleOpen && (
              <p className={`text-xs pl-6 font-medium ${settleUpSummary.color}`}>
                {settleUpSummary.text}
              </p>
            )}
            <CollapsibleContent>
              <SettleUpSection
                settlements={settlements}
                currency={settlementCurrency}
                settlementProgress={settlementProgress}
                totalSettledOverall={totalSettledOverall}
                onSettle={(data) => addExpense.mutate(data as any)}
              />
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}

      {/* Expenses section */}
      <Collapsible open={expensesOpen} onOpenChange={setExpensesOpen}>
        <div className="rounded-xl border bg-card p-3 space-y-2">
          <CollapsibleTrigger className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expensesOpen ? "rotate-90" : ""}`} />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Expenses</span>
              {expenses.length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{expenses.length}</Badge>
              )}
            </div>
          </CollapsibleTrigger>
          {!expensesOpen && totalExpenses !== null && (
            <p className="text-xs text-muted-foreground pl-6">
              Total: {formatCurrency(totalExpenses, settlementCurrency)}
            </p>
          )}
          <CollapsibleContent>
            {expenses.length === 0 ? (
              <div className="text-center py-8 space-y-1">
                <p className="text-muted-foreground text-sm">No expenses yet</p>
                <p className="text-xs text-muted-foreground">
                  Tap "Add Expense" to start tracking costs
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {groupedExpenses.map(({ date, items }) => (
                  <div key={date}>
                    {/* Date divider */}
                    <div className="flex items-center gap-3 my-2">
                      <div className="flex-1 border-t border-muted" />
                      <span className="text-[12px] text-muted-foreground whitespace-nowrap">
                        {format(parseISO(date), "EEE d MMM")}
                      </span>
                      <div className="flex-1 border-t border-muted" />
                    </div>
                    <div className="space-y-2">
                      {items.map((exp) => (
                        <ExpenseCard
                          key={exp.id}
                          expense={exp}
                          splits={splits.filter((s) => s.expense_id === exp.id)}
                          members={members}
                          myRole={myRole}
                          settlementCurrency={settlementCurrency}
                          baseCurrency={settlementCurrency}
                          rates={rates}
                          itineraryItems={itineraryItems}
                          onEdit={(e) => { setEditingExpense(e); setFormOpen(true); }}
                          onDelete={(id) => deleteExpense.mutate(id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleContent>
        </div>
      </Collapsible>

      <ExpenseFormModal
        open={formOpen}
        onOpenChange={(open) => { setFormOpen(open); if (!open) setEditingExpense(null); }}
        members={members}
        settlementCurrency={settlementCurrency}
        itineraryItems={itineraryItems}
        usedCurrencies={usedCurrencies}
        editingExpense={editingExpense}
        editingSplits={editingSplits}
        onSave={(data) => {
          if (data.id) {
            updateExpense.mutate(data as any);
          } else {
            addExpense.mutate(data as any);
          }
        }}
      />
    </div>
  );
}
