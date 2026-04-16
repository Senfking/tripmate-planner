import { useMemo, useState } from "react";
import { format, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { ExpenseRow, SplitRow, MemberProfile } from "@/hooks/useExpenses";
import { useExpenseInlineEdit, recomputeSplits } from "@/hooks/useExpenseInlineEdit";
import { formatCurrency } from "@/lib/settlementCalc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyPicker } from "../CurrencyPicker";
import { cn } from "@/lib/utils";
import { EditableField, useAutoFocus, useEditorKeys } from "./EditableField";

const CATEGORIES = [
  { value: "food", label: "Food & Drink" },
  { value: "transport", label: "Transport" },
  { value: "accommodation", label: "Accommodation" },
  { value: "activities", label: "Activities" },
  { value: "shopping", label: "Shopping" },
  { value: "settlement", label: "Settlement" },
  { value: "other", label: "Other" },
];

interface Props {
  expense: ExpenseRow;
  splits: SplitRow[];
  members: MemberProfile[];
  tripId: string;
  canEdit: boolean;
  /** When true, header amount is read-only (calculated from line items) */
  hasLineItems: boolean;
  cachedCurrencyCodes: string[];
}

/**
 * Inline-editable detail strip below the collapsed expense row.
 * Each cell is an EditableField — click to edit, save on blur/Enter,
 * brief checkmark flash on success.
 */
export function InlineExpenseHeader({
  expense, splits, members, tripId, canEdit, hasLineItems, cachedCurrencyCodes,
}: Props) {
  const { patchExpense, replaceSplits } = useExpenseInlineEdit(tripId);

  const payerName = members.find((m) => m.userId === expense.payer_id)?.displayName || "Unknown";
  const categoryLabel = CATEGORIES.find((c) => c.value === expense.category)?.label || "Other";

  // Detect current split mode
  const splitMode: "equal" | "custom" | "byItem" = useMemo(() => {
    if (hasLineItems) return "byItem";
    if (splits.length <= 1) return "equal";
    const first = splits[0].share_amount;
    const allEqual = splits.every((s) => Math.abs(s.share_amount - first) < 0.01);
    return allEqual ? "equal" : "custom";
  }, [splits, hasLineItems]);

  /* ── Drafts ── */
  const [titleDraft, setTitleDraft] = useState(expense.title);
  const [amountDraft, setAmountDraft] = useState(String(expense.amount));
  const [notesDraft, setNotesDraft] = useState(expense.notes || "");

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
      {/* Title */}
      <Cell label="Title" full>
        <EditableField
          readOnly={!canEdit}
          display={<span className="text-[13px] font-medium">{expense.title}</span>}
          editor={({ commit, cancel }) => (
            <TextEditor value={titleDraft} onChange={setTitleDraft} onCommit={commit} onCancel={cancel} className="w-full" />
          )}
          onCommit={async () => {
            const v = titleDraft.trim();
            if (!v || v === expense.title) { setTitleDraft(expense.title); return false; }
            try { await patchExpense.mutateAsync({ id: expense.id, patch: { title: v } }); return true; }
            catch { setTitleDraft(expense.title); return false; }
          }}
          ariaLabel="Edit title"
          className="w-full"
        />
      </Cell>

      {/* Amount */}
      <Cell label="Amount">
        {hasLineItems ? (
          <span className="inline-flex flex-col">
            <span className="text-[13px] font-semibold tabular-nums">
              {formatCurrency(expense.amount, expense.currency)}
            </span>
            <span className="text-[10px] text-muted-foreground italic">Calculated from items</span>
          </span>
        ) : (
          <EditableField
            readOnly={!canEdit}
            display={<span className="text-[13px] font-semibold tabular-nums">{formatCurrency(expense.amount, expense.currency)}</span>}
            editor={({ commit, cancel }) => (
              <NumberEditor value={amountDraft} onChange={setAmountDraft} onCommit={commit} onCancel={cancel} step="0.01" />
            )}
            onCommit={async () => {
              const v = parseFloat(amountDraft);
              if (!Number.isFinite(v) || v <= 0 || Math.abs(v - expense.amount) < 0.005) {
                setAmountDraft(String(expense.amount));
                return false;
              }
              try {
                await patchExpense.mutateAsync({ id: expense.id, patch: { amount: v } });
                // Re-balance splits proportionally to keep them valid
                if (splits.length > 0) {
                  const next = recomputeSplits(splitMode === "byItem" ? "equal" : splitMode, splits.map(s => s.user_id), v, splits);
                  await replaceSplits.mutateAsync({ expenseId: expense.id, splits: next });
                }
                return true;
              } catch { setAmountDraft(String(expense.amount)); return false; }
            }}
            ariaLabel="Edit amount"
          />
        )}
      </Cell>

      {/* Currency */}
      <Cell label="Currency">
        {canEdit ? (
          <CurrencyPicker
            value={expense.currency}
            cachedCurrencyCodes={cachedCurrencyCodes}
            suggestedCodes={[expense.currency]}
            variant="settlement"
            onChange={async (c) => {
              if (c === expense.currency) return;
              await patchExpense.mutateAsync({ id: expense.id, patch: { currency: c } });
            }}
          />
        ) : (
          <span className="text-[13px]">{expense.currency}</span>
        )}
      </Cell>

      {/* Category */}
      <Cell label="Category">
        {canEdit ? (
          <Select
            value={expense.category}
            onValueChange={async (v) => {
              if (v === expense.category) return;
              await patchExpense.mutateAsync({ id: expense.id, patch: { category: v } });
            }}
          >
            <SelectTrigger className="h-8 text-[13px] w-auto min-w-[140px] gap-1 border-0 bg-transparent hover:bg-primary/5 px-2">
              <SelectValue>{categoryLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-[13px]">{categoryLabel}</span>
        )}
      </Cell>

      {/* Date */}
      <Cell label="Date">
        <DateCell
          value={expense.incurred_on}
          canEdit={canEdit}
          onChange={async (iso) => {
            if (iso === expense.incurred_on) return;
            await patchExpense.mutateAsync({ id: expense.id, patch: { incurred_on: iso } });
          }}
        />
      </Cell>

      {/* Paid by */}
      <Cell label="Paid by">
        {canEdit ? (
          <Select
            value={expense.payer_id}
            onValueChange={async (v) => {
              if (v === expense.payer_id) return;
              await patchExpense.mutateAsync({ id: expense.id, patch: { payer_id: v } });
            }}
          >
            <SelectTrigger className="h-8 text-[13px] w-auto min-w-[140px] gap-1 border-0 bg-transparent hover:bg-primary/5 px-2">
              <SelectValue>{payerName}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {members.map((m) => <SelectItem key={m.userId} value={m.userId}>{m.displayName}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-[13px]">{payerName}</span>
        )}
      </Cell>

      {/* Split mode */}
      <Cell label="Split">
        {splitMode === "byItem" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium">
            By items
          </span>
        ) : (
          <SplitModeToggle
            mode={splitMode}
            disabled={!canEdit}
            onChange={async (next) => {
              if (next === splitMode) return;
              const ids = splits.length > 0 ? splits.map((s) => s.user_id) : members.map((m) => m.userId);
              const recomputed = recomputeSplits(next, ids, expense.amount, splits);
              await replaceSplits.mutateAsync({ expenseId: expense.id, splits: recomputed });
            }}
          />
        )}
      </Cell>

      {/* Notes */}
      <Cell label="Notes" full>
        <EditableField
          readOnly={!canEdit}
          display={
            expense.notes ? (
              <span className="text-[12px] text-muted-foreground italic">{expense.notes}</span>
            ) : (
              <span className="text-[12px] text-muted-foreground/60">Add a note…</span>
            )
          }
          editor={({ commit, cancel }) => (
            <TextEditor value={notesDraft} onChange={setNotesDraft} onCommit={commit} onCancel={cancel} className="w-full" placeholder="Notes" />
          )}
          onCommit={async () => {
            const v = notesDraft.trim();
            if ((expense.notes || "") === v) return false;
            try { await patchExpense.mutateAsync({ id: expense.id, patch: { notes: v || null as any } }); return true; }
            catch { setNotesDraft(expense.notes || ""); return false; }
          }}
          ariaLabel="Edit notes"
          className="w-full"
        />
      </Cell>
    </div>
  );
}

/* ───────────────────────── Cells ───────────────────────── */

function Cell({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={cn("flex items-baseline gap-2 min-w-0", full && "sm:col-span-2")}>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 shrink-0 w-16">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function TextEditor({ value, onChange, onCommit, onCancel, className, placeholder }: { value: string; onChange: (v: string) => void; onCommit: () => void; onCancel: () => void; className?: string; placeholder?: string }) {
  const ref = useAutoFocus<HTMLInputElement>();
  const onKeyDown = useEditorKeys(onCommit, onCancel);
  return (
    <Input
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className={cn("h-8 text-[13px] py-0 px-2", className)}
    />
  );
}

function NumberEditor({ value, onChange, onCommit, onCancel, step }: { value: string; onChange: (v: string) => void; onCommit: () => void; onCancel: () => void; step?: string }) {
  const ref = useAutoFocus<HTMLInputElement>();
  const onKeyDown = useEditorKeys(onCommit, onCancel);
  return (
    <Input
      ref={ref}
      type="number"
      inputMode="decimal"
      step={step}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={onKeyDown}
      className="h-8 text-[13px] py-0 px-2 w-28 tabular-nums"
    />
  );
}

function DateCell({ value, canEdit, onChange }: { value: string; canEdit: boolean; onChange: (iso: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const date = parse(value, "yyyy-MM-dd", new Date());
  const display = format(date, "MMM d, yyyy");

  if (!canEdit) return <span className="text-[13px]">{display}</span>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 px-2 text-[13px] gap-1.5 hover:bg-primary/5 -mx-2">
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          {display}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date}
          onSelect={async (d) => {
            if (!d) return;
            setOpen(false);
            await onChange(format(d, "yyyy-MM-dd"));
          }}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}

function SplitModeToggle({ mode, disabled, onChange }: { mode: "equal" | "custom"; disabled?: boolean; onChange: (m: "equal" | "percent" | "custom") => void }) {
  const opts: { v: "equal" | "percent" | "custom"; label: string }[] = [
    { v: "equal", label: "Equal" },
    { v: "percent", label: "%" },
    { v: "custom", label: "Custom" },
  ];
  return (
    <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40">
      {opts.map((o) => {
        const active = o.v === mode;
        return (
          <button
            key={o.v}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.v)}
            className={cn(
              "px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors min-h-[28px]",
              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              disabled && "opacity-60 cursor-not-allowed",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
