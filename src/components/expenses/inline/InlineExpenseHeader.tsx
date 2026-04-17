import { useMemo, useState } from "react";
import { format, parse } from "date-fns";
import { ExpenseRow, SplitRow, MemberProfile } from "@/hooks/useExpenses";
import { useExpenseInlineEdit, recomputeSplits } from "@/hooks/useExpenseInlineEdit";
import { formatCurrency } from "@/lib/settlementCalc";
import { Input } from "@/components/ui/input";
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
  /** Global edit mode — when false, all fields render as static text. */
  editMode: boolean;
  /** When true, header amount is read-only (calculated from line items) */
  hasLineItems: boolean;
  cachedCurrencyCodes: string[];
}

/**
 * Compact metadata grid shown below the collapsed expense row.
 * Static by default; becomes click-to-edit when `editMode` is true.
 */
export function InlineExpenseHeader({
  expense, splits, members, tripId, editMode, hasLineItems, cachedCurrencyCodes,
}: Props) {
  const { patchExpense, replaceSplits } = useExpenseInlineEdit(tripId);

  const payerName = members.find((m) => m.userId === expense.payer_id)?.displayName || "Unknown";
  const categoryLabel = CATEGORIES.find((c) => c.value === expense.category)?.label || "Other";

  const splitMode: "equal" | "custom" | "byItem" = useMemo(() => {
    if (hasLineItems) return "byItem";
    if (splits.length <= 1) return "equal";
    const first = splits[0].share_amount;
    const allEqual = splits.every((s) => Math.abs(s.share_amount - first) < 0.01);
    return allEqual ? "equal" : "custom";
  }, [splits, hasLineItems]);

  const [titleDraft, setTitleDraft] = useState(expense.title);
  const [amountDraft, setAmountDraft] = useState(String(expense.amount));
  const [notesDraft, setNotesDraft] = useState(expense.notes || "");
  const [notesExpanded, setNotesExpanded] = useState(false);

  return (
    <div className="space-y-1.5">
      {/* Title — full, no truncation. Editable in edit mode. */}
      {editMode ? (
        <Row label="Title" fullWidth>
          <EditableField
            showAffordance
            display={<span className="text-sm font-medium break-words">{expense.title}</span>}
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
        </Row>
      ) : (
        <p className="text-sm font-medium text-foreground break-words leading-snug">{expense.title}</p>
      )}

      {/* Compact 2-column label/value grid */}
      <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5">
        {/* Amount */}
        <Row label="Amount">
          {hasLineItems ? (
            <span className="text-sm tabular-nums text-muted-foreground" title="Calculated from items">
              {formatCurrency(expense.amount, expense.currency)}
            </span>
          ) : !editMode ? (
            <span className="text-sm tabular-nums">{formatCurrency(expense.amount, expense.currency)}</span>
          ) : (
            <EditableField
              showAffordance
              display={<span className="text-sm tabular-nums">{formatCurrency(expense.amount, expense.currency)}</span>}
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
        </Row>

        {/* Currency */}
        <Row label="Currency">
          {editMode ? (
            <div className="bg-muted/50 border-b border-border/80 px-1 -mx-1 rounded-sm">
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
            </div>
          ) : (
            <span className="text-sm">{expense.currency}</span>
          )}
        </Row>

        {/* Category */}
        <Row label="Category">
          {editMode ? (
            <Select
              value={expense.category}
              onValueChange={async (v) => {
                if (v === expense.category) return;
                await patchExpense.mutateAsync({ id: expense.id, patch: { category: v } });
              }}
            >
              <SelectTrigger className="h-6 text-sm w-auto gap-1 border-0 border-b border-border/80 bg-muted/50 hover:bg-muted px-1 -mx-1 py-0 shadow-none focus:ring-0 rounded-sm">
                <SelectValue>{categoryLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-sm">{categoryLabel}</span>
          )}
        </Row>

        {/* Date */}
        <Row label="Date">
          <DateCell
            value={expense.incurred_on}
            canEdit={editMode}
            onChange={async (iso) => {
              if (iso === expense.incurred_on) return;
              await patchExpense.mutateAsync({ id: expense.id, patch: { incurred_on: iso } });
            }}
          />
        </Row>

        {/* Paid by */}
        <Row label="Paid by">
          {editMode ? (
            <Select
              value={expense.payer_id}
              onValueChange={async (v) => {
                if (v === expense.payer_id) return;
                await patchExpense.mutateAsync({ id: expense.id, patch: { payer_id: v } });
              }}
            >
              <SelectTrigger className="h-6 text-sm w-auto gap-1 border-0 border-b border-border/80 bg-muted/50 hover:bg-muted px-1 -mx-1 py-0 shadow-none focus:ring-0 rounded-sm">
                <SelectValue>{payerName}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => <SelectItem key={m.userId} value={m.userId}>{m.displayName}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-sm">{payerName}</span>
          )}
        </Row>

        {/* Split */}
        <Row label="Split">
          {splitMode === "byItem" ? (
            <span className="text-sm">By items</span>
          ) : !editMode ? (
            <span className="text-sm capitalize">{splitMode}</span>
          ) : (
            <SplitModeToggle
              mode={splitMode}
              onChange={async (next) => {
                if (next === splitMode) return;
                const ids = splits.length > 0 ? splits.map((s) => s.user_id) : members.map((m) => m.userId);
                const recomputed = recomputeSplits(next, ids, expense.amount, splits);
                await replaceSplits.mutateAsync({ expenseId: expense.id, splits: recomputed });
              }}
            />
          )}
        </Row>
      </dl>

      {/* Notes — full width, always truncated to 1 line, expandable on tap */}
      {(expense.notes || editMode) && (
        <div className="pt-1">
          {editMode ? (
            <EditableField
              showAffordance
              display={
                expense.notes ? (
                  <span className="text-sm text-muted-foreground italic block truncate">{expense.notes}</span>
                ) : (
                  <span className="text-sm text-muted-foreground/60 italic">Add a note…</span>
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
          ) : expense.notes ? (
            <button
              type="button"
              onClick={() => setNotesExpanded((v) => !v)}
              className={cn(
                "text-sm text-muted-foreground italic text-left w-full",
                !notesExpanded && "truncate block",
              )}
            >
              {expense.notes}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Cells ───────────────────────── */

function Row({ label, children, fullWidth }: { label: string; children: React.ReactNode; fullWidth?: boolean }) {
  return (
    <div className={cn("flex flex-col min-w-0 gap-0.5", fullWidth && "col-span-2")}>
      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</dt>
      <dd className="min-w-0 text-foreground">{children}</dd>
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

  if (!canEdit) return <span className="text-sm">{display}</span>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="text-sm text-foreground bg-muted/50 border-b border-border/80 hover:bg-muted px-1 -mx-1 py-0.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          {display}
        </button>
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

function SplitModeToggle({ mode, onChange }: { mode: "equal" | "custom"; onChange: (m: "equal" | "percent" | "custom") => void }) {
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
            onClick={() => onChange(o.v)}
            className={cn(
              "px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors",
              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
