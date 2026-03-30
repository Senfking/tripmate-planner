import { useState, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useExpenses, ExpenseRow } from "@/hooks/useExpenses";
import { useAuth } from "@/contexts/AuthContext";
import { calcNetBalances, calcSettlements, formatCurrency } from "@/lib/settlementCalc";
import { SettlementCurrencyPicker } from "./SettlementCurrencyPicker";
import { BalancesSummary } from "./BalancesSummary";
import { SettleUpSection, SettlementProgress } from "./SettleUpSection";
import { ExpenseCard } from "./ExpenseCard";
import { ExpenseFormModal } from "./ExpenseFormModal";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, AlertTriangle, Loader2, ChevronRight, CheckCircle2, Info } from "lucide-react";
import { format, parseISO } from "date-fns";

interface Props {
  tripId: string;
  myRole?: string;
  newItemIds?: Set<string>;
}

export function ExpensesTab({ tripId, myRole, newItemIds }: Props) {
  const { user } = useAuth();
  const {
    expenses, splits, members, settlementCurrency, rates, ratesError,
    ratesStale, ratesEmpty, ratesLoading, refreshingRates, cachedCurrencyCodes,
    itineraryItems, isLoading, updateSettlementCurrency, addExpense,
    updateExpense, deleteExpense,
  } = useExpenses(tripId);

  const allSameCurrency = useMemo(
    () => expenses.every((e) => e.currency === settlementCurrency),
    [expenses, settlementCurrency]
  );
  const canShowBalances = !ratesLoading || allSameCurrency || Object.keys(rates).length > 0;

  const [formOpen, setFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRow | null>(null);
  const [balancesOpen, setBalancesOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
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

  const { balances, excludedCount } = useMemo(
    () => calcNetBalances(expensesWithSplits, settlementCurrency, settlementCurrency, rates, profileMap),
    [expensesWithSplits, settlementCurrency, rates, profileMap]
  );

  const settlements = useMemo(() => calcSettlements(balances), [balances]);

  const { settlementProgress, totalSettledOverall } = useMemo(() => {
    const settlementExps = expensesWithSplits.filter((e) => e.category === "settlement");
    const settledMap = new Map<string, number>();
    for (const exp of settlementExps) {
      for (const split of exp.splits) {
        const key = `${exp.payer_id}→${split.user_id}`;
        settledMap.set(key, (settledMap.get(key) || 0) + split.share_amount);
      }
    }
    let totalSettled = 0;
    settledMap.forEach((v) => { totalSettled += v; });

    const progress: SettlementProgress[] = settlements.map((s) => {
      const key = `${s.from}→${s.to}`;
      const settled = settledMap.get(key) || 0;
      const totalOwed = s.amount + settled;
      return { pairKey: key, totalOwed, totalSettled: settled, remaining: s.amount };
    });

    return { settlementProgress: progress, totalSettledOverall: totalSettled };
  }, [expensesWithSplits, settlements]);

  const myBalance = useMemo(() => {
    const entry = balances.find((b) => b.userId === user?.id);
    if (!entry) return null;
    return entry;
  }, [balances, user?.id]);

  // Hero card data
  const heroData = useMemo(() => {
    const iOwe = settlements.filter((s) => s.from === user?.id);
    const owedToMe = settlements.filter((s) => s.to === user?.id);
    const totalIOwe = iOwe.reduce((sum, s) => sum + s.amount, 0);
    const totalOwedToMe = owedToMe.reduce((sum, s) => sum + s.amount, 0);

    if (totalIOwe > 0.005) {
      return {
        type: "owe" as const,
        amount: totalIOwe,
        subline: iOwe.length === 1 ? `to ${iOwe[0].toName}` : `to ${iOwe.length} people`,
      };
    }
    if (totalOwedToMe > 0.005) {
      return {
        type: "owed" as const,
        amount: totalOwedToMe,
        subline: owedToMe.length === 1 ? `from ${owedToMe[0].fromName}` : `from ${owedToMe.length} people`,
      };
    }
    return { type: "settled" as const, amount: 0, subline: "" };
  }, [settlements, user?.id]);

  // Settle up: separate mine vs others
  const { mySettlements, otherSettlements } = useMemo(() => {
    const mine = settlements.filter((s) => s.from === user?.id || s.to === user?.id);
    const others = settlements.filter((s) => s.from !== user?.id && s.to !== user?.id);
    return { mySettlements: mine, otherSettlements: others };
  }, [settlements, user?.id]);

  const settleUpSummary = useMemo(() => {
    if (settlements.length === 0) return { text: "All settled ✓", color: "text-emerald-600" };
    const iOwe = settlements.filter((s) => s.from === user?.id).reduce((sum, s) => sum + s.amount, 0);
    const owedToMe = settlements.filter((s) => s.to === user?.id).reduce((sum, s) => sum + s.amount, 0);
    if (iOwe > 0.005) return { text: `You owe ${formatCurrency(iOwe, settlementCurrency)}`, color: "text-amber-600" };
    if (owedToMe > 0.005) return { text: `Awaiting ${formatCurrency(owedToMe, settlementCurrency)}`, color: "text-emerald-600" };
    return { text: "All settled ✓", color: "text-emerald-600" };
  }, [settlements, user?.id, settlementCurrency]);

  const usedCurrencies = useMemo(() => {
    return [...new Set(expenses.map((e) => e.currency))];
  }, [expenses]);

  const groupedExpenses = useMemo(() => {
    const groups = new Map<string, ExpenseRow[]>();
    expenses.forEach((exp) => {
      const date = exp.incurred_on;
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date)!.push(exp);
    });
    return Array.from(groups.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => ({
        date,
        items: [...items].sort((a, b) => b.created_at.localeCompare(a.created_at)),
      }));
  }, [expenses]);

  const { totalExpenses, nonSettlementCount } = useMemo(() => {
    let total = 0;
    let count = 0;
    for (const exp of expenses) {
      if (exp.category === "settlement") continue;
      count++;
      if (exp.currency === settlementCurrency) {
        total += exp.amount;
      } else if (rates && rates[exp.currency]) {
        total += exp.amount / rates[exp.currency];
      } else {
        total += exp.amount;
      }
    }
    return { totalExpenses: count > 0 ? total : null, nonSettlementCount: count };
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

      {/* Hero summary card */}
      {canShowBalances && expenses.length > 0 && (
        <div className="rounded-xl border bg-card p-5 text-center">
          {heroData.type === "settled" ? (
            <div className="flex flex-col items-center gap-1">
              <CheckCircle2 className="h-8 w-8 text-[#0D9488]" />
              <p className="text-lg font-bold text-[#0D9488] mt-1">All settled up ✓</p>
            </div>
          ) : heroData.type === "owe" ? (
            <>
              <p className="text-2xl font-bold text-[#EF4444]">
                You owe {formatCurrency(heroData.amount, settlementCurrency)}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">{heroData.subline}</p>
              <Button
                size="sm"
                className="mt-3 h-8 gap-1.5 text-xs bg-[#0D9488] hover:bg-[#0D9488]/90"
                onClick={() => setSettleOpen(true)}
              >
                Settle up
              </Button>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-[#0D9488]">
                You're owed {formatCurrency(heroData.amount, settlementCurrency)}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">{heroData.subline}</p>
            </>
          )}
        </div>
      )}

      {/* Balances & Settle Up — wait for rates */}
      {!canShowBalances ? (
        <div className="rounded-xl border bg-card p-3 space-y-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Balances</span>
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-36" />
          <p className="text-xs text-muted-foreground">Loading exchange rates…</p>
        </div>
      ) : (
        <>
          {/* Balances section — collapsed by default */}
          {balances.length > 0 && (
            <Collapsible open={balancesOpen} onOpenChange={setBalancesOpen}>
              <div className="rounded-xl border bg-card p-3 space-y-2">
                <CollapsibleTrigger asChild>
                  <button className="flex w-full flex-col gap-1 text-left">
                    <div className="flex w-full items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${balancesOpen ? "rotate-90" : ""}`} />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Balances</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{balances.length}</Badge>
                      </div>
                    </div>
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
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <BalancesSummary balances={balances} currency={settlementCurrency} />
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}

          {/* Settle Up section — collapsed by default */}
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
                <CollapsibleTrigger asChild>
                  <button className="flex w-full flex-col gap-1 text-left">
                    <div className="flex w-full items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${settleOpen ? "rotate-90" : ""}`} />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Settle Up</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{settlements.length}</Badge>
                      </div>
                    </div>
                    {!settleOpen && (
                      <p className={`text-xs pl-6 font-medium ${settleUpSummary.color}`}>
                        {settleUpSummary.text}
                      </p>
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  {/* My settlements (prominent) */}
                  {mySettlements.length > 0 && (
                    <SettleUpSection
                      settlements={mySettlements}
                      currency={settlementCurrency}
                      settlementProgress={settlementProgress.filter((p) =>
                        mySettlements.some((s) => `${s.from}→${s.to}` === p.pairKey)
                      )}
                      totalSettledOverall={totalSettledOverall}
                      onSettle={(data) => addExpense.mutate(data as any)}
                    />
                  )}
                  {/* Third-party settlements (de-emphasised) */}
                  {otherSettlements.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-muted">
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                        Between others
                      </p>
                      <div className="space-y-1">
                        {otherSettlements.map((s, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between text-xs text-muted-foreground px-1 py-1"
                          >
                            <span className="truncate">
                              {s.fromName} → {s.toName}
                            </span>
                            <span className="whitespace-nowrap ml-2">
                              {formatCurrency(s.amount, settlementCurrency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}
        </>
      )}

      {/* Expenses section — open by default */}
      <Collapsible open={expensesOpen} onOpenChange={setExpensesOpen}>
        <div className="rounded-xl border bg-card p-3 space-y-2">
          <CollapsibleTrigger asChild>
            <button className="flex w-full flex-col gap-1 text-left">
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-2">
                  <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expensesOpen ? "rotate-90" : ""}`} />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Expenses</span>
                  {expenses.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{expenses.length}</Badge>
                  )}
                </div>
              </div>
              {!expensesOpen && totalExpenses !== null && (
                <p className="text-xs text-muted-foreground pl-6">
                  Total: {formatCurrency(totalExpenses, settlementCurrency)}
                </p>
              )}
            </button>
          </CollapsibleTrigger>
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
                          isNew={newItemIds?.has(exp.id)}
                          onEdit={(e) => { setEditingExpense(e); setFormOpen(true); }}
                          onDelete={(id) => deleteExpense.mutate(id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {/* Total footer */}
                {totalExpenses !== null && (
                  <p className="text-xs text-muted-foreground text-center pt-3 border-t border-muted mt-3">
                    Total: {formatCurrency(totalExpenses, settlementCurrency)} across {nonSettlementCount} expense{nonSettlementCount !== 1 ? "s" : ""}
                  </p>
                )}
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
