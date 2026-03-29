import { useState, useMemo } from "react";
import { useExpenses, ExpenseRow } from "@/hooks/useExpenses";
import { useAuth } from "@/contexts/AuthContext";
import { calcNetBalances, calcSettlements } from "@/lib/settlementCalc";
import { SettlementCurrencyPicker } from "./SettlementCurrencyPicker";
import { BalancesSummary } from "./BalancesSummary";
import { SettleUpSection } from "./SettleUpSection";
import { ExpenseCard } from "./ExpenseCard";
import { ExpenseFormModal } from "./ExpenseFormModal";
import { Button } from "@/components/ui/button";
import { Plus, AlertTriangle, Loader2 } from "lucide-react";

interface Props {
  tripId: string;
  myRole?: string;
}

export function ExpensesTab({ tripId, myRole }: Props) {
  const { user } = useAuth();
  const {
    expenses, splits, members, settlementCurrency, rates, ratesError,
    itineraryItems, isLoading, updateSettlementCurrency, addExpense,
    updateExpense, deleteExpense,
  } = useExpenses(tripId);

  const [formOpen, setFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRow | null>(null);

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
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <SettlementCurrencyPicker
          value={settlementCurrency}
          onChange={(c) => updateSettlementCurrency.mutate(c)}
        />
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => { setEditingExpense(null); setFormOpen(true); }}>
          <Plus className="h-3.5 w-3.5" /> Add Expense
        </Button>
      </div>

      {/* Rate warning */}
      {ratesError && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Exchange rates unavailable — showing amounts in original currencies
        </div>
      )}

      {/* Balances */}
      <BalancesSummary balances={balances} settlements={settlements} currency={settlementCurrency} />

      {/* Expense list */}
      {expenses.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-muted-foreground text-sm">No expenses yet</p>
          <p className="text-xs text-muted-foreground">
            Tap "Add Expense" to start tracking costs
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {expenses.map((exp) => (
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
      )}

      <ExpenseFormModal
        open={formOpen}
        onOpenChange={(open) => { setFormOpen(open); if (!open) setEditingExpense(null); }}
        members={members}
        settlementCurrency={settlementCurrency}
        itineraryItems={itineraryItems}
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
