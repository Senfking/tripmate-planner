import { useState, useEffect, useMemo, useRef } from "react";
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
import { CurrencyPicker } from "./CurrencyPicker";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Lightbulb, Camera, Image, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parse } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: MemberProfile[];
  settlementCurrency: string;
  itineraryItems: { id: string; title: string; day_date: string }[];
  usedCurrencies?: string[];
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
  itineraryItems, usedCurrencies = [], editingExpense, editingSplits, onSave,
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
  const [splitMode, setSplitMode] = useState<"equal" | "custom" | "percent">("equal");
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [settlementDismissed, setSettlementDismissed] = useState(false);
  const [titleManuallySet, setTitleManuallySet] = useState(false);
  const [scanning, setScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSettlementDismissed(false);
      setTitleManuallySet(false);
      if (editingExpense) {
        setTitle(editingExpense.title);
        setAmount(String(editingExpense.amount));
        setCurrency(editingExpense.currency);
        setCategory(editingExpense.category || "other");
        setIncurredOn(editingExpense.incurred_on);
        setPayerId(editingExpense.payer_id);
        setNotes(editingExpense.notes || "");
        setItineraryItemId(editingExpense.itinerary_item_id || "none");
        setTitleManuallySet(true);
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
        setSelectedMembers(new Set(members.filter(m => m.attendanceStatus === "going" || m.attendanceStatus === "maybe").map((m) => m.userId)));
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

  // Settlement auto-detection
  const looksLikeSettlement = useMemo(() => {
    if (category === "settlement") return false;
    if (settlementDismissed) return false;
    if (selectedMembers.size !== 1) return false;
    const soleRecipient = Array.from(selectedMembers)[0];
    if (soleRecipient === payerId) return false;
    if (parsedAmount <= 0) return false;
    return true;
  }, [category, settlementDismissed, selectedMembers, payerId, parsedAmount]);

  const soleRecipientName = useMemo(() => {
    if (!looksLikeSettlement) return "";
    const uid = Array.from(selectedMembers)[0];
    return members.find((m) => m.userId === uid)?.displayName || "Unknown";
  }, [looksLikeSettlement, selectedMembers, members]);

  const payerName = useMemo(() => {
    return members.find((m) => m.userId === payerId)?.displayName || "Unknown";
  }, [payerId, members]);

  const handleAcceptSettlement = () => {
    setCategory("settlement");
    if (!titleManuallySet || !title.trim()) {
      setTitle(`${payerName} → ${soleRecipientName}`);
    }
  };

  const handleScanReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be re-selected
    e.target.value = "";

    setScanning(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke("scan-receipt", {
        body: { image: base64 },
      });

      if (error || data?.error) {
        toast.error("Couldn't read receipt — fill in manually");
        return;
      }

      if (data.title) { setTitle(data.title); setTitleManuallySet(true); }
      if (data.amount) setAmount(String(data.amount));
      if (data.currency) setCurrency(data.currency);
      if (data.date) setIncurredOn(data.date);
      if (data.category && CATEGORIES.some(c => c.value === data.category)) {
        setCategory(data.category);
      }
      toast.success("Receipt scanned ✓");
    } catch {
      toast.error("Couldn't read receipt — fill in manually");
    } finally {
      setScanning(false);
    }
  };

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
      {/* Hidden file inputs for receipt scanning */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleScanReceipt}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleScanReceipt}
      />

      {/* AI Scan section */}
      {!editingExpense && (
        <>
          <div className="rounded-xl border border-[#0D9488]/20 bg-[#0D9488]/[0.03] p-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[#0D9488]" />
              <span className="text-[12px] font-medium text-[#0D9488]">AI-powered</span>
            </div>

            {scanning ? (
              <div className="flex items-center justify-center gap-2 py-3 text-[13px] font-medium text-[#0D9488]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Scanning receipt…
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 rounded-lg bg-white border border-[#E5E7EB] py-2.5 text-[13px] font-medium text-foreground hover:border-[#0D9488]/40 transition-colors active:scale-[0.97]"
                >
                  <Camera className="h-4 w-4 text-[#0D9488]" />
                  Take photo
                </button>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 rounded-lg bg-white border border-[#E5E7EB] py-2.5 text-[13px] font-medium text-foreground hover:border-[#0D9488]/40 transition-colors active:scale-[0.97]"
                >
                  <Image className="h-4 w-4 text-[#0D9488]" />
                  Choose photo
                </button>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[11px] text-muted-foreground">or add manually</span>
            <div className="flex-1 h-px bg-border" />
          </div>
        </>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Title *</Label>
        <Input
          value={title}
          onChange={(e) => { setTitle(e.target.value); setTitleManuallySet(true); }}
          placeholder="e.g. Airbnb deposit"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Amount *</Label>
          <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Currency</Label>
          <CurrencyPicker value={currency} onChange={setCurrency} suggestedCodes={[settlementCurrency, ...usedCurrencies.filter(c => c !== settlementCurrency)]} />
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
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn("h-10 w-full justify-start text-left font-normal", !incurredOn && "text-muted-foreground")}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {incurredOn ? format(parse(incurredOn, "yyyy-MM-dd", new Date()), "PPP") : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={incurredOn ? parse(incurredOn, "yyyy-MM-dd", new Date()) : undefined}
                onSelect={(date) => date && setIncurredOn(format(date, "yyyy-MM-dd"))}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
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

      {/* Settlement auto-detect banner */}
      {looksLikeSettlement && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800 p-2.5">
          <Lightbulb className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-amber-800 dark:text-amber-300">
              This looks like a settlement payment
            </p>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
              Mark it as a settlement?
            </p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 text-[10px] px-2 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400"
              onClick={handleAcceptSettlement}
            >
              Yes
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] px-2 text-muted-foreground"
              onClick={() => setSettlementDismissed(true)}
            >
              No
            </Button>
          </div>
        </div>
      )}

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
