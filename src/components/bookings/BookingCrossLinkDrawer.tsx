import { useState } from "react";
import { CalendarPlus, Receipt, Plane, Hotel, Activity, Calendar, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
  DrawerDescription, DrawerFooter, DrawerClose,
} from "@/components/ui/drawer";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import { format, parseISO, isValid } from "date-fns";
import type { AttachmentRow } from "@/hooks/useAttachments";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  attachment: AttachmentRow;
  onOpenExpenseForm?: (prefill: {
    title: string;
    amount: number;
    currency: string;
    date: string;
    category: string;
  }) => void;
}

function extractBookingFields(attachment: AttachmentRow) {
  const bd = attachment.booking_data as Record<string, unknown> | null;
  if (!bd) return null;

  const title = (bd.provider as string) || (bd.destination as string) || attachment.title;
  const checkIn = bd.check_in as string | undefined;
  const checkOut = bd.check_out as string | undefined;
  const departureTime = bd.departure_time as string | undefined;
  const arrivalTime = bd.arrival_time as string | undefined;
  const totalPrice = bd.total_price as string | undefined;
  const bookingType = (bd.booking_type as string) || attachment.type;
  const departure = bd.departure as string | undefined;
  const destination = bd.destination as string | undefined;
  const ref = bd.booking_reference as string | undefined;

  // Must have title and at least one date
  const hasDate = !!(checkIn || checkOut);
  if (!title || !hasDate) return null;

  return { title, checkIn, checkOut, departureTime, arrivalTime, totalPrice, bookingType, departure, destination, ref };
}

function fmtDate(val: string | undefined): string | null {
  if (!val) return null;
  try {
    const d = parseISO(val);
    return isValid(d) ? format(d, "EEE, MMM d") : val;
  } catch {
    return val;
  }
}

function parsePrice(priceStr: string | undefined): { amount: number; currency: string } | null {
  if (!priceStr) return null;
  const match = priceStr.match(/([A-Z€$£¥]{1,3})\s?([\d,.]+)/);
  if (match) {
    const curr = match[1].replace("€", "EUR").replace("$", "USD").replace("£", "GBP").replace("¥", "JPY");
    return { amount: parseFloat(match[2].replace(",", "")), currency: curr };
  }
  const match2 = priceStr.match(/([\d,.]+)\s?([A-Z€$£¥]{1,3})/);
  if (match2) {
    const curr = match2[2].replace("€", "EUR").replace("$", "USD").replace("£", "GBP").replace("¥", "JPY");
    return { amount: parseFloat(match2[1].replace(",", "")), currency: curr };
  }
  return null;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  flight: Plane,
  hotel: Hotel,
  activity: Activity,
};

const CATEGORY_TO_EXPENSE: Record<string, string> = {
  flight: "transport",
  hotel: "accommodation",
  activity: "activities",
  other: "other",
};

export function BookingCrossLinkDrawer({ open, onOpenChange, tripId, attachment, onOpenExpenseForm }: Props) {
  const [adding, setAdding] = useState(false);
  const qc = useQueryClient();

  const fields = extractBookingFields(attachment);
  if (!fields) return null;

  const { title, checkIn, checkOut, departureTime, arrivalTime, totalPrice, bookingType, departure, destination } = fields;
  const TypeIcon = TYPE_ICONS[bookingType] || CalendarPlus;
  const price = parsePrice(totalPrice);

  const createItineraryItems = async () => {
    const items: { title: string; day_date: string; notes: string; status: string; start_time?: string; end_time?: string }[] = [];

    if (bookingType === "hotel") {
      if (checkIn) items.push({ title: `${title} — Check-in`, day_date: checkIn, notes: totalPrice ? `Cost: ${totalPrice}` : "", status: "booked" });
      if (checkOut) items.push({ title: `${title} — Check-out`, day_date: checkOut, notes: "", status: "booked" });
    } else if (bookingType === "flight") {
      const date = checkIn || checkOut || "";
      const flightTitle = departure && destination ? `${departure} → ${destination}` : title;
      items.push({
        title: flightTitle,
        day_date: date,
        notes: [totalPrice && `Cost: ${totalPrice}`, departureTime && `Dep: ${departureTime}`, arrivalTime && `Arr: ${arrivalTime}`].filter(Boolean).join("\n"),
        status: "booked",
      });
    } else {
      const date = checkIn || checkOut || "";
      items.push({
        title,
        day_date: date,
        notes: totalPrice ? `Cost: ${totalPrice}` : "",
        status: "booked",
      });
    }

    const createdIds: string[] = [];
    for (const item of items) {
      const { data, error } = await supabase
        .from("itinerary_items")
        .insert({ trip_id: tripId, ...item } as any)
        .select("id")
        .single();
      if (error) throw error;
      createdIds.push(data.id);
    }

    // Link attachment to first itinerary item
    if (createdIds.length > 0) {
      await supabase
        .from("attachments")
        .update({ itinerary_item_id: createdIds[0] } as any)
        .eq("id", attachment.id);
    }

    return createdIds;
  };

  const handleAddToItinerary = async () => {
    setAdding(true);
    try {
      await createItineraryItems();
      trackEvent("booking_cross_link_itinerary", { trip_id: tripId, booking_type: bookingType });
      qc.invalidateQueries({ queryKey: ["itinerary", tripId] });
      qc.invalidateQueries({ queryKey: ["attachments", tripId] });
      toast.success("Added to itinerary");
      onOpenChange(false);
    } catch {
      toast.error("Failed to add to itinerary");
    } finally {
      setAdding(false);
    }
  };

  const handleAddWithExpense = async () => {
    setAdding(true);
    try {
      await createItineraryItems();
      trackEvent("booking_cross_link_itinerary_expense", { trip_id: tripId, booking_type: bookingType });
      qc.invalidateQueries({ queryKey: ["itinerary", tripId] });
      qc.invalidateQueries({ queryKey: ["attachments", tripId] });
      toast.success("Added to itinerary");
      onOpenChange(false);

      // Open expense form with pre-filled data
      if (onOpenExpenseForm && price) {
        onOpenExpenseForm({
          title,
          amount: price.amount,
          currency: price.currency,
          date: checkIn || checkOut || new Date().toISOString().slice(0, 10),
          category: CATEGORY_TO_EXPENSE[bookingType] || "other",
        });
      }
    } catch {
      toast.error("Failed to add to itinerary");
    } finally {
      setAdding(false);
    }
  };

  // Build summary items
  const summaryItems: { icon: React.ElementType; text: string }[] = [];
  if (bookingType === "flight" && departure && destination) {
    summaryItems.push({ icon: Plane, text: `${departure} → ${destination}` });
  }
  if (checkIn || checkOut) {
    const dateText = checkIn && checkOut
      ? `${fmtDate(checkIn)} – ${fmtDate(checkOut)}`
      : fmtDate(checkIn || checkOut || "");
    if (dateText) summaryItems.push({ icon: Calendar, text: dateText });
  }
  if (totalPrice) {
    summaryItems.push({ icon: CreditCard, text: totalPrice });
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle className="flex items-center gap-2">
            <TypeIcon className="h-5 w-5 text-primary" />
            Booking details found
          </DrawerTitle>
          <DrawerDescription className="text-sm">
            We found details for <span className="font-medium text-foreground">{title}</span>
          </DrawerDescription>
        </DrawerHeader>

        {/* Summary */}
        {summaryItems.length > 0 && (
          <div className="px-4 pb-2 space-y-1.5">
            {summaryItems.map((item, i) => {
              const ItemIcon = item.icon;
              return (
                <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ItemIcon className="h-4 w-4 shrink-0" />
                  <span>{item.text}</span>
                </div>
              );
            })}
          </div>
        )}

        <DrawerFooter className="pt-2 gap-2">
          <Button onClick={handleAddToItinerary} disabled={adding} className="w-full">
            <CalendarPlus className="h-4 w-4 mr-1.5" />
            {adding ? "Adding…" : "Add to itinerary"}
          </Button>
          {price && onOpenExpenseForm && (
            <Button onClick={handleAddWithExpense} disabled={adding} variant="outline" className="w-full">
              <Receipt className="h-4 w-4 mr-1.5" />
              Add to itinerary + create expense
            </Button>
          )}
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

export { extractBookingFields };
