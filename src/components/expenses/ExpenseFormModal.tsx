import { useState, useEffect, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/AuthContext";
import { MemberProfile, ExpenseRow } from "@/hooks/useExpenses";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";

const CATEGORIES = [
  { value: "food", label: "Food & Drink" },
  { value: "transport", label: "Transport" },
  { value: "accommodation", label: "Accommodation" },
  { value: "activities", label: "Activities" },
  { value: "shopping", label: "Shopping" },
  { value: "other", label: "Other" },
];

const COMMON_CURRENCIES = ["EUR", "USD", "GBP", "CHF", "THB", "JPY", "AUD", "SGD"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: MemberProfile[];
  settlementCurrency: string;
  itineraryItems: { id: string; title: string; day_date: string }[];
  editingExpense?: ExpenseRow | null;
  editingSplits?: { user_id: string; share_amount: number }[];
  onSave: (data: {
    id?: string;
    title: string;
    amount: number;
    currency: string;
    category: string;
    incurred_on: string;
    payer_id: string;
    notes?: string;
    itinerary_item_id?: string | null;
    splits: { user_id: string; share_amount: number }[];
  }) => void;
}

export function ExpenseFormModal({
  open, onOpenChange, members, settlementCurrency,
  itineraryItems, editingExpense, editingSplits, onSave,
}: Props) {
  const isMobile = useIsMobile();
  const { user } = useAuth();

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(settlementCurrency);
  const [category, setCategory] = useState("other");
  const [incurredOn, setIncurredOn] = useState(format(new Date(), "yyyy-MM-dd"));
  const [payerId, setPayerId] = useState(user?.id || "");
  const [notes, setNotes] = useState("");
  const [itineraryItemId, setItineraryItemId] = useState<string>("none");
  const [splitMode, setSplitMode] = useState<"equal" | "custom">("equal");
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      if (editingExpense) {
        setTitle(editingExpense.title);
        setAmount(String(editingExpense.amount));
        setCurrency(editingExpense.currency);
        setCategory(editingExpense.category || "other");
        setIncurredOn(editingExpense.incurred_on);
        setPayerId(editingExpense.payer_id);
        setNotes(editingExpense.notes || "");
        setItineraryItemId(editingExpense.itinerary_item_id || "none");
        if (editingSplits) {
          setSelectedMembers(new Set(editingSplits.map((s) => s.user_id)));
          const allEqual = editingSplits.length > 1 &&
            editingSplits.every((s) => Math.abs(s.share_amount - editingSplits[0].share_amount) < 0.01);
          setSplitMode(allEqual ? "equal" : "custom");
          if (!allEqual) {
            setCustomAmounts(Object.fromEntries(editingSplits.map((s) => [s.user_id, String(s.share_amount)])));
          }
        }
      } else {
        setTitle("");
        setAmount("");
        setCurrency(settlementCurrency);
        setCategory("other");
        setIncurredOn(format(new Date(), "yyyy-MM-dd"));
        setPayerId(user?.id || "");
        setNotes("");
        setItineraryItemId("none");
        setSplitMode("equal");
        setSelectedMembers(new Set(members.map((m) => m.userId)));
        setCustomAmounts({});
      }
    }
  }, [open, editingExpense, editingSplits, members, settlementCurrency, user?.id]);

  const parsedAmount = parseFloat(amount) || 0;

  const computedSplits = useMemo(() => {
    const selected = Array.from(selectedMembers);
    if (selected.length === 0) return [];

    if (splitMode === "custom") {
      return selected.map((uid) => ({
        user_id: uid,
        share_amount: parseFloat(customAmounts[uid] || "0") || 0,
      }));
    }

    // Equal split
    const base = Math.floor((parsedAmount / selected.length) * 100) / 100;
    const remainder = Math.round((parsedAmount - base * selected.length) * 100) / 100;
    return selected.map((uid, i) => ({
      user_id: uid,
      share_amount: i === 0 ? base + remainder : base,
    }));
  }, [selectedMembers, splitMode, parsedAmount, customAmounts]);

  const customSum = splitMode === "custom"
    ? computedSplits.reduce((s, c) => s + c.share_amount, 0)
    : parsedAmount;
  const customValid = splitMode !== "custom" || Math.abs(customSum - parsedAmount) < 0.01;

  const canSubmit = title.trim() && parsedAmount > 0 && selectedMembers.size > 0 && customValid;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSave({
      id: editingExpense?.id,
      title: title.trim(),
      amount: parsedAmount,
      currency,
      category,
      incurred_on: incurredOn,
      payer_id: payerId,
      notes: notes.trim() || undefined,
      itinerary_item_id: itineraryItemId === "none" ? null : itineraryItemId,
      splits: computedSplits,
    });
    onOpenChange(false);
  };

  // Group itinerary items by day
  const groupedItems = useMemo(() => {
    const groups: Record<string, typeof itineraryItems> = {};
    for (const item of itineraryItems) {
      (groups[item.day_date] ||= []).push(item);
    }
    return groups;
  }, [itineraryItems]);

  const formContent = (
    <div className="space-y-4 p-4 overflow-y-auto max-h-[70vh]">
      <div className="space-y-1.5">
        <Label className="text-xs">Title *</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Airbnb deposit" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Amount *</Label>
          <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              {COMMON_CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Date</Label>
          <Input type="date" value={incurredOn} onChange={(e) => setIncurredOn(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Paid by</Label>
        <Select value={payerId} onValueChange={setPayerId}>
          <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.userId} value={m.userId}>
                {m.displayName}{m.userId === user?.id ? " (You)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Split between */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Split between</Label>
          <div className="flex gap-1">
            <Button
              type="button" size="sm" variant={splitMode === "equal" ? "default" : "outline"}
              className="h-6 text-[10px] px-2"
              onClick={() => setSplitMode("equal")}
            >Equal</Button>
            <Button
              type="button" size="sm" variant={splitMode === "custom" ? "default" : "outline"}
              className="h-6 text-[10px] px-2"
              onClick={() => setSplitMode("custom")}
            >Custom</Button>
          </div>
        </div>
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {members.map((m) => (
            <div key={m.userId} className="flex items-center gap-2">
              <Checkbox
                checked={selectedMembers.has(m.userId)}
                onCheckedChange={(checked) => {
                  const next = new Set(selectedMembers);
                  checked ? next.add(m.userId) : next.delete(m.userId);
                  setSelectedMembers(next);
                }}
              />
              <span className="text-sm flex-1 truncate">
                {m.displayName}{m.userId === user?.id ? " (You)" : ""}
              </span>
              {splitMode === "custom" && selectedMembers.has(m.userId) && (
                <Input
                  type="number" step="0.01" min="0"
                  className="w-24 h-8 text-xs"
                  value={customAmounts[m.userId] || ""}
                  onChange={(e) => setCustomAmounts({ ...customAmounts, [m.userId]: e.target.value })}
                  placeholder="0.00"
                />
              )}
            </div>
          ))}
        </div>
        {splitMode === "custom" && !customValid && (
          <p className="text-xs text-destructive">
            Amounts sum to {customSum.toFixed(2)} but total is {parsedAmount.toFixed(2)}
          </p>
        )}
      </div>

      {/* Link to itinerary */}
      {itineraryItems.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Link to activity (optional)</Label>
          <Select value={itineraryItemId} onValueChange={setItineraryItemId}>
            <SelectTrigger className="h-10"><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {Object.entries(groupedItems).map(([date, items]) => (
                items.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {format(new Date(date), "MMM d")} · {item.title}
                  </SelectItem>
                ))
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Notes (optional)</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-sm" />
      </div>

      <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full">
        {editingExpense ? "Update Expense" : "Add Expense"}
      </Button>
    </div>
  );

  const modalTitle = editingExpense ? "Edit Expense" : "Add Expense";

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{modalTitle}</DrawerTitle>
          </DrawerHeader>
          {formContent}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{modalTitle}</DialogTitle>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}
