import { useState, useMemo, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { trackEvent } from "@/lib/analytics";
import { Skeleton } from "@/components/ui/skeleton";
import { useExpenses, ExpenseRow } from "@/hooks/useExpenses";
import { useAuth } from "@/contexts/AuthContext";
import { calcNetBalances, calcSettlements, convertAmount, formatCurrency } from "@/lib/settlementCalc";
import { SettlementCurrencyPicker } from "./SettlementCurrencyPicker";
import { BalancesSummary } from "./BalancesSummary";
import { SettleUpSection, SettlementProgress } from "./SettleUpSection";
import { ExpenseCard } from "./ExpenseCard";
import { ExpenseFormModal } from "./ExpenseFormModal";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Plus, AlertTriangle, Loader2, ChevronRight, CheckCircle2, Info, RotateCcw, Camera, Upload, Sparkles, Users, Download, Settings2, WifiOff, Receipt, Scan, Wallet } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { ShareInviteModal } from "@/components/ShareInviteModal";
import { ItineraryCrossLinkDrawer } from "./ItineraryCrossLinkDrawer";
import { toast } from "sonner";
import { friendlyErrorMessage } from "@/lib/supabaseErrors";

interface Props {
  tripId: string;
  myRole?: string;
  newItemIds?: Set<string>;
}

export function ExpensesTab({ tripId, myRole, newItemIds }: Props) {
  const location = useLocation();
  const { user } = useAuth();
  const {
    expenses, splits, members, settlementCurrency, rates, ratesFetchedAtMs,
    ratesError, ratesStale, ratesEmpty, ratesLoading, refreshingRates, refreshRates,
    cachedCurrencyCodes, itineraryItems, isLoading, isError, refetch,
    isFetchingExpenses, isExpensesSuccess,
    updateSettlementCurrency, addExpense, updateExpense, deleteExpense,
  } = useExpenses(tripId);

  const { data: trip } = useQuery({
    queryKey: ["trip", tripId],
    queryFn: async () => {
      const { data, error } = await supabase.from("trips").select("name, emoji, tentative_start_date, tentative_end_date, trip_code, share_permission").eq("id", tripId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!tripId,
  });

  const [inviteOpen, setInviteOpen] = useState(false);
  const isOnline = useOnlineStatus();

  const allSameCurrency = useMemo(
    () => expenses.every((e) => e.currency === settlementCurrency),
    [expenses, settlementCurrency]
  );
  const canShowBalances = !ratesLoading || allSameCurrency || Object.keys(rates).length > 0;

  const [formOpen, setFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRow | null>(null);
  const [balancesOpen, setBalancesOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  
  const [scanning, setScanning] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);
  const receiptCameraRef = useRef<HTMLInputElement>(null);
  const receiptFileRef = useRef<HTMLInputElement>(null);

  // Cross-link prompt state for receipt-scanned expenses
  const [crossLinkData, setCrossLinkData] = useState<{
    expenseId: string; title: string; date: string; amount: number; currency: string; category: string;
  } | null>(null);
  const lastScanWasReceipt = useRef(false);

  // Handle prefill from itinerary cost detection
  useEffect(() => {
    const state = location.state as { prefillExpense?: { title: string; amount: number; currency: string; date: string; itineraryItemId?: string } } | null;
    if (state?.prefillExpense) {
      const p = state.prefillExpense;
      setEditingExpense({
        id: "",
        title: p.title,
        amount: p.amount,
        currency: p.currency,
        category: "activities",
        payer_id: user?.id || "",
        trip_id: tripId,
        incurred_on: p.date,
        notes: null,
        itinerary_item_id: p.itineraryItemId || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as ExpenseRow);
      setFormOpen(true);
      window.history.replaceState({}, "");
    }
  }, [location.state]);

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
      trackEvent("ai_receipt_scan", { success: true });
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
      lastScanWasReceipt.current = true;
      setFormOpen(true);
      toast.success("Receipt scanned - review the details");
    } catch (err: any) {
      toast.error(friendlyErrorMessage(err, "Failed to scan receipt"));
      trackEvent("ai_receipt_scan", { success: false });
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

  // "You paid" and "Your share" stats for the hero card
  const myStats = useMemo(() => {
    const nonSettlement = expenses.filter((e) => e.category !== "settlement");
    const totalPaid = nonSettlement
      .filter((e) => e.payer_id === user?.id)
      .reduce((sum, e) => {
        const converted = convertAmount(e.amount, e.currency, settlementCurrency, settlementCurrency, rates, { fx_rate: e.fx_rate, fx_base: e.fx_base });
        return sum + (converted ?? 0);
      }, 0);
    const myShare = nonSettlement.reduce((sum, e) => {
      const mySplit = splits.find((s) => s.expense_id === e.id && s.user_id === user?.id);
      if (!mySplit) return sum;
      const converted = convertAmount(mySplit.share_amount, e.currency, settlementCurrency, settlementCurrency, rates, { fx_rate: e.fx_rate, fx_base: e.fx_base });
      return sum + (converted ?? 0);
    }, 0);
    return { totalPaid, myShare };
  }, [expenses, splits, user?.id, settlementCurrency, rates]);

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
      const converted = convertAmount(exp.amount, exp.currency, settlementCurrency, settlementCurrency, rates, { fx_rate: exp.fx_rate, fx_base: exp.fx_base });
      if (converted != null) total += converted;
      // else: rates unavailable for this currency - skip from total
    }
    return { totalExpenses: count > 0 ? total : null, nonSettlementCount: count };
  }, [expenses, settlementCurrency, rates]);

  const editingSplits = editingExpense
    ? splits.filter((s) => s.expense_id === editingExpense.id).map((s) => ({
        user_id: s.user_id,
        share_amount: s.share_amount,
      }))
    : undefined;

  // Skeletons ONLY on the very first load (no cached data anywhere). After data has been
  // seen once, background refetches (window focus, realtime invalidations) keep the prior
  // content visible — never replace it with skeletons.
  if (isLoading) {
    return (
      <div className="space-y-4">
        {/* Hero card skeleton — uses the real teal gradient with translucent placeholders */}
        <div
          className="relative overflow-hidden py-6 text-center mx-0"
          style={{
            background: "linear-gradient(150deg, #0f766e 0%, #0D9488 45%, #0891b2 100%)",
            borderRadius: 20,
            boxShadow: "0 6px 20px rgba(13,148,136,0.20)",
          }}
        >
          <div className="flex flex-col items-center gap-1.5">
            <div className="h-2.5 w-16 rounded bg-white/20 animate-pulse" />
            <div className="h-9 w-48 rounded-lg bg-white/15 mt-1 animate-pulse" />
            <div className="h-5 w-24 rounded-full bg-white/10 mt-1 animate-pulse" />
            <div className="h-8 w-24 rounded-lg bg-white/15 mt-2 animate-pulse" />
            <div className="flex justify-center gap-3 mt-3">
              <div className="bg-white/10 rounded-xl w-[120px] h-[52px] animate-pulse" />
              <div className="bg-white/10 rounded-xl w-[120px] h-[52px] animate-pulse" />
            </div>
          </div>
        </div>

        {/* Balances row skeleton */}
        <div className="flex items-center justify-between px-1 py-1.5">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3.5 w-3.5" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-3 w-24" />
        </div>

        {/* Add Expense button skeleton */}
        <Skeleton className="h-12 w-full rounded-2xl" />

        {/* Expense list card skeleton */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "rgba(255,255,255,0.7)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.8)",
            boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
          }}
        >
          <div className="px-4 py-3 flex items-center justify-between">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-32" />
          </div>
          <div style={{ background: "rgba(0,0,0,0.02)", padding: "6px 16px", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
            <Skeleton className="h-2.5 w-20" />
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
              <Skeleton className="h-9 w-9 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-3/5" />
                <Skeleton className="h-2.5 w-2/5" />
              </div>
              <div className="space-y-1.5 text-right">
                <Skeleton className="h-2.5 w-14 ml-auto" />
                <Skeleton className="h-3.5 w-24 ml-auto" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-4">
        <AlertTriangle className="h-10 w-10 text-muted-foreground/60" />
        <div>
          <p className="text-base font-semibold text-foreground">Couldn't load expenses</p>
          <p className="text-sm text-muted-foreground mt-1">Something went wrong. Please try again.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!isOnline && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          <span>You're offline — showing last synced data. Balances may be out of date.</span>
        </div>
      )}
      {/* Balance hero - teal gradient card */}
      {canShowBalances && expenses.length > 0 && (
        <div
          className="relative overflow-hidden py-6 text-center mx-0"
          style={{
            background: "linear-gradient(150deg, #0f766e 0%, #0D9488 45%, #0891b2 100%)",
            borderRadius: 20,
            boxShadow: "0 6px 20px rgba(13,148,136,0.20)",
          }}
        >
          {/* Settings overflow - top right of hero */}
          <div className="absolute top-3 right-3 z-20">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-7 w-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                  <Settings2 className="h-3.5 w-3.5 text-white/60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Settlement currency</DropdownMenuLabel>
                <div className="px-2 py-1.5">
                  <SettlementCurrencyPicker
                    value={settlementCurrency}
                    onChange={(c) => updateSettlementCurrency.mutate(c)}
                    cachedCurrencyCodes={cachedCurrencyCodes}
                  />
                </div>
                {expenses.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={csvLoading}
                      onClick={async () => {
                        setCsvLoading(true);
                        try {
                          const session = (await supabase.auth.getSession()).data.session;
                          const res = await fetch(
                            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-expenses-csv?trip_id=${tripId}`,
                            { headers: { Authorization: `Bearer ${session?.access_token}` } }
                          );
                          if (!res.ok) throw new Error("Export failed");
                          const blob = await res.blob();
                          trackEvent("export_downloaded", { trip_id: tripId, format: "csv" }, user?.id);
                          const a = document.createElement("a");
                          const objUrl = URL.createObjectURL(blob);
                          a.href = objUrl;
                          a.download = "expenses.csv";
                          a.click();
                          URL.revokeObjectURL(objUrl);
                        } catch {
                          toast.error("Failed to export CSV");
                        } finally {
                          setCsvLoading(false);
                        }
                      }}
                    >
                      {csvLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                      Download CSV
                    </DropdownMenuItem>
                  </>
                )}
                {!allSameCurrency && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={refreshingRates}
                      onClick={() => refreshRates()}
                    >
                      {refreshingRates ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                      Refresh exchange rates
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Glass shine overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.0) 50%, rgba(255,255,255,0.05) 100%)",
            }}
          />

          {members.length <= 1 ? (
            <div className="relative flex flex-col items-center gap-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">Total spent</p>
              <p className="text-[34px] font-extrabold text-white tracking-tight leading-none mt-1">
                {totalExpenses != null ? formatCurrency(totalExpenses, settlementCurrency) : "€0.00"}
              </p>
              <button
                onClick={() => setInviteOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 hover:bg-white/25 px-4 py-2 text-[12px] font-semibold text-white/70 transition-colors"
              >
                <Users className="h-3.5 w-3.5" />
                Invite friends to split
              </button>
            </div>
          ) : heroData.type === "settled" ? (
            <div className="relative flex flex-col items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">Balance</p>
              <CheckCircle2 className="h-10 w-10 text-white" />
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/60">
                <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                All settled
              </span>
            </div>
          ) : heroData.type === "owe" ? (
            <div className="relative">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">You owe</p>
              <p className="text-[34px] font-extrabold text-white tracking-tight leading-none mt-1.5">
                {formatCurrency(heroData.amount, settlementCurrency)}
              </p>
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-orange-400/15 px-2.5 py-1 text-[11px] font-semibold text-orange-200">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-300" />
                {heroData.subline}
              </span>
              <div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3 h-8 px-4 text-[12px] bg-white/15 hover:bg-white/25 text-white border-0"
                  onClick={() => setSettleOpen(true)}
                >
                  Settle up
                </Button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">You're owed</p>
              <p className="text-[34px] font-extrabold text-white tracking-tight leading-none mt-1.5">
                {formatCurrency(heroData.amount, settlementCurrency)}
              </p>
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                {heroData.subline}
              </span>
              {settlements.length > 0 && (
                <div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-3 h-8 px-4 text-[12px] bg-white/15 hover:bg-white/25 text-white border-0"
                    onClick={() => setSettleOpen(true)}
                  >
                    Settle up
                  </Button>
                </div>
              )}
            </div>
          )}

          {members.length > 1 && (myStats.totalPaid > 0.005 || myStats.myShare > 0.005) && (
            <div className="relative flex justify-center gap-3 mt-5 px-4">
              <div className="bg-white/10 rounded-xl px-4 py-2.5 text-center min-w-[120px]">
                <p className="text-[10px] uppercase tracking-wider font-medium text-white/40 mb-1">You paid</p>
                <p className="text-[15px] font-bold text-white tabular-nums">
                  {formatCurrency(myStats.totalPaid, settlementCurrency)}
                </p>
              </div>
              <div className="bg-white/10 rounded-xl px-4 py-2.5 text-center min-w-[120px]">
                <p className="text-[10px] uppercase tracking-wider font-medium text-white/40 mb-1">Your share</p>
                <p className="text-[15px] font-bold text-white tabular-nums">
                  {formatCurrency(myStats.myShare, settlementCurrency)}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Balances - compact collapsible, de-emphasized */}
      {members.length > 1 && canShowBalances && balances.length > 0 && (
        <Collapsible open={balancesOpen} onOpenChange={setBalancesOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex w-full items-center justify-between px-1 py-1.5 text-left">
              <div className="flex items-center gap-1.5">
                <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground/50 transition-transform ${balancesOpen ? "rotate-90" : ""}`} />
                <span className="text-[12px] font-medium text-muted-foreground">Balances</span>
              </div>
              {!balancesOpen && myBalance && (
                <span className="text-[12px] font-medium">
                  {myBalance.balance > 0.005
                    ? <span style={{ color: "#0D9488" }}>+{formatCurrency(myBalance.balance, settlementCurrency)}</span>
                    : myBalance.balance < -0.005
                    ? <span style={{ color: "#EF4444" }}>−{formatCurrency(Math.abs(myBalance.balance), settlementCurrency)}</span>
                    : <span className="text-muted-foreground/60">Settled</span>
                  }
                </span>
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="rounded-xl bg-muted/30 px-3.5 py-3 mt-1">
              <BalancesSummary
                balances={balances}
                currency={settlementCurrency}
                expenses={expenses}
                splits={splits}
                members={members}
                rates={rates}
                ratesFetchedAtMs={ratesFetchedAtMs}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {members.length > 1 && !canShowBalances && (
        <div className="flex items-center gap-2 px-1 py-1.5">
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/50" />
          <span className="text-[12px] text-muted-foreground/60">Checking exchange rates…</span>
        </div>
      )}

      {/* Settle Up - shown as a sheet/drawer, triggered from hero button */}
      {members.length > 1 && settlements.length > 0 && settleOpen && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "rgba(255,255,255,0.7)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.8)",
            boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
          }}
        >
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.18em]">Settle Up</span>
              <button
                onClick={() => setSettleOpen(false)}
                className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
              >
                Hide
              </button>
            </div>
            {mySettlements.length > 0 && (
              <SettleUpSection
                settlements={mySettlements}
                currency={settlementCurrency}
                settlementProgress={settlementProgress.filter((p) =>
                  mySettlements.some((s) => `${s.from}→${s.to}` === p.pairKey)
                )}
                totalSettledOverall={totalSettledOverall}
                onSettle={(data) => addExpense.mutate({ ...data, trip_id: tripId, split_type: "equal" } as any)}
              />
            )}
            {otherSettlements.length > 0 && (
              <div className="mt-3 pt-2" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.18em] mb-1.5">
                  Between others
                </p>
                <div className="space-y-1">
                  {otherSettlements.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-xs text-muted-foreground px-1 py-1">
                      <span className="truncate">{s.fromName} → {s.toName}</span>
                      <span className="whitespace-nowrap ml-2">{formatCurrency(s.amount, settlementCurrency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty-state hero — shown when there are zero expenses */}
      {expenses.length === 0 && isExpensesSuccess ? (
        <div className="px-1 pt-2 pb-4">
          {/* Hero card */}
          <div className="relative overflow-hidden rounded-2xl border border-[#0D9488]/15 bg-gradient-to-br from-[#0D9488]/[0.06] via-background to-background p-6">
            <div className="pointer-events-none absolute -top-16 -right-16 h-44 w-44 rounded-full bg-[#0D9488]/15 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-[#0D9488]/10 blur-3xl" />

            <div className="relative flex flex-col items-center text-center">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#0D9488]/25 bg-background/70 backdrop-blur px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#0D9488]">
                <Sparkles className="h-3 w-3" />
                Powered by Junto AI
              </div>

              <h2 className="mt-4 text-[22px] font-semibold tracking-tight text-foreground leading-tight">
                Split costs,<br />
                <span className="text-[#0D9488]">skip the awkward maths</span>
              </h2>
              <p className="mt-2 max-w-[300px] text-[13.5px] leading-relaxed text-muted-foreground">
                Snap a receipt or add an expense. Junto handles the splits, currency conversion and who-owes-who for the whole crew.
              </p>

              {/* Primary CTAs */}
              <div className="mt-5 grid w-full max-w-xs grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={scanning}
                  onClick={() => receiptCameraRef.current?.click()}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-[#0D9488] py-3 text-[13.5px] font-semibold text-white shadow-[0_6px_20px_-6px_rgba(13,148,136,0.5)] transition-transform active:scale-[0.97] disabled:opacity-60"
                >
                  {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  Scan receipt
                </button>
                <button
                  type="button"
                  disabled={scanning}
                  onClick={() => receiptFileRef.current?.click()}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-[#0D9488]/30 bg-background py-3 text-[13.5px] font-semibold text-[#0D9488] transition-colors hover:bg-[#0D9488]/[0.06] active:scale-[0.97] disabled:opacity-60"
                >
                  <Upload className="h-4 w-4" />
                  Upload photo
                </button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground/80">JPG, PNG, HEIC · screenshots work too</p>
            </div>
          </div>

          {/* Benefit list */}
          <ul className="mt-6 space-y-2.5 px-2">
            {[
              { icon: Scan, title: "Receipts read instantly", desc: "Merchant, amount, date and currency, pulled out automatically." },
              { icon: Users, title: "Fair splits, every time", desc: "Equal, custom or item-by-item. Toggle who's in for each expense." },
              { icon: Wallet, title: "One settle-up at the end", desc: "Multi-currency totals net down to the fewest payments possible." },
            ].map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/50 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0D9488]/10">
                  <Icon className="h-4 w-4 text-[#0D9488]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground leading-tight">{title}</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground leading-snug">{desc}</p>
                </div>
              </li>
            ))}
          </ul>

          {/* Secondary manual CTA */}
          <div className="mt-6 flex flex-col items-center gap-1.5">
            <p className="text-[11.5px] uppercase tracking-[0.14em] text-muted-foreground/60">No receipt handy?</p>
            <button
              type="button"
              onClick={() => { setEditingExpense(null); setFormOpen(true); }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:border-foreground/30 hover:bg-muted/50 active:scale-[0.97]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add expense manually
            </button>
          </div>

          {/* Hidden receipt inputs */}
          <input ref={receiptCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleReceiptScan} />
          <input ref={receiptFileRef} type="file" accept="image/*" className="hidden" onChange={handleReceiptScan} />
        </div>
      ) : (
        <Button
          className="w-full h-12 gap-2 text-[15px] font-semibold rounded-2xl"
          onClick={() => { setEditingExpense(null); setFormOpen(true); }}
        >
          <Plus className="h-4.5 w-4.5" />
          Add Expense
        </Button>
      )}

      {/* Expenses list - standalone */}
      <div
        className="rounded-2xl overflow-hidden relative"
        style={{
          background: "rgba(255,255,255,0.7)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.8)",
          boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
        }}
      >
        {/* Subtle top-edge refetch indicator */}
        {isFetchingExpenses && expenses.length > 0 && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary/20 overflow-hidden z-10">
            <div className="h-full w-1/3 bg-primary/40 rounded-full" style={{ animation: "shimmer 1.5s ease-in-out infinite" }} />
          </div>
        )}
        {expenses.length === 0 && isExpensesSuccess ? (
          <div className="text-center py-8 space-y-1 px-4">
            <p className="text-muted-foreground text-[14px]">No expenses yet</p>
            <p className="text-xs text-muted-foreground">
              Tap "Add Expense" to start tracking costs
            </p>
          </div>
        ) : expenses.length === 0 && isLoading ? (
          /* Still fetching — show inline skeleton rows */
          <div>
            <div className="px-4 py-3 flex items-center justify-between">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-32" />
            </div>
            <div style={{ background: "rgba(0,0,0,0.02)", padding: "6px 16px", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
              <Skeleton className="h-2.5 w-20" />
            </div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/5" />
                  <Skeleton className="h-2.5 w-2/5" />
                </div>
                <div className="space-y-1.5 text-right">
                  <Skeleton className="h-2.5 w-14 ml-auto" />
                  <Skeleton className="h-3.5 w-24 ml-auto" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div>
            {/* Header */}
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.18em]">
                Expenses
              </span>
              <span className="text-[11px] text-muted-foreground/60">
                {nonSettlementCount} expense{nonSettlementCount !== 1 ? "s" : ""}
                {!ratesLoading && totalExpenses !== null && ` · ${formatCurrency(totalExpenses, settlementCurrency)}`}
              </span>
            </div>
            {groupedExpenses.map(({ date, items }) => (
              <div key={date}>
                <div
                  style={{
                    background: "rgba(0,0,0,0.02)",
                    padding: "6px 16px",
                    borderBottom: "1px solid rgba(0,0,0,0.04)",
                  }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: "rgba(0,0,0,0.35)" }}>
                    {(() => {
                      const [y, m, d] = date.split("-").map(Number);
                      return format(new Date(y, m - 1, d), "EEE d MMM");
                    })()}
                  </p>
                </div>
                <div>
                  {items.map((exp) => (
                    <ExpenseCard
                      key={exp.id}
                      expense={exp}
                      splits={splits.filter((s) => s.expense_id === exp.id)}
                      members={members}
                      myRole={myRole}
                      tripId={tripId}
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
          </div>
        )}
        {!ratesLoading && ratesEmpty && !allSameCurrency && (
          <p className="text-xs text-center text-muted-foreground py-2">
            Some amounts couldn't be converted - exchange rates unavailable
          </p>
        )}
      </div>


      <ExpenseFormModal
        open={formOpen}
        onOpenChange={(open) => { setFormOpen(open); if (!open) setEditingExpense(null); }}
        tripId={tripId}
        members={members}
        settlementCurrency={settlementCurrency}
        itineraryItems={itineraryItems}
        usedCurrencies={usedCurrencies}
        editingExpense={editingExpense}
        editingSplits={editingSplits}
        onSave={async (data) => {
          const isReceiptScan = lastScanWasReceipt.current && !data.id;
          lastScanWasReceipt.current = false;
          if (data.id) {
            await updateExpense.mutateAsync(data as any);
          } else {
            const result = await addExpense.mutateAsync({ ...data, trip_id: tripId } as any);
            // After saving a receipt-scanned expense, offer cross-link if we have title + date
            if (isReceiptScan && data.title && data.incurred_on) {
              // Need to get the new expense id - fetch the latest expense matching
              const { data: latest } = await supabase
                .from("expenses")
                .select("id")
                .eq("trip_id", tripId)
                .eq("title", data.title)
                .eq("incurred_on", data.incurred_on)
                .order("created_at", { ascending: false })
                .limit(1)
                .single();
              if (latest?.id) {
                setCrossLinkData({
                  expenseId: latest.id,
                  title: data.title,
                  date: data.incurred_on,
                  amount: data.amount,
                  currency: data.currency,
                  category: data.category,
                });
              }
            }
          }
        }}
      />

      {trip && (
        <ShareInviteModal
          tripId={tripId}
          tripName={trip.name}
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          isAdmin={myRole === "owner" || myRole === "admin"}
          trip={trip}
        />
      )}

      {crossLinkData && (
        <ItineraryCrossLinkDrawer
          open={!!crossLinkData}
          onOpenChange={(open) => { if (!open) setCrossLinkData(null); }}
          tripId={tripId}
          expenseId={crossLinkData.expenseId}
          title={crossLinkData.title}
          date={crossLinkData.date}
          amount={crossLinkData.amount}
          currency={crossLinkData.currency}
          category={crossLinkData.category}
        />
      )}
    </div>
  );
}
