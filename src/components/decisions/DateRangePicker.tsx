import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  format,
  addMonths,
  startOfMonth,
  endOfMonth,
  startOfDay,
  isSameDay,
  isBefore,
  isAfter,
  differenceInCalendarDays,
  getDay,
  getDaysInMonth,
  isSameMonth,
} from "date-fns";
import type { DateRange } from "react-day-picker";
import { CalendarDays, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

type Props = {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  className?: string;
  placeholder?: string;
};

const MAX_TRIP_DAYS = 30;
const MONTHS_TO_RENDER = 18; // ~1.5 years of forward months
const TEAL = "#0D9488";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

type MonthCell = {
  date: Date | null;
  inPast: boolean;
};

function buildMonthGrid(monthDate: Date, today: Date): MonthCell[] {
  const first = startOfMonth(monthDate);
  const leading = getDay(first); // 0=Sun
  const days = getDaysInMonth(monthDate);
  const cells: MonthCell[] = [];
  for (let i = 0; i < leading; i++) cells.push({ date: null, inPast: false });
  for (let d = 1; d <= days; d++) {
    const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), d);
    cells.push({ date, inPast: isBefore(date, today) });
  }
  // Pad to multiple of 7
  while (cells.length % 7 !== 0) cells.push({ date: null, inPast: false });
  return cells;
}

type CalendarProps = {
  draft: DateRange | undefined;
  onSelect: (d: Date) => void;
  warning: string | null;
  hoverDate: Date | null;
  setHoverDate: (d: Date | null) => void;
};

function ScrollableMonthGrid({ draft, onSelect, warning, hoverDate, setHoverDate }: CalendarProps) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const startMonth = useMemo(() => startOfMonth(today), [today]);

  const months = useMemo(
    () => Array.from({ length: MONTHS_TO_RENDER }, (_, i) => addMonths(startMonth, i)),
    [startMonth]
  );

  const from = draft?.from ? startOfDay(draft.from) : undefined;
  const to = draft?.to ? startOfDay(draft.to) : undefined;

  // For "selecting end" state — show preview range on hover
  const previewEnd = !to && from && hoverDate && isAfter(hoverDate, from) ? hoverDate : undefined;
  const effectiveTo = to ?? previewEnd;

  const isInRange = (d: Date) => {
    if (!from || !effectiveTo) return false;
    return (isAfter(d, from) || isSameDay(d, from)) && (isBefore(d, effectiveTo) || isSameDay(d, effectiveTo));
  };

  let lastRenderedYear = today.getFullYear();

  return (
    <div className="flex flex-col">
      {warning && (
        <div className="px-4 py-2 text-xs text-center font-medium text-destructive bg-destructive/10 border-b border-destructive/20">
          {warning}
        </div>
      )}
      {/* Sticky weekday header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border grid grid-cols-7 px-3 py-2">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="text-[11px] font-medium text-muted-foreground text-center">
            {w}
          </div>
        ))}
      </div>
      <div className="overflow-y-auto overscroll-contain px-3 pb-4" style={{ maxHeight: "60vh" }}>
        {months.map((m, idx) => {
          const cells = buildMonthGrid(m, today);
          const showYear = m.getFullYear() !== lastRenderedYear || idx === 0;
          if (showYear) lastRenderedYear = m.getFullYear();

          return (
            <div key={idx} className="pt-4">
              {showYear && idx !== 0 && (
                <div className="text-xs font-semibold text-muted-foreground mb-1">{m.getFullYear()}</div>
              )}
              <div className="text-sm font-semibold text-foreground mb-2 px-1">
                {format(m, "MMMM")}
              </div>
              <div className="grid grid-cols-7 gap-y-1">
                {cells.map((cell, ci) => {
                  if (!cell.date) return <div key={ci} className="h-10" />;
                  const d = cell.date;
                  const disabled = cell.inPast;
                  const isFrom = from && isSameDay(d, from);
                  const isTo = to && isSameDay(d, to);
                  const inRange = isInRange(d);
                  const isEndpoint = isFrom || isTo;
                  const isPreviewEnd = previewEnd && isSameDay(d, previewEnd);

                  // Range background segment
                  const rangeLeft = inRange && !isFrom;
                  const rangeRight = inRange && !isTo && !(isPreviewEnd && !to);

                  return (
                    <button
                      key={ci}
                      type="button"
                      disabled={disabled}
                      onClick={() => !disabled && onSelect(d)}
                      onMouseEnter={() => !disabled && setHoverDate(d)}
                      onMouseLeave={() => setHoverDate(null)}
                      className={cn(
                        "relative h-10 flex items-center justify-center text-sm transition-colors",
                        disabled && "text-muted-foreground/40 cursor-not-allowed",
                        !disabled && !isEndpoint && !inRange && "text-foreground hover:bg-muted rounded-full"
                      )}
                    >
                      {/* Range bar background */}
                      {inRange && !isEndpoint && (
                        <span
                          className="absolute inset-y-1 left-0 right-0"
                          style={{ background: `${TEAL}26` }}
                        />
                      )}
                      {/* Half-bars on endpoints to connect range */}
                      {isFrom && to && !isSameDay(from, to) && (
                        <span
                          className="absolute inset-y-1 left-1/2 right-0"
                          style={{ background: `${TEAL}26` }}
                        />
                      )}
                      {isTo && from && !isSameDay(from, to) && (
                        <span
                          className="absolute inset-y-1 left-0 right-1/2"
                          style={{ background: `${TEAL}26` }}
                        />
                      )}
                      {isPreviewEnd && from && !to && (
                        <span
                          className="absolute inset-y-1 left-0 right-1/2"
                          style={{ background: `${TEAL}26` }}
                        />
                      )}
                      {/* Endpoint circle */}
                      <span
                        className={cn(
                          "relative z-10 h-9 w-9 flex items-center justify-center rounded-full",
                          isEndpoint && "text-white font-semibold"
                        )}
                        style={isEndpoint ? { background: TEAL } : undefined}
                      >
                        {d.getDate()}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DateRangePicker({
  value,
  onChange,
  className,
  placeholder = "Pick dates",
}: Props) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(value);
  const [warning, setWarning] = useState<string | null>(null);
  const [hoverDate, setHoverDate] = useState<Date | null>(null);

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setDraft(value);
      setWarning(null);
      setHoverDate(null);
    }
    setOpen(isOpen);
  };

  const handleSelect = useCallback(
    (d: Date) => {
      setWarning(null);
      // No start, or both selected → start a new range
      if (!draft?.from || (draft.from && draft.to)) {
        setDraft({ from: d, to: undefined });
        return;
      }
      // Have start, picking end
      if (isBefore(d, draft.from)) {
        // Picked earlier than start → treat as new start
        setDraft({ from: d, to: undefined });
        return;
      }
      const span = differenceInCalendarDays(d, draft.from) + 1;
      if (span > MAX_TRIP_DAYS) {
        setWarning(`Maximum trip length is ${MAX_TRIP_DAYS} days`);
        return;
      }
      setDraft({ from: draft.from, to: d });
    },
    [draft]
  );

  const handleApply = () => {
    onChange(draft);
    setOpen(false);
  };

  const handleClear = () => {
    setDraft(undefined);
    setWarning(null);
  };

  const label =
    value?.from && value?.to
      ? `${format(value.from, "MMM d")} — ${format(value.to, "MMM d")}`
      : value?.from
      ? `${format(value.from, "MMM d")} — …`
      : placeholder;

  const trigger = (
    <Button
      type="button"
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

  const pickerBody = (
    <div className="flex flex-col w-full" style={{ width: isMobile ? "100%" : 360 }}>
      <ScrollableMonthGrid
        draft={draft}
        onSelect={handleSelect}
        warning={warning}
        hoverDate={hoverDate}
        setHoverDate={setHoverDate}
      />
      <div className="flex items-center justify-between border-t border-border px-3 py-2 bg-background">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="text-xs gap-1 text-muted-foreground"
        >
          <X className="h-3 w-3" />
          Clear
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleApply}
          disabled={!draft?.from || !draft?.to}
          style={draft?.from && draft?.to ? { background: TEAL, color: "white" } : undefined}
        >
          Apply
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div className="space-y-2">
        <div onClick={() => handleOpen(!open)}>{trigger}</div>
        {open && (
          <div className="rounded-md border bg-background overflow-hidden">
            {pickerBody}
          </div>
        )}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-auto p-0 z-[200]" align="start">
        {pickerBody}
      </PopoverContent>
    </Popover>
  );
}
