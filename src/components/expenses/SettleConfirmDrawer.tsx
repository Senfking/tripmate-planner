import { useState, useEffect } from "react";
import { Settlement, formatCurrency } from "@/lib/settlementCalc";
import { format } from "date-fns";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { parse } from "date-fns";

interface Props {
  settlement: Settlement | null;
  currency: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: {
    title: string;
    amount: number;
    currency: string;
    category: string;
    incurred_on: string;
    payer_id: string;
    notes: string;
    splits: { user_id: string; share_amount: number }[];
  }) => void;
}

export function SettleConfirmDrawer({ settlement, currency, onOpenChange, onConfirm }: Props) {
  const isMobile = useIsMobile();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [calOpen, setCalOpen] = useState(false);

  const maxAmount = settlement?.amount ?? 0;
  const numAmount = parseFloat(amount) || 0;
  const isPartial = numAmount > 0 && numAmount < maxAmount - 0.005;
  const isValid = numAmount > 0.005 && numAmount <= maxAmount + 0.005;

  useEffect(() => {
    if (settlement) {
      setAmount(settlement.amount.toFixed(2));
      setDate(format(new Date(), "yyyy-MM-dd"));
    }
  }, [settlement]);

  const handleConfirm = () => {
    if (!settlement || !isValid) return;
    onConfirm({
      title: `${settlement.fromName} → ${settlement.toName} settlement`,
      amount: numAmount,
      currency,
      category: "settlement",
      incurred_on: date,
      payer_id: settlement.from,
      notes: `Settled on ${date}`,
      splits: [{ user_id: settlement.to, share_amount: numAmount }],
    });
  };

  const formContent = settlement ? (
    <div className="space-y-4 px-1">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{settlement.fromName}</span> paid{" "}
        <span className="font-medium text-foreground">{settlement.toName}</span>
      </p>

      <div className="space-y-1.5">
        <Label className="text-xs">Amount ({currency})</Label>
        <Input
          type="number"
          step="0.01"
          min="0.01"
          max={maxAmount.toFixed(2)}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="text-base"
        />
        {isPartial && (
          <p className="text-xs text-amber-600">
            Partial payment — remaining balance will update automatically
          </p>
        )}
        {numAmount > maxAmount + 0.005 && (
          <p className="text-xs text-destructive">
            Cannot exceed {formatCurrency(maxAmount, currency)}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Date</Label>
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start text-left font-normal h-10">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(parse(date, "yyyy-MM-dd", new Date()), "MMM d, yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={parse(date, "yyyy-MM-dd", new Date())}
              onSelect={(d) => { if (d) { setDate(format(d, "yyyy-MM-dd")); setCalOpen(false); } }}
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  ) : null;

  const open = !!settlement;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Confirm settlement</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-2">{formContent}</div>
          <DrawerFooter className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="flex-1" disabled={!isValid} onClick={handleConfirm}>
              Confirm settlement
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm settlement</DialogTitle>
        </DialogHeader>
        {formContent}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!isValid} onClick={handleConfirm}>Confirm settlement</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
