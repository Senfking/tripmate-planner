import { useState } from "react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { CalendarDays, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

type Props = {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  className?: string;
  placeholder?: string;
};

export function DateRangePicker({
  value,
  onChange,
  className,
  placeholder = "Pick dates",
}: Props) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(value);

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setDraft(value);
    }
    setOpen(isOpen);
  };

  const handleApply = () => {
    onChange(draft);
    setOpen(false);
  };

  const handleClear = () => {
    setDraft(undefined);
  };

  const label =
    value?.from && value?.to
      ? `${format(value.from, "MMM d")} – ${format(value.to, "MMM d")}`
      : value?.from
      ? `${format(value.from, "MMM d")} – …`
      : placeholder;

  const calendarContent = (
    <div className="flex flex-col items-center space-y-3">
      <Calendar
        mode="range"
        selected={draft}
        onSelect={setDraft}
        numberOfMonths={isMobile ? 1 : 2}
        defaultMonth={draft?.from ?? new Date()}
        className={cn("p-3 pointer-events-auto")}
      />
      <div className="flex items-center justify-between px-3 pb-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="text-xs gap-1 text-muted-foreground"
        >
          <X className="h-3 w-3" />
          Clear
        </Button>
        <Button
          size="sm"
          onClick={handleApply}
          disabled={!draft?.from || !draft?.to}
        >
          Apply
        </Button>
      </div>
    </div>
  );

  const trigger = (
    <Button
      variant="outline"
      className={cn(
        "justify-start text-left font-normal min-h-[44px]",
        !value?.from && "text-muted-foreground",
        className
      )}
    >
      <CalendarDays className="h-4 w-4 mr-2 shrink-0" />
      {label}
    </Button>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpen}>
        <div onClick={() => handleOpen(true)}>{trigger}</div>
        <DrawerContent className="px-2 pb-6">
          <DrawerHeader className="text-left px-2">
            <DrawerTitle>Select dates</DrawerTitle>
          </DrawerHeader>
          {calendarContent}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {calendarContent}
      </PopoverContent>
    </Popover>
  );
}
