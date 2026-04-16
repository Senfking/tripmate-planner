import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { LineItemRow, ClaimRow, useLineItemClaims } from "@/hooks/useLineItemClaims";
import { useExpenseInlineEdit } from "@/hooks/useExpenseInlineEdit";
import { MemberProfile } from "@/hooks/useExpenses";
import { calculateLineItemTotals } from "@/lib/expenseLineItems";
import { formatCurrency } from "@/lib/settlementCalc";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X, Check, Link2, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { EditableField, useAutoFocus, useEditorKeys } from "./EditableField";

function claimQty(c: ClaimRow): number {
  return typeof c.claimed_quantity === "number" ? c.claimed_quantity : 1;
}
function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

interface Props {
  expenseId: string;
  tripId: string;
  members: MemberProfile[];
  currency: string;
  totalAmount: number;
  lineItems: LineItemRow[];
  claims: ClaimRow[];
  /** Whether the current user can edit/delete items (payer/admin/owner). */
  canEdit: boolean;
  /** Global edit mode toggle — gates rename/price/delete affordances. */
  editMode: boolean;
  toggleClaim: (id: string) => void;
  setClaimQuantity: (id: string, qty: number) => Promise<void>;
  isToggling: boolean;
}

/**
 * Editable replacement for LineItemClaimList. Each line item row supports
 * inline rename / qty / price edits and delete-with-undo. A "+ Add item"
 * row sits at the bottom. Per-person totals recalc instantly via
 * useLineItemClaims.recalcSplits().
 */
export function InlineLineItemList({
  expenseId, tripId, members, currency, totalAmount,
  lineItems, claims, canEdit, editMode, toggleClaim, setClaimQuantity, isToggling,
}: Props) {
  const { user } = useAuth();
  const { updateLineItem, deleteLineItem } = useLineItemClaims(expenseId, tripId);
  const { addLineItem } = useExpenseInlineEdit(tripId);
  const [adding, setAdding] = useState(false);

  const claimsByItemId = new Map<string, ClaimRow[]>();
  for (const c of claims) {
    claimsByItemId.set(c.line_item_id, [...(claimsByItemId.get(c.line_item_id) ?? []), c]);
  }

  const { totals: perPersonTotals, sharedTotal } = calculateLineItemTotals({
    lineItems,
    memberIds: members.map((m) => m.userId),
    totalAmount,
    getAssigneeIds: (item) => (claimsByItemId.get(item.id) ?? []).map((c) => c.user_id),
    getClaimQuantity: (item, userId) => {
      const claim = (claimsByItemId.get(item.id) ?? []).find((c) => c.user_id === userId);
      return claim ? claimQty(claim) : 0;
    },
  });

  const claimableItems = lineItems.filter((li) => !li.is_shared);
  const sharedItems = lineItems.filter((li) => li.is_shared);

  /** Delete with 3s undo toast that re-creates the line item if the user undoes. */
  const handleDelete = async (item: LineItemRow) => {
    // Snapshot the row + its claims so we can restore on undo
    const itemSnapshot = { ...item };
    const claimSnapshot = (claimsByItemId.get(item.id) ?? []).map((c) => ({ ...c }));

    let undone = false;
    await deleteLineItem.mutateAsync(item.id);

    toast(`Removed "${item.name}"`, {
      action: {
        label: "Undo",
        onClick: async () => {
          undone = true;
          try {
            const { data: restored, error } = await supabase
              .from("expense_line_items")
              .insert({
                expense_id: itemSnapshot.expense_id,
                name: itemSnapshot.name,
                quantity: itemSnapshot.quantity,
                unit_price: itemSnapshot.unit_price,
                total_price: itemSnapshot.total_price,
                is_shared: itemSnapshot.is_shared,
              } as any)
              .select("id")
              .single();
            if (error) throw error;
            // Re-create claims pointing at the new line item id
            if (claimSnapshot.length > 0 && restored) {
              await supabase.from("expense_line_item_claims").insert(
                claimSnapshot.map((c) => ({
                  line_item_id: restored.id,
                  user_id: c.user_id,
                  claimed_quantity: c.claimed_quantity,
                })),
              );
            }
            toast.success("Restored");
          } catch (e: any) {
            toast.error(e?.message || "Couldn't restore item");
          }
        },
      },
      duration: 3000,
    });

    // Best-effort: when toast expires we don't need to do anything since delete already ran.
    void undone;
  };

  return (
    <div className="space-y-3">
      {claimableItems.length > 0 && (
        <>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.15em]">
            Items
          </p>
          <ul className="space-y-1.5">
            {claimableItems.map((item) => (
              <LineItemRowEditable
                key={item.id}
                item={item}
                claims={claimsByItemId.get(item.id) ?? []}
                members={members}
                currency={currency}
                currentUserId={user?.id}
                canEdit={canEdit}
                isToggling={isToggling}
                onRename={async (name) => {
                  if (!name.trim() || name === item.name) return false;
                  try { await updateLineItem.mutateAsync({ id: item.id, name: name.trim() }); return true; }
                  catch { return false; }
                }}
                onChangeQty={async (q) => {
                  if (!Number.isFinite(q) || q <= 0 || q === item.quantity) return false;
                  try { await updateLineItem.mutateAsync({ id: item.id, quantity: q }); return true; }
                  catch { return false; }
                }}
                onChangeUnitPrice={async (p) => {
                  if (!Number.isFinite(p) || p < 0) return false;
                  if (Math.abs(p - item.unit_price) < 0.005) return false;
                  try { await updateLineItem.mutateAsync({ id: item.id, unit_price: p }); return true; }
                  catch { return false; }
                }}
                onDelete={() => handleDelete(item)}
                onToggleClaim={() => toggleClaim(item.id)}
                onSetClaimQty={(q) => setClaimQuantity(item.id, q)}
              />
            ))}
          </ul>
        </>
      )}

      {/* Shared cost rows are still shown but read-only here (auto-detected) */}
      {sharedItems.length > 0 && Math.abs(sharedTotal) > 0.005 && (
        <div className="rounded-lg border border-border bg-muted/30 px-2.5 py-2 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Link2 className="h-3.5 w-3.5 text-primary shrink-0" />
              <p className="text-[12px] font-medium truncate">Taxes & service (auto-split)</p>
            </div>
            <span className="text-[12px] font-semibold tabular-nums shrink-0">
              {formatCurrency(sharedTotal, currency)}
            </span>
          </div>
        </div>
      )}

      {/* + Add item */}
      {canEdit && (
        adding ? (
          <AddItemRow
            currency={currency}
            onCancel={() => setAdding(false)}
            onSave={async (name, qty, unit) => {
              try {
                await addLineItem.mutateAsync({ expenseId, name, quantity: qty, unitPrice: unit });
                setAdding(false);
              } catch { /* toast handled in mutation */ }
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline min-h-[44px] sm:min-h-0 w-full justify-start py-2"
          >
            <Plus className="h-3.5 w-3.5" /> Add item
          </button>
        )
      )}

      {/* Per-person summary */}
      <div className="rounded-lg bg-muted/50 p-2.5 space-y-1">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
          Per person total
        </p>
        {members.map((m) => {
          const total = perPersonTotals[m.userId] || 0;
          if (total < 0.005) return null;
          return (
            <div key={m.userId} className="flex items-center justify-between text-xs gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Avatar className="h-4 w-4">
                  {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt={m.displayName} />}
                  <AvatarFallback className="text-[7px] bg-primary/10 text-primary">{getInitials(m.displayName)}</AvatarFallback>
                </Avatar>
                <span className="text-muted-foreground truncate">
                  {m.displayName}{m.userId === user?.id ? " (You)" : ""}
                </span>
              </div>
              <span className="font-medium tabular-nums shrink-0">{formatCurrency(total, currency)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────── Single editable row ───────────────────────── */

function LineItemRowEditable({
  item, claims, members, currency, currentUserId, canEdit, isToggling,
  onRename, onChangeQty, onChangeUnitPrice, onDelete, onToggleClaim, onSetClaimQty,
}: {
  item: LineItemRow;
  claims: ClaimRow[];
  members: MemberProfile[];
  currency: string;
  currentUserId: string | undefined;
  canEdit: boolean;
  isToggling: boolean;
  onRename: (name: string) => Promise<boolean>;
  onChangeQty: (q: number) => Promise<boolean>;
  onChangeUnitPrice: (p: number) => Promise<boolean>;
  onDelete: () => void;
  onToggleClaim: () => void;
  onSetClaimQty: (q: number) => Promise<void>;
}) {
  const [nameDraft, setNameDraft] = useState(item.name);
  const [qtyDraft, setQtyDraft] = useState(String(item.quantity));
  const [priceDraft, setPriceDraft] = useState(String(item.unit_price));

  const isMultiQty = item.quantity > 1;
  const myClaim = claims.find((c) => c.user_id === currentUserId);
  const myQty = myClaim ? claimQty(myClaim) : 0;
  const otherClaims = claims.filter((c) => c.user_id !== currentUserId && claimQty(c) > 0);
  const totalClaimed = claims.reduce((s, c) => s + claimQty(c), 0);
  const remaining = Math.max(0, item.quantity - totalClaimed);
  const maxClaimable = myQty + remaining;
  const isClaimed = !isMultiQty && claims.some((c) => c.user_id === currentUserId);

  return (
    <li className={cn(
      "group/item rounded-lg border px-2.5 py-1.5 space-y-1 transition-colors",
      isClaimed || myQty > 0 ? "border-primary/40 bg-primary/[0.04]" : "border-border",
    )}>
      <div className="flex items-start gap-2">
        {/* Mine toggle for single-qty items */}
        {!isMultiQty && (
          <button
            type="button"
            disabled={isToggling}
            onClick={onToggleClaim}
            className={cn(
              "shrink-0 mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium transition-all border min-h-[24px]",
              isClaimed
                ? "bg-primary/15 text-primary border-primary/30"
                : "bg-muted text-muted-foreground border-border hover:border-primary/30 hover:text-primary",
            )}
          >
            {isClaimed ? "✓ Mine" : "Mine"}
          </button>
        )}

        <div className="flex-1 min-w-0 space-y-0.5">
          {/* Name */}
          <EditableField
            readOnly={!canEdit}
            display={
              <span className="text-[13px] font-medium truncate">
                {isMultiQty && (
                  <EditableQty
                    value={item.quantity}
                    canEdit={canEdit}
                    onCommit={onChangeQty}
                  />
                )}
                {item.name}
              </span>
            }
            editor={({ commit, cancel }) => (
              <NameEditor value={nameDraft} onChange={setNameDraft} onCommit={commit} onCancel={cancel} />
            )}
            onCommit={() => onRename(nameDraft)}
            ariaLabel="Edit item name"
          />
          {isMultiQty && (
            <p className="text-[10px] text-muted-foreground">
              <EditablePrice
                value={item.unit_price}
                currency={currency}
                canEdit={canEdit}
                onCommit={onChangeUnitPrice}
                suffix=" each"
              />
            </p>
          )}
        </div>

        {/* Total price (read-only — derived from qty × unit) */}
        <span className="text-[12px] font-semibold tabular-nums shrink-0 mt-0.5">
          {!isMultiQty ? (
            <EditablePrice
              value={item.unit_price}
              currency={currency}
              canEdit={canEdit}
              onCommit={onChangeUnitPrice}
            />
          ) : (
            formatCurrency(item.total_price, currency)
          )}
        </span>

        {/* Delete X */}
        {canEdit && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Remove ${item.name}`}
            className="shrink-0 -mr-1 -mt-0.5 h-7 w-7 sm:h-6 sm:w-6 inline-flex items-center justify-center rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 sm:opacity-0 sm:group-hover/item:opacity-100 focus:opacity-100 transition-opacity"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Multi-qty stepper */}
      {isMultiQty && (
        <div className="flex items-center justify-between gap-2 pl-0">
          <div className="flex items-center rounded-lg border border-border overflow-hidden shrink-0">
            <button
              type="button"
              disabled={myQty <= 0}
              onClick={() => onSetClaimQty(Math.max(0, myQty - 1))}
              className={cn(
                "h-8 w-9 flex items-center justify-center transition-colors",
                myQty <= 0 ? "text-muted-foreground/30 cursor-not-allowed" : "text-foreground hover:bg-muted active:bg-muted/80",
              )}
              aria-label="Decrease claim"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className={cn(
              "h-8 w-8 flex items-center justify-center text-[13px] font-semibold tabular-nums border-x border-border bg-background",
              myQty > 0 ? "text-primary" : "text-muted-foreground",
            )}>{myQty}</span>
            <button
              type="button"
              disabled={myQty >= maxClaimable}
              onClick={() => onSetClaimQty(Math.min(maxClaimable, myQty + 1))}
              className={cn(
                "h-8 w-9 flex items-center justify-center transition-colors",
                myQty >= maxClaimable ? "text-muted-foreground/30 cursor-not-allowed" : "text-foreground hover:bg-muted active:bg-muted/80",
              )}
              aria-label="Increase claim"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <span className={cn(
            "text-[10px] tabular-nums whitespace-nowrap",
            remaining === 0 ? "text-muted-foreground" : "text-primary",
          )}>
            {remaining === 0 ? `All ${item.quantity} claimed` : `${remaining} of ${item.quantity} unclaimed`}
          </span>
        </div>
      )}

      {/* Other claimers */}
      {otherClaims.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {otherClaims.map((c) => {
            const m = members.find((mm) => mm.userId === c.user_id);
            return (
              <div key={c.id} className="flex items-center gap-1">
                <Avatar className="h-4 w-4 border border-background">
                  {m?.avatarUrl && <AvatarImage src={m.avatarUrl} alt={m.displayName} />}
                  <AvatarFallback className="text-[7px] bg-primary/10 text-primary">{getInitials(m?.displayName || "?")}</AvatarFallback>
                </Avatar>
                <span className="text-[10px] text-muted-foreground">
                  {m?.displayName?.split(" ")[0] || "?"}{isMultiQty ? `: ${claimQty(c)}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </li>
  );
}

/* ───────────────────────── Tiny editor primitives ───────────────────────── */

function NameEditor({ value, onChange, onCommit, onCancel }: { value: string; onChange: (v: string) => void; onCommit: () => void; onCancel: () => void }) {
  const ref = useAutoFocus<HTMLInputElement>();
  const onKeyDown = useEditorKeys(onCommit, onCancel);
  return (
    <Input
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={onKeyDown}
      className="h-7 text-[13px] py-0 px-1.5"
    />
  );
}

function EditableQty({ value, canEdit, onCommit }: { value: number; canEdit: boolean; onCommit: (q: number) => Promise<boolean> }) {
  const [draft, setDraft] = useState(String(value));
  return (
    <EditableField
      readOnly={!canEdit}
      display={<span>{value}× </span>}
      editor={({ commit, cancel }) => (
        <NumberEditor value={draft} onChange={setDraft} onCommit={commit} onCancel={cancel} width="w-12" />
      )}
      onCommit={() => onCommit(parseInt(draft, 10))}
      ariaLabel="Edit quantity"
    />
  );
}

function EditablePrice({ value, currency, canEdit, onCommit, suffix = "" }: { value: number; currency: string; canEdit: boolean; onCommit: (p: number) => Promise<boolean>; suffix?: string }) {
  const [draft, setDraft] = useState(String(value));
  return (
    <EditableField
      readOnly={!canEdit}
      display={<span className="tabular-nums">{formatCurrency(value, currency)}{suffix}</span>}
      editor={({ commit, cancel }) => (
        <NumberEditor value={draft} onChange={setDraft} onCommit={commit} onCancel={cancel} width="w-20" step="0.01" />
      )}
      onCommit={() => onCommit(parseFloat(draft))}
      ariaLabel="Edit price"
    />
  );
}

function NumberEditor({ value, onChange, onCommit, onCancel, width, step }: { value: string; onChange: (v: string) => void; onCommit: () => void; onCancel: () => void; width: string; step?: string }) {
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
      className={cn("h-7 text-[13px] py-0 px-1.5 tabular-nums", width)}
    />
  );
}

/* ───────────────────────── Add new line item ───────────────────────── */

function AddItemRow({ currency, onSave, onCancel }: { currency: string; onSave: (name: string, qty: number, unitPrice: number) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const nameRef = useAutoFocus<HTMLInputElement>();

  const canSave = name.trim().length > 0 && parseFloat(price) > 0 && parseInt(qty, 10) > 0;
  const submit = () => {
    if (!canSave) return;
    onSave(name.trim(), parseInt(qty, 10), parseFloat(price));
  };

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/[0.03] p-2 flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
      <Input
        ref={nameRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Item name"
        className="h-9 text-[13px] flex-1 min-w-[140px]"
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") onCancel(); }}
      />
      <Input
        type="number"
        inputMode="numeric"
        min={1}
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        className="h-9 text-[13px] w-14 tabular-nums"
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") onCancel(); }}
        aria-label="Quantity"
      />
      <Input
        type="number"
        inputMode="decimal"
        step="0.01"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder={`Price (${currency})`}
        className="h-9 text-[13px] w-24 tabular-nums"
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") onCancel(); }}
      />
      <Button type="button" size="sm" disabled={!canSave} onClick={submit} className="h-9 w-9 p-0 shrink-0" aria-label="Save item">
        <Check className="h-4 w-4" />
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel} className="h-9 w-9 p-0 shrink-0" aria-label="Cancel">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
