import { useState } from "react";
import { CalendarPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
  DrawerDescription, DrawerFooter, DrawerClose,
} from "@/components/ui/drawer";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import { format, parseISO } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  expenseId: string;
  title: string;
  date: string; // YYYY-MM-DD
  amount: number;
  currency: string;
  category: string;
}

const CATEGORY_MAP: Record<string, string> = {
  food: "planned",
  transport: "planned",
  accommodation: "booked",
  activities: "planned",
  shopping: "idea",
  other: "idea",
};

export function ItineraryCrossLinkDrawer({
  open, onOpenChange, tripId, expenseId,
  title, date, amount, currency, category,
}: Props) {
  const [adding, setAdding] = useState(false);
  const qc = useQueryClient();

  const handleAdd = async () => {
    setAdding(true);
    try {
      const status = CATEGORY_MAP[category] || "idea";
      const { data: item, error } = await supabase
        .from("itinerary_items")
        .insert({
          trip_id: tripId,
          title,
          day_date: date,
          notes: `Expense: ${amount} ${currency}`,
          status,
        } as any)
        .select("id")
        .single();
      if (error) throw error;

      // Link the expense to the new itinerary item
      await supabase
        .from("expenses")
        .update({ itinerary_item_id: item.id } as any)
        .eq("id", expenseId);

      trackEvent("cross_link_expense_to_itinerary", { trip_id: tripId, expense_id: expenseId });
      qc.invalidateQueries({ queryKey: ["itinerary", tripId] });
      qc.invalidateQueries({ queryKey: ["expenses", tripId] });
      qc.invalidateQueries({ queryKey: ["itinerary-items-for-expenses", tripId] });
      toast.success("Added to itinerary");
      onOpenChange(false);
    } catch {
      toast.error("Failed to add to itinerary");
    } finally {
      setAdding(false);
    }
  };

  const formattedDate = (() => {
    try {
      const [y, m, d] = date.split("-").map(Number);
      return format(new Date(y, m - 1, d), "EEE, MMM d");
    } catch {
      return date;
    }
  })();

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-primary" />
            Add to itinerary?
          </DrawerTitle>
          <DrawerDescription className="text-sm">
            Add <span className="font-medium text-foreground">{title}</span> to your itinerary for{" "}
            <span className="font-medium text-foreground">{formattedDate}</span>?
          </DrawerDescription>
        </DrawerHeader>
        <DrawerFooter className="pt-2">
          <Button onClick={handleAdd} disabled={adding} className="w-full">
            {adding ? "Adding…" : "Add to itinerary"}
          </Button>
          <DrawerClose asChild>
            <Button variant="ghost" className="w-full text-muted-foreground">
              Skip
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
