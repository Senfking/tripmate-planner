import { useState, useMemo, useRef } from "react";
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
import { Plus, AlertTriangle, Loader2, ChevronRight, CheckCircle2, Info, RotateCcw, Camera, Upload, Sparkles } from "lucide-react";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  tripId: string;
  myRole?: string;
  newItemIds?: Set<string>;
}

export function ExpensesTab({ tripId, myRole, newItemIds }: Props) {
  const { user } = useAuth();
  const {
    expenses, splits, members, settlementCurrency, rates, ratesFetchedAt,
    ratesError, ratesStale, ratesEmpty, ratesLoading, refreshingRates, refreshRates,
    cachedCurrencyCodes, itineraryItems, isLoading, updateSettlementCurrency,
    addExpense, updateExpense, deleteExpense,
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
  const [scanning, setScanning] = useState(false);
  const receiptCameraRef = useRef<HTMLInputElement>(null);
  const receiptFileRef = useRef<HTMLInputElement>(null);

  const handleReceiptScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setScanning(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(file);
      });
      const { data, error } = await supabase.functions.invoke("scan-receipt", {
        body: { image: base64 },
      });
      if (error || data?.error) throw new Error(data?.message || "Scan failed");
      // Pre-fill the expense form with scanned data
      const scanned = data?.result || data;
      setEditingExpense({
        id: "",
        title: scanned.title || scanned.merchant || "",
        amount: scanned.amount || 0,
        currency: scanned.currency || settlementCurrency,
        category: scanned.category || "other",
        payer_id: user?.id || "",
        trip_id: tripId,
        incurred_on: scanned.date || new Date().toISOString().slice(0, 10),
        notes: scanned.notes || null,
        itinerary_item_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as ExpenseRow);
      setFormOpen(true);
      toast.success("Receipt scanned — review the details");
    } catch (err: any) {
      toast.error(err.message || "Failed to scan receipt");
    } finally {
      setScanning(false);
    }
  };

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
        // rates unavailable for this currency — skip from total
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
    <div className="space-y-5">
      {/* Toolbar — frosted glass pill */}
      <div
        className="flex items-center justify-between gap-2 mx-0 px-4 py-2.5"
        style={{
          background: "rgba(255,255,255,0.6)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.8)",
          borderRadius: 14,
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        <SettlementCurrencyPicker
          value={settlementCurrency}
          onChange={(c) => updateSettlementCurrency.mutate(c)}
          cachedCurrencyCodes={cachedCurrencyCodes}
        />
        <Button size="sm" className="h-9 gap-1.5 px-4 text-[13px]" onClick={() => { setEditingExpense(null); setFormOpen(true); }}>
          <Plus className="h-3.5 w-3.5" /> Add Expense
        </Button>
      </div>

      {/* Balance hero — frosted glass card */}
      {canShowBalances && expenses.length > 0 && (
        <div
          className="py-6 text-center mx-0"
          style={{
            background: "rgba(255,255,255,0.6)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.8)",
            borderRadius: 20,
            boxShadow: "0 4px 24px rgba(13,148,136,0.08)",
          }}
        >
          {heroData.type === "settled" ? (
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">All settled</p>
              <CheckCircle2 className="h-10 w-10" style={{ color: "#0D9488" }} />
            </div>
          ) : heroData.type === "owe" ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">You owe</p>
              <p className="text-[42px] font-bold leading-none mt-1" style={{ color: "#EF4444" }}>
                {formatCurrency(heroData.amount, settlementCurrency)}
              </p>
              <p className="text-sm text-muted-foreground mt-2">{heroData.subline}</p>
              <Button
                size="sm"
                className="mt-4 h-9 px-5 text-[13px]"
                onClick={() => setSettleOpen(true)}
              >
                Settle up
              </Button>
            </>
          ) : (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">You're owed</p>
              <p className="text-[42px] font-bold leading-none mt-1" style={{ color: "#0D9488" }}>
                {formatCurrency(heroData.amount, settlementCurrency)}
              </p>
              <p className="text-sm text-muted-foreground mt-2">{heroData.subline}</p>
            </>
          )}
        </div>
      )}

      {/* Balances / Settle Up / Expenses — frosted glass card */}
      <div
        className="mx-0 overflow-hidden"
        style={{
          background: "rgba(255,255,255,0.7)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.8)",
          borderRadius: 20,
          boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
        }}
      >
      {!canShowBalances ? (
        <div className="space-y-2 px-4 py-3">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.18em]">Balances</span>
          <div className="flex items-center gap-2 py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Checking exchange rates…</span>
          </div>
        </div>
      ) : (
        <>
          {/* Balances section */}
          {balances.length > 0 && (
            <Collapsible open={balancesOpen} onOpenChange={setBalancesOpen}>
              <div className="space-y-2 relative px-4 py-3">
                <CollapsibleTrigger asChild>
                  <button className="flex w-full flex-col gap-0.5 text-left">
                    <div className="flex w-full items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${balancesOpen ? "rotate-90" : ""}`} />
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.18em]">Balances</span>
                      </div>
                    </div>
                    {!balancesOpen && myBalance && (
                      <p className="text-[13px] pl-6">
                        {myBalance.balance > 0.005
                          ? <span style={{ color: "#0D9488" }} className="font-medium">You are owed {formatCurrency(myBalance.balance, settlementCurrency)}</span>
                          : myBalance.balance < -0.005
                          ? <span style={{ color: "#EF4444" }} className="font-medium">You owe {formatCurrency(Math.abs(myBalance.balance), settlementCurrency)}</span>
                          : <span className="text-muted-foreground">All settled</span>
                        }
                      </p>
                    )}
                  </button>
                </CollapsibleTrigger>
                {!allSameCurrency && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 absolute top-3 right-3"
                    onClick={(e) => { e.stopPropagation(); refreshRates(); }}
                    disabled={refreshingRates}
                  >
                    {refreshingRates
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      : <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />}
                  </Button>
                )}
                <CollapsibleContent>
                  <div className="mt-2 border-t border-border/40 pt-2">
                  <BalancesSummary
                    balances={balances}
                    currency={settlementCurrency}
                    expenses={expenses}
                    splits={splits}
                    members={members}
                    rates={rates}
                    ratesFetchedAt={ratesFetchedAt}
                  />
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}

          {/* Settle Up section — collapsed by default */}
          {settlements.length === 0 ? (
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.18em]">Settle Up</span>
              <span className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: "#0D9488" }}>
                <CheckCircle2 className="h-3 w-3" />
                All settled
              </span>
            </div>
          ) : (
            <Collapsible open={settleOpen} onOpenChange={setSettleOpen}>
              <div className="space-y-2">
                <CollapsibleTrigger asChild>
                  <button className="flex w-full flex-col gap-0.5 text-left">
                    <div className="flex w-full items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${settleOpen ? "rotate-90" : ""}`} />
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.18em]">Settle Up</span>
                      </div>
                    </div>
                    {!settleOpen && (
                      <p className={`text-[13px] pl-6 font-medium ${settleUpSummary.color}`}>
                        {settleUpSummary.text}
                      </p>
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 border-t border-border/40 pt-2">
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
                    <div className="mt-3 pt-2 border-t border-border/40">
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.18em] mb-1.5">
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
        <div className="space-y-2">
          <CollapsibleTrigger asChild>
            <button className="flex w-full flex-col gap-0.5 text-left">
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-2">
                  <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expensesOpen ? "rotate-90" : ""}`} />
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.18em]">Expenses</span>
                  {expenses.length > 0 && (
                    <span className="text-[11px] text-muted-foreground/60">{nonSettlementCount} expense{nonSettlementCount !== 1 ? "s" : ""}</span>
                  )}
                </div>
              </div>
              {!expensesOpen && !ratesLoading && totalExpenses !== null && (
                <p className="text-[13px] text-muted-foreground pl-6">
                  Total: {formatCurrency(totalExpenses, settlementCurrency)}
                </p>
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 border-t border-border/40 pt-1">
            {expenses.length === 0 ? (
              <div className="text-center py-8 space-y-1">
                <p className="text-muted-foreground text-[14px]">No expenses yet</p>
                <p className="text-xs text-muted-foreground">
                  Tap "Add Expense" to start tracking costs
                </p>
              </div>
            ) : (
              <div>
                {groupedExpenses.map(({ date, items }) => (
                  <div key={date}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60 py-2 mt-2 first:mt-0">
                      {format(parseISO(date), "EEE d MMM")}
                    </p>
                    <div className="divide-y divide-border/40">
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
                {!ratesLoading && totalExpenses !== null && (
                  <p className="text-[12px] text-muted-foreground text-center pt-4 mt-2">
                    Total {formatCurrency(totalExpenses, settlementCurrency)} · {nonSettlementCount} expense{nonSettlementCount !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            )}
          {!ratesLoading && ratesEmpty && !allSameCurrency && (
            <p className="text-xs text-center text-muted-foreground py-2">
              Some amounts couldn't be converted — exchange rates unavailable
            </p>
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
